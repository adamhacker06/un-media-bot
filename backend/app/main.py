"""
FastAPI application entry point for the UN Media Bot backend.

This module defines the `app` object that Uvicorn serves. It is intentionally
minimal right now — only a `/health` route is wired up. Future routes
(e.g. `POST /chat`) will import `query()` from `rag.py` and expose the RAG
pipeline to the frontend.

Run locally:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI

app = FastAPI(title="UN Media Bot API")


@app.get("/health")
def health() -> dict:
    """Liveness probe — returns a static OK payload."""
    return {"status": "ok"}
