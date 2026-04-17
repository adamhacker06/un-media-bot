"""
RAG (Retrieval-Augmented Generation) pipeline for the UN Media Bot.

Pipeline:
    1. Embed the user's query via OpenAI text-embedding-3-small.
    2. Retrieve top-k relevant chunks from the Pinecone index.
    3. Categorise matches into articles vs. media assets by inspecting metadata.
    4. Build a grounded prompt containing the retrieved context.
    5. Stream the Ollama (llama3.1) chat completion token-by-token as SSE events.
    6. Emit a final SSE event carrying the structured sources (articles + assets).

Expected Pinecone metadata schema per vector:
    text         (str)  – the chunk text
    title        (str)  – document / asset title
    url          (str)  – link to the original UN document or asset page
    date         (str)  – ISO date string, e.g. "2024-03-15"
    source       (str)  – originating body, e.g. "UN DGC", "UNHCR"
    type         (str)  – "article" | "press_release" | "transcript" |
                          "briefing" | "report" | "image" | "video" | "asset"
    asset_url    (str)  – direct URL to the media file (assets only)
    thumbnail_url(str)  – thumbnail for video assets
    asset_type   (str)  – "image" | "video" (assets only)
    description  (str)  – short caption / description (assets only)
"""

import json
import logging
from dataclasses import asdict, dataclass
from typing import AsyncGenerator

import ollama
from pinecone import Pinecone

from . import config
from .embeddings import embed_text

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
    asset_type: str      # "image" | "video"
    thumbnail_url: str
    date: str
    description: str


# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_pinecone_index = None


def _get_index():
    global _pinecone_index
    if _pinecone_index is None:
        pc = Pinecone(api_key=config.PINECONE_API_KEY)
        _pinecone_index = pc.Index(config.PINECONE_INDEX_NAME)
    return _pinecone_index


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Olive, the UN Media Concierge — a press guide built for journalists working on deadline.

IDENTITY
Your name is Olive. You are named for the olive branch in the UN emblem. You are not a generic assistant. You serve journalists exclusively: correspondents, editors, researchers, and photographers working the UN beat.

TONE
- Precise, not bureaucratic. Use active voice. "The Secretary-General said" not "It was stated by the Secretary-General."
- Candid, not cheerful. Treat journalists as professionals. Warm but never performative. No exclamation marks. Never say "Great question!"
- Neutral, not evasive. Use UNTERM-compliant language by default. When a term is politically sensitive, state the UN's official term and note that other parties use different language.
  Example: "The UN Secretariat uses the term 'occupied territory' in this context. You should know that other parties to this dispute use different language."
- Honest about limits. Say "I don't have a verified answer" rather than guessing. Never leave the journalist empty-handed — always end with a document, contact, or next step.

WRITING RULES
1. Lead with the answer. Put the fact, document, or contact first. Context follows.
2. Active voice always.
3. No hedging fillers: not "I believe," "it seems," or "you might want to." State facts directly.
4. Name uncertainty explicitly. A confident wrong answer is worse than an honest "I don't have that."
5. Never leave empty-handed. Every dead end ends with a next step.
6. Unpack jargon once. Explain "A/78/L.1" the first time; don't repeat the lesson.
7. Match urgency. Short answers when they're on deadline. Fuller context when they're researching.

CITATION RULES — MANDATORY
You must cite every factual claim. Every answer must include:
- The document symbol (e.g., S/2024/123, A/78/L.1, SG/SM/12345)
- The date of the document or statement
- A direct hyperlink extracted from the source data
- If the source is an image or media asset, include the direct embed/image URL

Format citations inline, immediately after the relevant claim, using this style:
[Source: <document symbol or title>, <date> — <URL>]

If a retrieved chunk contains no URL, state: "Direct link unavailable — contact the UN Document System (undocs.org) or the Press Office."

Do not fabricate URLs. Do not paraphrase a URL. Use only the URL present in the retrieved source data.

