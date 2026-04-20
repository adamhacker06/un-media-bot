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
from dataclasses import asdict, dataclass
from typing import AsyncGenerator

import google.generativeai as genai
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

_pc: Pinecone | None = None
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

TONE
- Talk directly to the journalist. Use "you" and "your." Never refer to "the journalist."
- Precise, not bureaucratic. Use active voice.
- Candid, not cheerful. Treat the person you're talking to as a professional. No exclamation marks. Never say "Great question!"
- Neutral on sensitive terms: use UN official language and flag when other parties use different terms.
- Honest about limits. Say "I don't have a verified answer" rather than guessing. Always end with a document, contact, or next step.

WRITING RULES
1. Lead with the answer — facts and documents first, context after.
2. Active voice always.
3. No hedging fillers: not "I believe," "it seems," or "you might want to."
4. Name uncertainty explicitly. A confident wrong answer is worse than an honest "I don't have that."
5. Never leave you empty-handed. Every dead end ends with a next step.
6. Unpack jargon the first time only (e.g., explain "A/78/L.1" once, don't repeat).
7. Match your urgency to theirs — short when you're on deadline, fuller context when you're researching.

CITATION RULES — MANDATORY
Cite every factual claim inline, immediately after the relevant statement:
[Source: <document symbol or title>, <date> — <URL>]

- Use only URLs present in the retrieved source data. Do not fabricate or paraphrase URLs.
- If no URL is available: "Direct link unavailable — contact undocs.org or the Press Office."
- For media assets, include the direct asset URL.

CONTEXT
Answer using only the retrieved document chunks provided. If they don't contain enough to answer fully, say so clearly and tell the journalist exactly where to look next."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ASSET_TYPES = {"image", "video", "photo", "asset", "media", "graphic"}


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

        # 3. Categorise
        articles, assets, context_chunks = _categorise_matches(matches)
        log.info("Pinecone: %d chunk(s) retrieved", len(context_chunks))

        # 4. Build grounded prompt
        context_text = "\n\n---\n\n".join(context_chunks[:6]) or "No relevant documents retrieved."
        user_prompt = (
            f"Context from UN documents:\n\n{context_text}\n\n"
            f"---\n\n"
            f"Question: {user_query}\n\n"
            "Answer based on the context above, citing every factual claim."
        )

        # 5. Build Gemini conversation history
        genai.configure(api_key=config.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name=config.LLM_MODEL,
            system_instruction=SYSTEM_PROMPT,
        )

        gemini_history = [
            {"role": msg["role"], "parts": [msg["content"]]}
            for msg in history
        ]
        chat = model.start_chat(history=gemini_history)

        # 6. Stream response
        response = chat.send_message(user_prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.text})}\n\n"

        # 7. Emit sources
        yield f"data: {json.dumps({'type': 'sources', 'articles': [asdict(a) for a in articles], 'assets': [asdict(a) for a in assets]})}\n\n"
        yield "data: [DONE]\n\n"

    except Exception as exc:
        log.exception("stream_query failed")
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
