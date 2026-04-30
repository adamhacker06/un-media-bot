"""
RAG pipeline for the UN Media Bot.

Pipeline:
    1. Embed the user query via Pinecone Inference API.
    2. Retrieve top-k relevant chunks from the Pinecone index.
    3. Categorise matches into articles vs. media assets.
    4. Build a grounded prompt with retrieved context.
    5. Stream the Gemini chat completion token-by-token as SSE events.
    6. Emit a final SSE event with structured sources (articles + assets).

Pinecone metadata schema per vector:
    text          (str) – chunk text
    title         (str) – document / asset title
    url           (str) – link to original UN document
    date          (str) – ISO date string
    source        (str) – originating body, e.g. "UN DGC", "UNHCR"
    type          (str) – "article" | "press_release" | "transcript" |
                          "briefing" | "report" | "image" | "video" | "asset"
    asset_url     (str) – direct URL to media file (assets only)
    thumbnail_url (str) – thumbnail for video assets
    asset_type    (str) – "image" | "video" (assets only)
    description   (str) – caption / description (assets only)
"""

import json
import logging
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import AsyncGenerator, Optional

from openai import OpenAI
from pinecone import Pinecone

from . import config

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Article:
    title: str
    url: str
    date: str
    excerpt: str
    source: str
    score: float


@dataclass
class Asset:
    title: str
    asset_url: str
    asset_type: str
    thumbnail_url: str
    date: str
    description: str


# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_pc: Optional[Pinecone] = None
_pinecone_index = None


def _get_pc() -> Pinecone:
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=config.PINECONE_API_KEY)
    return _pc


def _get_index():
    global _pinecone_index
    if _pinecone_index is None:
        _pinecone_index = _get_pc().Index(config.PINECONE_INDEX_NAME)
    return _pinecone_index


def _embed_query(text: str) -> list[float]:
    """Embed text using Pinecone's hosted inference API."""
    result = _get_pc().inference.embed(
        model=config.PINECONE_EMBED_MODEL,
        inputs=[text],
        parameters={"input_type": "query", "truncate": "END"},
    )
    return result[0].values


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Olive, the UN Media Concierge — a press assistant built for journalists working on deadline.

TODAY'S DATE: {today}
Use this to resolve relative date references like "yesterday", "last Tuesday", or "two weeks ago". When the user uses a relative reference, state the resolved absolute date in your answer.

FIRST MESSAGE RULE — MANDATORY
When the conversation has no prior exchanges (the user message is the very first query), begin your response with exactly this line:
"Hi, I'm Olive!"
Do NOT add this greeting on any subsequent turn. If prior messages exist in the thread, jump straight to the answer.

TONE
- Talk directly to the journalist. Use "you" and "your." Never refer to "the journalist."
- Precise, not bureaucratic. Use active voice.
- Candid, not cheerful. Treat the person you're talking to as a professional. No exclamation marks. Never say "Great question!"
- Neutral on sensitive terms: use UN official language and flag when other parties use different terms.
- Honest about limits. Say "I don't have a verified answer" rather than guessing. Always end with a document, contact, or next step.
- Speak as a knowledgeable colleague with limits, not as a database lookup. NEVER say "the sources provided", "the materials I have", "the documents available to me", "based on the information above", "according to my context", or any phrasing that reveals you are reading from a retrieval system. If you can't answer, just say so plainly.

