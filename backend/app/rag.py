"""
RAG (Retrieval-Augmented Generation) pipeline for the UN Media Bot.

Pipeline:
    1. Embed the user's query via OpenAI text-embedding-3-small.
    2. Retrieve top-k relevant chunks from the Pinecone index.
    3. Categorise matches into articles vs. media assets by inspecting metadata.
    4. Build a grounded prompt containing the retrieved context.
    5. Stream the OpenAI chat completion token-by-token as SSE events.
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
from dataclasses import asdict, dataclass
from typing import AsyncGenerator

from openai import OpenAI
from pinecone import Pinecone

from . import config
from .embeddings import embed_text

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

_openai: OpenAI | None = None
_pinecone_index = None


def _get_openai() -> OpenAI:
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=config.OPENAI_API_KEY)
    return _openai


def _get_index():
    global _pinecone_index
    if _pinecone_index is None:
        pc = Pinecone(api_key=config.PINECONE_API_KEY)
        _pinecone_index = pc.Index(config.PINECONE_INDEX_NAME)
    return _pinecone_index


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert UN press room assistant helping journalists \
find information quickly and accurately.

You have access to UN press releases, Secretary-General briefings, Security \
Council transcripts, UNHCR reports, GA resolutions, and multimedia asset metadata.

Answer questions with:
- A direct, journalist-ready answer
- Key facts, figures, and dates when present in the context
- Proper attribution when citing specific documents (e.g. "According to the \
SG briefing on 12 March…")
- Clear structure using short paragraphs — journalists need to scan fast

If the context does not contain enough information to answer confidently, say so \
rather than hallucinating. Keep the tone factual and professional."""


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
# Public streaming function
# ---------------------------------------------------------------------------

async def stream_query(user_query: str) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.

    Event shape:
        {"type": "token",   "content": "<text>"}      – streaming answer chunk
        {"type": "sources", "articles": [...], "assets": [...]}  – final sources
        {"type": "error",   "message": "<msg>"}        – on failure
    """
    try:
        # 1. Embed query
        query_vec = embed_text(user_query)

        # 2. Retrieve from Pinecone
        results = _get_index().query(
            vector=query_vec,
            top_k=config.TOP_K,
            include_metadata=True,
        )
        matches = results.matches if hasattr(results, "matches") else results.get("matches", [])

        # 3. Categorise
        articles, assets, context_chunks = _categorise_matches(matches)

        # 4. Build grounded prompt (cap at 6 chunks to stay within token budget)
        context_text = "\n\n---\n\n".join(context_chunks[:6]) or "No context retrieved."
        user_prompt = (
            f"Context from UN documents:\n\n{context_text}\n\n"
            f"---\n\nJournalist's question: {user_query}\n\n"
            "Please provide a comprehensive, well-sourced answer based on the "
            "context above."
        )

        # 5. Stream OpenAI chat completion
        stream = _get_openai().chat.completions.create(
            model=config.LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            stream=True,
            temperature=0.2,
            max_tokens=1024,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"data: {json.dumps({'type': 'token', 'content': delta.content})}\n\n"

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
