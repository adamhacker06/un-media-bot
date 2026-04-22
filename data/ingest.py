"""
Ingestion script for the UN Media Bot.

Walks data/raw/ and upserts pre-chunked JSON vectors into Pinecone.

Expected JSON format (single object or array of objects):
    {
        "id":       "news-2528_chunk_0",      # stable chunk ID
        "text":     "...",                    # chunk text
        "metadata": {
            "source": "https://...",          # document URL (may also serve as url)
            "type":   "article",
            "date":   "2026-04-11",
            "title":  "...",
            "chunk_index": 0
        }
    }

Plain .txt files are still supported (auto-chunked, metadata inferred from filename).

Run:
    cd un-media-bot
    python data/ingest.py
"""

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import config
from backend.app.embeddings import embed_batch
from pinecone import Pinecone

RAW_DIR = Path(__file__).parent / "raw"
PROCESSED_DIR = Path(__file__).parent / "processed"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
BATCH_SIZE = 100


def chunk_text(text: str) -> list[str]:
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start : start + CHUNK_SIZE].strip())
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c) > 30]


def load_vectors(raw_dir: Path) -> list[dict]:
    """
    Returns a flat list of dicts, each with:
        id   – stable string ID
        text – chunk text
        meta – dict to store as Pinecone metadata (includes "text")
    """
    vectors = []

    for path in sorted(raw_dir.iterdir()):
        if path.name.startswith("."):
            continue

        if path.suffix == ".txt":
            text = path.read_text(encoding="utf-8").strip()
            base_meta = {
                "title": path.stem.replace("_", " ").title(),
                "source": "",
                "url": "",
                "date": "",
                "type": "article",
            }
            for i, chunk in enumerate(chunk_text(text)):
                vectors.append({
                    "id": f"{path.stem}_chunk_{i}",
                    "text": chunk,
                    "meta": {**base_meta, "text": chunk, "chunk_index": i},
                })

        elif path.suffix == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            items = data if isinstance(data, list) else [data]

            for item in items:
                # New nested format: {"id": ..., "text": ..., "metadata": {...}}
                if "metadata" in item and isinstance(item["metadata"], dict):
                    text = item.get("text", "")
                    nested_meta = item["metadata"]
                    meta = {**nested_meta, "text": text}
                    # Ensure "url" is populated — fall back to "source" which holds the URL
                    if not meta.get("url") and meta.get("source", "").startswith("http"):
                        meta["url"] = meta["source"]
                    vectors.append({
                        "id": item.get("id", str(uuid.uuid4())),
                        "text": text,
                        "meta": meta,
                    })

                # Legacy flat format: all fields at top level, "text" is chunk content
                elif "text" in item:
                    text = item["text"]
                    meta = {k: v for k, v in item.items()}
                    if not meta.get("url") and meta.get("source", "").startswith("http"):
                        meta["url"] = meta["source"]
                    vectors.append({
                        "id": item.get("id", str(uuid.uuid4())),
                        "text": text,
                        "meta": meta,
                    })

                # Document-level record without pre-chunking
                else:
                    doc_text = item.get("content", "")
                    base_meta = {k: v for k, v in item.items() if k != "content"}
                    if not base_meta.get("url") and base_meta.get("source", "").startswith("http"):
                        base_meta["url"] = base_meta["source"]
                    for i, chunk in enumerate(chunk_text(doc_text)):
                        vectors.append({
                            "id": f"{item.get('id', uuid.uuid4())}_chunk_{i}",
                            "text": chunk,
                            "meta": {**base_meta, "text": chunk, "chunk_index": i},
                        })

    return vectors


def ingest():
    pc = Pinecone(api_key=config.PINECONE_API_KEY)
    index = pc.Index(config.PINECONE_INDEX_NAME)

    vectors = load_vectors(RAW_DIR)
    if not vectors:
        print("No documents found in data/raw/. Add .txt or .json files and re-run.")
        return

    print(f"Embedding {len(vectors)} chunks…")
    texts = [v["text"] for v in vectors]

    embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        embeddings.extend(embed_batch(batch))
        print(f"  embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")

    upsert_batch = []
    for vec, emb in zip(vectors, embeddings):
        upsert_batch.append((vec["id"], emb, vec["meta"]))
        if len(upsert_batch) >= BATCH_SIZE:
            index.upsert(vectors=upsert_batch)
            upsert_batch = []
    if upsert_batch:
        index.upsert(vectors=upsert_batch)

    print(f"Done. Upserted {len(vectors)} vectors to '{config.PINECONE_INDEX_NAME}'.")

    PROCESSED_DIR.mkdir(exist_ok=True)
    snapshot = [{"id": v["id"], "meta": v["meta"]} for v in vectors]
    (PROCESSED_DIR / "chunks.json").write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Snapshot written to data/processed/chunks.json")


if __name__ == "__main__":
    ingest()
