"""
Ingestion script for the UN Media Bot.

Walks data/raw/, processes each source document, and upserts vectors
into Pinecone so the RAG pipeline can retrieve them at query time.

Supported file types:
    .txt  – plain text (press releases, transcripts)
    .json – structured metadata + text (e.g. asset records)

Metadata stored per chunk:
    text        – the chunk content
    title       – document title
    url         – link to original document
    date        – ISO date string
    source      – originating body (e.g. "UN DGC")
    type        – "article" | "press_release" | "transcript" |
                  "briefing" | "image" | "video"
    asset_url   – for media assets
    thumbnail_url
    asset_type
    description

Run:
    cd un-media-bot
    python data/ingest.py
"""

import json
import os
import sys
import uuid
from pathlib import Path

# Allow importing backend modules from repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import config
from backend.app.embeddings import embed_batch
from pinecone import Pinecone

RAW_DIR = Path(__file__).parent / "raw"
PROCESSED_DIR = Path(__file__).parent / "processed"
CHUNK_SIZE = 500          # characters per chunk
CHUNK_OVERLAP = 50        # overlap between adjacent chunks
BATCH_SIZE = 100          # vectors per Pinecone upsert call


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end].strip())
        start += size - overlap
    return [c for c in chunks if len(c) > 30]


def load_documents(raw_dir: Path) -> list[dict]:
    """Load all documents from raw_dir. Returns list of metadata dicts with a 'text' key."""
    docs = []
    for path in sorted(raw_dir.iterdir()):
        if path.suffix == ".txt":
            text = path.read_text(encoding="utf-8").strip()
            docs.append({
                "text": text,
                "title": path.stem.replace("_", " ").title(),
                "url": "",
                "date": "",
                "source": "UN DGC",
                "type": "article",
            })
        elif path.suffix == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                docs.extend(data)
            else:
                docs.append(data)
    return docs


def ingest():
    pc = Pinecone(api_key=config.PINECONE_API_KEY)
    index = pc.Index(config.PINECONE_INDEX_NAME)

    documents = load_documents(RAW_DIR)
    if not documents:
        print("No documents found in data/raw/. Add .txt or .json files and re-run.")
        return

    vectors = []
    for doc in documents:
        text = doc.get("text", "")
        meta_base = {k: v for k, v in doc.items() if k != "text"}

        for chunk in chunk_text(text):
            vectors.append({
                "id": str(uuid.uuid4()),
                "text": chunk,
                "meta": {**meta_base, "text": chunk},
            })

    print(f"Embedding {len(vectors)} chunks from {len(documents)} documents…")
    texts = [v["text"] for v in vectors]

    # Embed in batches
    embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        embeddings.extend(embed_batch(batch))
        print(f"  embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")

    # Upsert to Pinecone in batches
    upsert_batch = []
    for vec, emb in zip(vectors, embeddings):
        upsert_batch.append((vec["id"], emb, vec["meta"]))
        if len(upsert_batch) >= BATCH_SIZE:
            index.upsert(vectors=upsert_batch)
            upsert_batch = []
    if upsert_batch:
        index.upsert(vectors=upsert_batch)

    print(f"Done. Upserted {len(vectors)} vectors to index '{config.PINECONE_INDEX_NAME}'.")

    # Write processed chunks for inspection
    PROCESSED_DIR.mkdir(exist_ok=True)
    (PROCESSED_DIR / "chunks.json").write_text(
        json.dumps([{"id": v["id"], "meta": v["meta"]} for v in vectors], indent=2),
        encoding="utf-8",
    )
    print(f"Chunk metadata written to data/processed/chunks.json")


if __name__ == "__main__":
    ingest()
