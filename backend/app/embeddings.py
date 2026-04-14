"""
Embedding helpers for the UN Media Bot.

Thin wrapper around the OpenAI embeddings API (`text-embedding-3-small`)
used in two places:

    - Ingestion time: `data/ingest.py` embeds chunks of UN documents in
      batches before upserting them to Pinecone.
    - Query time: `rag.py` embeds the user's question to retrieve
      relevant context from Pinecone.

Keeping both paths in one module ensures the ingestion and query
embeddings always come from the same model and the same preprocessing.

TODO:
    - `embed_text(text: str) -> list[float]`
    - `embed_batch(texts: list[str]) -> list[list[float]]`
"""
