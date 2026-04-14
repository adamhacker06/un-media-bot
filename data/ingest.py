"""
Ingestion script for the UN Media Bot.

Walks `data/raw/`, processes each source document (PDFs, transcripts,
press releases), and populates the Pinecone index so the RAG pipeline
can retrieve from it at query time.

Pipeline:
    1. Load each document from `data/raw/`.
    2. Clean and chunk the text (preserving source metadata: title,
       URL, date, document type). Write intermediate chunked text to
       `data/processed/` for inspection/debugging.
    3. Embed the chunks via `backend.app.embeddings.embed_batch`.
    4. Upsert the vectors (with metadata) to the Pinecone index named
       by `backend.app.config.PINECONE_INDEX_NAME`.

Run manually:
    python data/ingest.py

TODO: implement chunking + upsert.
"""
