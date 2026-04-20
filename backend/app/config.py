"""
Central configuration for the UN Media Bot backend.
"""

import os
from dotenv import load_dotenv

load_dotenv()

PINECONE_API_KEY: str | None    = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME: str        = os.getenv("PINECONE_INDEX_NAME", "un-media-bot")
PINECONE_EMBED_MODEL: str       = os.getenv("PINECONE_EMBED_MODEL", "llama-text-embed-v2")
GEMINI_API_KEY: str | None      = os.getenv("GEMINI_API_KEY")
LLM_MODEL: str                  = os.getenv("LLM_MODEL", "gemini-1.5-flash")
TOP_K: int                      = 12
