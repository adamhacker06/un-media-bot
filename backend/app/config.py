"""
Central configuration for the UN Media Bot backend.
"""

import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

PINECONE_API_KEY: Optional[str] = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME: str        = os.getenv("PINECONE_INDEX_NAME", "un-media-bot")
PINECONE_EMBED_MODEL: str       = os.getenv("PINECONE_EMBED_MODEL", "llama-text-embed-v2")
GROQ_API_KEY: Optional[str]     = os.getenv("GROQ_API_KEY")
LLM_MODEL: str                  = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
TOP_K: int                      = 12
