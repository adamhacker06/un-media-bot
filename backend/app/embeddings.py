"""
Embedding helpers for the UN Media Bot.

Thin wrapper around the OpenAI embeddings API (`text-embedding-3-small`).
Used both at ingestion time and at query time so both paths always use
the same model and preprocessing.
"""

from openai import OpenAI

from . import config

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def embed_text(text: str) -> list[float]:
    """Embed a single string and return the vector."""
    response = _get_client().embeddings.create(
        model=config.EMBEDDING_MODEL,
        input=text,
    )
    return response.data[0].embedding


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Embed a list of strings in one API call and return all vectors."""
    response = _get_client().embeddings.create(
        model=config.EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]
