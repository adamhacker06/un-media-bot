"""
FastAPI application entry point for the UN Media Bot backend.

Routes:
    GET  /health   – liveness probe
    POST /chat     – streaming RAG query (SSE)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .rag import query_once, stream_query

app = FastAPI(title="UN Media Bot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str


@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@app.post("/query")
async def query(request: ChatRequest):
    """
    Non-streaming RAG query. Returns a single JSON response — easy to test with curl or Postman.

    Response shape:
        {"answer": "...", "articles": [...], "assets": [...]}
    """
    return await query_once(request.query)


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Stream a RAG-grounded answer plus structured sources via SSE.

    Emits newline-delimited JSON events:
        {"type": "token",   "content": "..."}
        {"type": "sources", "articles": [...], "assets": [...]}
        {"type": "error",   "message": "..."}
    """
    return StreamingResponse(
        stream_query(request.query),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