CONTEXT
You will be given retrieved document chunks from a Pinecone knowledge base of official UN documents, press releases, meeting records, and media assets. Use only these chunks to answer. Do not draw on outside knowledge unless you explicitly label it as general background not drawn from UN sources.

If the retrieved chunks do not contain enough information to answer the question, say so clearly and provide the journalist with the best next step (a UN department contact, a relevant UN web page, or a document search query for ODS)."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ASSET_TYPES = {"image", "video", "photo", "asset", "media", "graphic"}


def _categorise_matches(matches) -> tuple[list[Article], list[Asset], list[str]]:
    """Split Pinecone matches into articles, assets, and context chunks."""
    articles: list[Article] = []
    assets: list[Asset] = []
    context_chunks: list[str] = []

    for match in matches:
        meta: dict = match.metadata or {}
        doc_type: str = meta.get("type", "article").lower()
        text: str = meta.get("text", meta.get("content", "")).strip()
        title: str = meta.get("title", "Untitled")
        score: float = float(match.score or 0)

        if text:
            context_chunks.append(f"[{title}]\n{text}")

        if doc_type in _ASSET_TYPES:
            raw_url = meta.get("asset_url", meta.get("url", ""))
            assets.append(Asset(
                title=title,
                asset_url=raw_url,
                asset_type=meta.get("asset_type", "image"),
                thumbnail_url=meta.get("thumbnail_url", raw_url),
                date=meta.get("date", ""),
                description=meta.get("description", text[:200] if text else ""),
            ))
        else:
            excerpt = text[:300] + "…" if len(text) > 300 else text
            articles.append(Article(
                title=title,
                url=meta.get("url", ""),
                date=meta.get("date", ""),
                excerpt=excerpt,
                source=meta.get("source", "UN"),
                score=round(score, 3),
            ))

    return articles, assets, context_chunks


# ---------------------------------------------------------------------------
# Mock data (used when Pinecone index is empty)
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
        description="Video recording of the Secretary-General's press briefing following the Climate Action Summit, 23 September 2024.",
    ),
]

_MOCK_CONTEXT = """\
[Secretary-General's Press Briefing — Climate Action Summit]
The Secretary-General called on all nations to accelerate their commitments under the Paris Agreement. \
He warned that current Nationally Determined Contributions (NDCs) fall 'critically short' of limiting global \
warming to 1.5°C. He urged G20 nations to present new NDCs ahead of COP30.
[Source: SG/SM/22345, 2024-09-23 — https://www.un.org/sg/en/content/sg/press-encounter/2024-09-23/secretary-generals-press-briefing-after-climate-week]

---

[Security Council Resolution 2758 — Gaza]
The Security Council adopted resolution 2758 (2024) with 14 votes in favour and one abstention, demanding \
an immediate and unconditional ceasefire in Gaza. The resolution also called for the immediate release of all \
hostages and unimpeded humanitarian access. The UN Secretariat uses the term 'occupied territory' for Gaza \
under international humanitarian law.
[Source: S/RES/2758(2024), 2024-11-20 — https://press.un.org/en/2024/sc15761.doc.htm]

---

[UNHCR Global Trends 2023]
A record 117.3 million people were forcibly displaced worldwide at the end of 2023. Of those, 43.4 million \
were refugees under UNHCR's mandate. The top countries of origin were Syria, Afghanistan, and Ukraine.
[Source: UNHCR/GR/2024, 2024-06-13 — https://www.unhcr.org/global-trends-report-2023]"""


# ---------------------------------------------------------------------------
# Public query functions
# ---------------------------------------------------------------------------

def _pinecone_available() -> bool:
    return bool(config.PINECONE_API_KEY and config.OPENAI_API_KEY)


