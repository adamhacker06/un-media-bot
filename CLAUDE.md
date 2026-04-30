# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UN Media Bot — an AI-powered press room chatbot for the United Nations Department of Global Communications (Delta Consulting × UN DGC). Journalists submit natural-language queries and receive streamed, source-grounded answers backed by UN press releases, transcripts, briefings, and reports.

## Development Commands

### Backend (Python / FastAPI)

```bash
# Set up virtualenv (from repo root)
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run the API server (from repo root or backend/)
cd backend
uvicorn app.main:app --reload
# → http://localhost:8000
# → API docs at http://localhost:8000/docs
```

### Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Data Ingestion

```bash
# From repo root (adds .txt / .json files in data/raw/ to Pinecone)
python data/ingest.py
```

Ingestion writes a processed snapshot to `data/processed/chunks.json` for inspection.

### Environment Setup

```bash
cp .env.example .env
# Fill in: OPENAI_API_KEY, PINECONE_API_KEY
# Optional overrides: PINECONE_INDEX_NAME (default: "un-media-bot"), LLM_MODEL (default: "gpt-4o-mini")
```

## Architecture

### Request flow

```
Browser (React/Vite :5173)
  │  POST /api/chat  (proxied by Vite → :8000)
  ▼
FastAPI  backend/app/main.py
  │  StreamingResponse (SSE)
  ▼
RAG pipeline  backend/app/rag.py
  ├─ 1. embed_text(query)   → OpenAI text-embedding-3-small
  ├─ 2. Pinecone index.query(top_k=12)
  ├─ 3. _categorise_matches() → Article | Asset dataclasses
  ├─ 4. Build grounded prompt (max 6 context chunks)
  └─ 5. Stream OpenAI chat completion token-by-token as SSE
         + final "sources" event with articles + assets JSON
```

### SSE event protocol (`POST /chat`)

Every event is a newline-delimited JSON line prefixed with `data: `:

| `type`     | Payload fields                              | When emitted          |
|------------|---------------------------------------------|-----------------------|
| `token`    | `content: str`                              | Each streamed token   |
| `sources`  | `articles: Article[]`, `assets: Asset[]`    | After stream finishes |
| `error`    | `message: str`                              | On any exception      |

Frontend (`App.jsx`) parses this stream and routes events to state: tokens append to `answer`, `sources` populates `articles`/`assets`.

### Pinecone metadata schema

Each vector stored in Pinecone must carry these metadata fields (see `rag.py` docstring):

- `text`, `title`, `url`, `date`, `source`, `type`
- Assets additionally need: `asset_url`, `thumbnail_url`, `asset_type`, `description`

The `type` field controls routing in `_categorise_matches()`: values in `{"image","video","photo","asset","media","graphic"}` are treated as media assets; everything else is an article.

### Frontend structure

`App.jsx` owns all query state and the SSE fetch logic. It renders either `SearchHome` (initial landing) or `ResultsView` (after a query). `ResultsView` has three tabs: **Answer**, **Sources**, **Assets** — each a separate component.

Vite's dev server proxies `/api/*` → `http://localhost:8000`, so frontend code always calls `/api/chat`, never the backend port directly.

### Adding new document types to ingestion

`data/ingest.py` reads `data/raw/`:
- `.txt` files → treated as plain article text, metadata inferred from filename
- `.json` files → must contain a dict (or list of dicts) matching the Pinecone metadata schema above

Chunk size is 500 chars with 50-char overlap (`CHUNK_SIZE` / `CHUNK_OVERLAP` constants at the top of `ingest.py`).
