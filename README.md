# UN Media Bot
Delta Consulting × United Nations Department of Global Communications

## Overview
AI-powered press room chatbot built on a RAG (Retrieval-Augmented Generation) architecture. It allows journalists to query UN press resources — press releases, transcripts, briefings, and reports — via natural language and receive fast, context-aware answers with source links back to the original documents. Built as a prototype for the UN DGC Press Room portal.

## Tech Stack
- **Frontend:** React (or HTML/CSS/JS) for the press room landing page and chat interface
- **Backend:** Python, FastAPI
- **Vector DB:** Pinecone
- **LLM:** OpenAI API (`gpt-4o-mini` for chat, `text-embedding-3-small` for embeddings)
- **Deployment:** Local development prototype

## Project Structure
```
un-media-bot/
├── frontend/               # Press room landing page + chat UI
│   └── index.html          # Placeholder shell (React scaffold may replace this)
├── backend/                # FastAPI RAG service
│   ├── app/
│   │   ├── main.py         # FastAPI entry point (routes live here)
│   │   ├── rag.py          # RAG pipeline: retrieval + prompt + LLM call
│   │   ├── embeddings.py   # OpenAI embedding helpers
│   │   └── config.py       # Env var loading (API keys, index name, model)
│   └── requirements.txt    # Python dependencies
├── data/
│   ├── raw/                # Raw UN documents (PDFs, transcripts, press releases)
│   ├── processed/          # Chunked + cleaned text ready for embedding
│   └── ingest.py           # Chunk → embed → upsert pipeline
├── docs/
│   ├── persona.md          # Bot voice, tone, and guardrails
│   ├── conversation-flows.md  # User journeys and example dialogues
│   └── architecture.md     # RAG architecture diagram and notes
├── .env.example            # Template for environment variables
├── .gitignore
└── README.md
```

## Getting Started

1. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd un-media-bot
   ```

2. **Set up the Python backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate       # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up the frontend**
   - If using the placeholder `frontend/index.html`, just open it in a browser.
   - If the team scaffolds a React app (e.g. Vite), run `npm install` inside `frontend/`.

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then fill in your `PINECONE_API_KEY`, `OPENAI_API_KEY`, and confirm `PINECONE_INDEX_NAME` and `LLM_MODEL`.

5. **Run the backend**
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```
   The API will be available at `http://localhost:8000`.

6. **Run the frontend**
   - Placeholder: open `frontend/index.html` directly in a browser.
   - React (once scaffolded): `npm run dev` from `frontend/`.

## Team
- **Adam** — Project Manager
- **Radhika** — Project Manager
- **Tanvi** — Senior Analyst
- **Ethan** — Senior Analyst
- **Mateo** — Analyst
- **Nithya** — Analyst

## License
For academic use only. Delta Consulting × UN DGC.