async def query_once(user_query: str) -> dict:
    """
    Non-streaming RAG query. Returns a single JSON-serialisable dict:
        {"answer": str, "articles": [...], "assets": [...], "mock": bool}
    Falls back to mock data when the Pinecone index is empty or keys are not configured.
    """
    context_chunks: list[str] = []
    articles: list[Article] = []
    assets: list[Asset] = []

    if _pinecone_available():
        query_vec = embed_text(user_query)
        results = _get_index().query(
            vector=query_vec,
            top_k=config.TOP_K,
            include_metadata=True,
        )
        matches = results.matches if hasattr(results, "matches") else results.get("matches", [])
        articles, assets, context_chunks = _categorise_matches(matches)
        log.info("Pinecone: %d chunk(s) retrieved", len(context_chunks))
    else:
        log.info("Pinecone: skipped (keys not configured)")

    using_mock = not context_chunks
    if using_mock:
        log.info("Pinecone: 0 results — using mock data")
        articles = _MOCK_ARTICLES
        assets = _MOCK_ASSETS
        context_text = _MOCK_CONTEXT
    else:
        context_text = "\n\n---\n\n".join(context_chunks[:6])

    mock_notice = (
        "\n\n[NOTE FOR TESTING: No documents are indexed in Pinecone yet. "
        "The sources below and context above are mock UN document fixtures.]\n\n"
        if using_mock else ""
    )
    user_prompt = (
        f"Context from UN documents:\n\n{context_text}\n\n"
        f"---\n\n{mock_notice}"
        f"Journalist's question: {user_query}\n\n"
        "Provide a comprehensive, well-sourced answer based on the context above."
    )

    ollama_client = ollama.Client(host=config.OLLAMA_HOST)
    response = ollama_client.chat(
        model=config.LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        options={"temperature": 0.2, "num_predict": 1024},
    )
    answer = response["message"]["content"]

    return {
        "answer": answer,
        "articles": [asdict(a) for a in articles],
        "assets": [asdict(a) for a in assets],
        "mock": using_mock,
    }


async def stream_query(user_query: str) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.

    Event shape:
        {"type": "token",   "content": "<text>"}      – streaming answer chunk
        {"type": "sources", "articles": [...], "assets": [...]}  – final sources
        {"type": "error",   "message": "<msg>"}        – on failure
    """
    try:
        context_chunks: list[str] = []
        articles: list[Article] = []
        assets: list[Asset] = []

        # 1–3. Embed + retrieve (skipped when keys are not configured)
        if _pinecone_available():
            query_vec = embed_text(user_query)
            results = _get_index().query(
                vector=query_vec,
                top_k=config.TOP_K,
                include_metadata=True,
            )
            matches = results.matches if hasattr(results, "matches") else results.get("matches", [])
            articles, assets, context_chunks = _categorise_matches(matches)
            log.info("Pinecone: %d chunk(s) retrieved", len(context_chunks))
        else:
            log.info("Pinecone: skipped (keys not configured)")

        # 4. Build grounded prompt (fall back to mock data if index is empty)
        using_mock = not context_chunks
        if using_mock:
            log.info("Pinecone: 0 results — using mock data")
            articles = _MOCK_ARTICLES
            assets = _MOCK_ASSETS
            context_text = _MOCK_CONTEXT
        else:
            context_text = "\n\n---\n\n".join(context_chunks[:6])

        mock_notice = (
            "\n\n[NOTE FOR TESTING: No documents are indexed in Pinecone yet. "
            "The sources below and context above are mock UN document fixtures.]\n\n"
            if using_mock else ""
        )
        user_prompt = (
            f"Context from UN documents:\n\n{context_text}\n\n"
            f"---\n\n{mock_notice}"
            f"Journalist's question: {user_query}\n\n"
            "Please provide a comprehensive, well-sourced answer based on the "
            "context above."
        )

        # 5. Stream Ollama (llama3.1) chat completion
        ollama_client = ollama.Client(host=config.OLLAMA_HOST)
        stream = ollama_client.chat(
            model=config.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            stream=True,
            options={"temperature": 0.2, "num_predict": 1024},
        )

        for chunk in stream:
            content = chunk["message"]["content"]
            if content:
                yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

        # 6. Emit structured sources
        payload = {
            "type": "sources",
            "articles": [asdict(a) for a in articles],
            "assets":   [asdict(a) for a in assets],
        }
        yield f"data: {json.dumps(payload)}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