WRITING RULES
1. Lead with the answer — facts and documents first, context after.
2. Active voice always.
3. No hedging fillers: not "I believe," "it seems," or "you might want to."
4. Name uncertainty explicitly. A confident wrong answer is worse than an honest "I don't have that."
5. Never leave you empty-handed. Every dead end ends with a next step.
6. Unpack jargon the first time only (e.g., explain "A/78/L.1" once, don't repeat).
7. Match your urgency to theirs — short when you're on deadline, fuller context when you're researching.
8. Bold the substantive facts a journalist would pull for a headline using markdown **...** — concrete statistics and figures (e.g. **$1.3 billion**, **2,260 protected sites**, **$2.2 trillion**), named policy decisions, key country/organization actions, or short verbatim quoted phrases from named officials. Most paragraphs should contain at least one bolded phrase so the journalist can scan for the substance. Do NOT bold dates, time references (e.g. "this month", "yesterday"), common phrases, generic statements, or whole sentences.

GROUNDING — NON-NEGOTIABLE
1. The numbered source chunks below are your ONLY knowledge base. Do NOT use training data, general world knowledge, or any external information — even if you "know" something is true.
2. Every factual statement (names, dates, figures, quotes, policies) must come from a specific numbered chunk. If you cannot trace a claim to a chunk, omit it.
3. NEVER invent quotes. Quotation marks ("...") may ONLY enclose text that appears VERBATIM in a numbered chunk. If you cannot find the exact phrase in any chunk, paraphrase the chunk's actual wording WITHOUT quotation marks. Do NOT pattern-match against famous quotes you remember from training.
4. If you do not have enough information to answer, say so plainly — for example: "I don't have enough information to answer this confidently." Then suggest where the journalist could look (UN body, document type, or contact). Do NOT reference "sources," "chunks," or "the materials provided" — speak as an assistant with limits, not as a retrieval system.
5. Do not extrapolate, infer beyond the chunks, or fill gaps with plausible-sounding facts. If it is not in a chunk, it is not in the answer.
6. Do NOT include inline citation markers like [1], [2], or [Source N] in your answer. Do NOT write out source titles, dates, or URLs inline. Just write the answer in clean prose — the journalist sees the source list separately in the UI.

TEMPORAL ACCURACY
1. When the user asks about a specific date or time window, identify which chunks actually cover that date.
2. A document published on date Y is NOT automatically a source about events on date X. Do not cite a chunk as authoritative for a date the chunk does not discuss.
3. If the available information is from a different time period than the question, flag this without referencing "sources" — for example: "The most recent confirmed information I have is from [date], which may not reflect [requested date]."

"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ASSET_TYPES = {"image", "video", "photo", "asset", "media", "graphic"}


def _source_display_name(source_field: str) -> str:
    """Convert a URL or body name to a short display label."""
    if not source_field or not source_field.startswith("http"):
        return source_field or "UN"
    from urllib.parse import urlparse
    host = urlparse(source_field).netloc.lower().removeprefix("www.")
    _HOST_MAP = {
        "news.un.org": "UN News",
        "press.un.org": "UN Press",
        "media.un.org": "UN Media",
        "un.org": "UN",
        "unhcr.org": "UNHCR",
        "unicef.org": "UNICEF",
        "wfp.org": "WFP",
        "who.int": "WHO",
    }
    for domain, label in _HOST_MAP.items():
        if host.endswith(domain):
            return label
    return host


def _resolve_url(meta: dict) -> str:
    """
    Return the best external URL from metadata, or empty string.
    Rejects: relative paths, non-HTTP values, localhost URLs — all of these
    cause the browser to resolve the link against the current portal page.
    Priority: url field → source field (only if external HTTP) → empty
    """
    for key in ("url", "source"):
        val = (meta.get(key) or "").strip()
        if (val.startswith("http://") or val.startswith("https://")) and "localhost" not in val:
            return val
    return ""


def _categorise_matches(matches) -> tuple[list[Article], list[Asset], list[str]]:
    articles: list[Article] = []
    assets: list[Asset] = []
    context_chunks: list[str] = []

    for match in matches:
        meta: dict = match.metadata or {}
        doc_type: str = meta.get("type", "article").lower()
        text: str = meta.get("text", meta.get("content", "")).strip()
        title: str = meta.get("title", "Untitled")
        score: float = float(match.score or 0)
        url: str = _resolve_url(meta)
        raw_source: str = meta.get("source", "")
        source_label: str = _source_display_name(raw_source)

        log.debug(
            "  match id=%-40s score=%.3f type=%-12s url=%s title=%s",
            getattr(match, "id", "?"), score, doc_type,
            url or "[MISSING]", title[:60],
        )
        if not url:
            log.warning("Retrieved record '%s' has no external URL (source=%r, url=%r)",
                        title[:60], meta.get("source"), meta.get("url"))

        if text:
            context_chunks.append(f"[{title}]\n{text}")

        if doc_type in _ASSET_TYPES:
            raw_asset_url = meta.get("asset_url", url)
            assets.append(Asset(
                title=title,
                asset_url=raw_asset_url,
                asset_type=meta.get("asset_type", "image"),
                thumbnail_url=meta.get("thumbnail_url", raw_asset_url),
                date=meta.get("date", ""),
                description=meta.get("description", text[:200] if text else ""),
            ))
        else:
            excerpt = text[:300] + "…" if len(text) > 300 else text
            articles.append(Article(
                title=title,
                url=url,
                date=meta.get("date", ""),
                excerpt=excerpt,
                source=source_label,
                score=round(score, 3),
            ))

    return articles, assets, context_chunks


# ---------------------------------------------------------------------------
# Mock data (fallback when Pinecone index is empty)
# ---------------------------------------------------------------------------

_MOCK_ARTICLES = [
    Article(
        title="Secretary-General's Press Briefing — Climate Action Summit",
        url="https://www.un.org/sg/en/content/sg/press-encounter/2024-09-23/secretary-generals-press-briefing-after-climate-week",
        date="2024-09-23",
        excerpt="The Secretary-General called on all nations to accelerate commitments under the Paris Agreement, warning that current pledges fall 'critically short' of the 1.5°C pathway.",
        source="UN DGC",
        score=0.95,
    ),
    Article(
        title="Security Council Adopts Resolution 2758 on Gaza Ceasefire",
        url="https://press.un.org/en/2024/sc15761.doc.htm",
        date="2024-11-20",
        excerpt="The Security Council adopted resolution 2758 (2024) demanding an immediate ceasefire in Gaza and unimpeded humanitarian access throughout the territory.",
        source="Security Council",
        score=0.88,
    ),
    Article(
        title="UNHCR Global Trends Report 2023: Forced Displacement",
        url="https://www.unhcr.org/global-trends-report-2023",
        date="2024-06-13",
        excerpt="A record 117.3 million people were forcibly displaced worldwide as of end-2023, driven by conflict, violence, and climate-related disasters.",
        source="UNHCR",
        score=0.81,
    ),
]

_MOCK_ASSETS = [
    Asset(
        title="SG Press Conference — Climate Week 2024",
        asset_url="https://media.un.org/en/asset/k1s/k1sabc1234",
        asset_type="video",
        thumbnail_url="https://media.un.org/asset/k1s/k1sabc1234/thumbnail.jpg",
        date="2024-09-23",
        description="Video recording of the Secretary-General's press briefing following the Climate Action Summit.",
    ),
]

_MOCK_CONTEXT = """\
[Secretary-General's Press Briefing — Climate Action Summit]
The Secretary-General called on all nations to accelerate their commitments under the Paris Agreement. \
He warned that current Nationally Determined Contributions (NDCs) fall 'critically short' of limiting \
global warming to 1.5°C. He urged G20 nations to present new NDCs ahead of COP30.
[Source: SG/SM/22345, 2024-09-23 — https://www.un.org/sg/en/content/sg/press-encounter/2024-09-23/secretary-generals-press-briefing-after-climate-week]

---

[Security Council Resolution 2758 — Gaza]
The Security Council adopted resolution 2758 (2024) with 14 votes in favour and one abstention, demanding \
an immediate and unconditional ceasefire in Gaza. The resolution called for the immediate release of all \
hostages and unimpeded humanitarian access. The UN Secretariat uses the term 'occupied territory' for Gaza \
under international humanitarian law.
[Source: S/RES/2758(2024), 2024-11-20 — https://press.un.org/en/2024/sc15761.doc.htm]

---

[UNHCR Global Trends 2023]
A record 117.3 million people were forcibly displaced worldwide at the end of 2023. Of those, 43.4 million \
were refugees under UNHCR's mandate. The top countries of origin were Syria, Afghanistan, and Ukraine.
[Source: UNHCR/GR/2024, 2024-06-13 — https://www.unhcr.org/global-trends-report-2023]"""


# ---------------------------------------------------------------------------
# Public streaming function
# ---------------------------------------------------------------------------

async def stream_query(
    user_query: str,
    history: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Yields SSE-formatted strings:
        {"type": "token",   "content": "..."}
        {"type": "sources", "articles": [...], "assets": [...]}
        {"type": "error",   "message": "..."}

    history: list of {"role": "user"|"model", "content": "..."} dicts
    """
    try:
        # 1. Embed via Pinecone inference
        query_vec = _embed_query(user_query)

        # 2. Retrieve from Pinecone
        results = _get_index().query(
            vector=query_vec,
            top_k=config.TOP_K,
            include_metadata=True,
        )
        matches = results.matches if hasattr(results, "matches") else results.get("matches", [])

        # 3. Categorise + log every record
        log.info("=== Pinecone retrieval for: %r ===", user_query[:80])
        log.info("  total matches returned: %d", len(matches))
        articles, assets, context_chunks = _categorise_matches(matches)
        log.info(
            "  categorised → %d article(s), %d asset(s), %d chunk(s)",
            len(articles), len(assets), len(context_chunks),
        )
        missing_url_count = sum(1 for a in articles if not a.url)
        if missing_url_count:
            log.warning("  %d article(s) have no external URL — citations will be non-clickable",
                        missing_url_count)

        # 4. Fall back to mock data if index is empty
        using_mock = not context_chunks
        if using_mock:
            log.info("Pinecone returned 0 results — using mock fixtures")
            articles = _MOCK_ARTICLES
            assets   = _MOCK_ASSETS
            context_text = _MOCK_CONTEXT + "\n\n[NOTE: These are sample fixtures — no live documents are indexed yet.]"
        else:
            # Prefer chunks from different document titles to maximise source diversity
            used_chunks: list[str] = []
            seen_titles: set[str] = set()
            leftover: list[str] = []
            for chunk in context_chunks:
                title = chunk.split('\n')[0].strip('[]')
                if title not in seen_titles:
                    seen_titles.add(title)
                    used_chunks.append(chunk)
                else:
                    leftover.append(chunk)
                if len(used_chunks) >= 6:
                    break
            # Fill remaining slots from same sources if needed
            for chunk in leftover:
                if len(used_chunks) >= 6:
                    break
                used_chunks.append(chunk)

            # Number chunks by unique source title so the LLM can cite as [1], [2], etc.
            ordered_articles: list[Article] = []
            title_to_num: dict[str, int] = {}
            for chunk in used_chunks:
                title = chunk.split('\n')[0].strip('[]')
                if title not in title_to_num:
                    matched = next((a for a in articles if a.title == title), None)
                    if matched:
                        title_to_num[title] = len(ordered_articles) + 1
                        ordered_articles.append(matched)

            numbered_parts = []
            for chunk in used_chunks:
                title = chunk.split('\n')[0].strip('[]')
                num = title_to_num.get(title, "?")
                numbered_parts.append(f"[Source {num}] {chunk}")

            context_text = "\n\n---\n\n".join(numbered_parts)
            articles = ordered_articles

        user_prompt = (
            f"Context from UN documents:\n\n{context_text}\n\n"
            f"---\n\n"
            f"Question: {user_query}\n\n"
            "Answer using only what is provided above. Do not include inline citation markers, and do not say things like 'the sources provided', 'the materials I have', or 'based on the information above' — write clean prose as a knowledgeable assistant."
        )

        # 5. Build message list for Groq (OpenAI-compatible)
        is_first_message = len(history) == 0
        today_str = datetime.now().strftime("%A, %B %d, %Y")
        groq = OpenAI(
            api_key=config.GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
            max_retries=1,
            timeout=60.0,
        )

        messages = [{"role": "system", "content": SYSTEM_PROMPT.format(today=today_str)}]
        for msg in history:
            role = "assistant" if msg["role"] == "model" else msg["role"]
            messages.append({"role": role, "content": msg["content"]})

        # Reinforce the first-message greeting so the model doesn't skip it
        if is_first_message:
            user_prompt = (
                "[SYSTEM NOTE: This is the user's first message. "
                "Your response MUST begin with 'Hi, I'm Olive!' before anything else.]\n\n"
                + user_prompt
            )

        messages.append({"role": "user", "content": user_prompt})

        # 6. Stream response
        log.info("LLM call starting (model=%s)", config.LLM_MODEL)
        t0 = time.monotonic()
        stream = groq.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            stream=True,
            temperature=0.1,
            max_tokens=1024,
        )
        first_token_at = None
        for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                if first_token_at is None:
                    first_token_at = time.monotonic() - t0
                    log.info("LLM first token after %.2fs", first_token_at)
                yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
        log.info(
            "LLM call complete in %.2fs (first token at %.2fs)",
            time.monotonic() - t0,
            first_token_at if first_token_at is not None else -1.0,
        )

        # 7. Emit sources
        yield f"data: {json.dumps({'type': 'sources', 'articles': [asdict(a) for a in articles], 'assets': [asdict(a) for a in assets]})}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as exc:
        log.exception("stream_query failed")
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
