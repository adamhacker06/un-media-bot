"""
Central configuration for the UN Media Bot backend.

Loads environment variables from a local `.env` file (via `python-dotenv`)
and exposes them as module-level constants. All other modules should import
config values from here rather than reading `os.environ` directly — this
keeps secrets, model names, and index names in exactly one place.

Expected variables (see `.env.example` at the repo root):
    PINECONE_API_KEY    — Pinecone API key
    PINECONE_INDEX_NAME — Name of the Pinecone index (default: un-media-bot)
    OPENAI_API_KEY      — OpenAI API key
    LLM_MODEL           — Chat model identifier (default: gpt-4o-mini)
"""

import os

from dotenv import load_dotenv

load_dotenv()

PINECONE_API_KEY: str | None = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME: str | None = os.getenv("PINECONE_INDEX_NAME", "un-media-bot")
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
LLM_MODEL: str | None = os.getenv("LLM_MODEL", "gpt-4o-mini")
