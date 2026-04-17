"""
Central configuration for the UN Media Bot backend.

Loads environment variables from a local `.env` file (via `python-dotenv`)
and exposes them as module-level constants.
"""

import os

from dotenv import load_dotenv

load_dotenv()

PINECONE_API_KEY: str | None = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME: str | None = os.getenv("PINECONE_INDEX_NAME", "un-media-bot")
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL: str = "text-embedding-3-small"
TOP_K: int = 12
