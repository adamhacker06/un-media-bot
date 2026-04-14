# Architecture

Placeholder for the UN Media Bot RAG architecture diagram and notes.

High-level flow:

    Journalist
       │
       ▼
    Frontend (press room UI + chat)
       │  POST /chat
       ▼
    FastAPI backend (backend/app/main.py)
       │
       ▼
    RAG pipeline (backend/app/rag.py)
       │   1. Embed query  ──►  OpenAI embeddings
       │   2. Retrieve top-k ──►  Pinecone index
       │   3. Prompt + generate ──►  OpenAI chat model
       ▼
    Grounded answer + source links → Frontend

## Sections to fill in
- Component diagram (frontend / backend / Pinecone / OpenAI)
- Data ingestion flow (data/ingest.py → Pinecone)
- Retrieval strategy (top-k, filters, metadata schema)
- Prompt template and grounding strategy
- Evaluation plan
