"""
RAG (Retrieval-Augmented Generation) pipeline for the UN Media Bot.

This module is the core of the bot. When a journalist sends a question,
this pipeline will:

    1. Embed the user's query (via `embeddings.embed_text`).
    2. Retrieve the top-k most relevant chunks from the Pinecone index
       configured in `config.PINECONE_INDEX_NAME`.
    3. Construct a grounded prompt that includes the retrieved context
       and source metadata.
    4. Call the OpenAI chat model (`config.LLM_MODEL`) to generate a
       final answer.
    5. Return the answer along with source links back to the original
       UN documents so journalists can verify and cite them.

TODO: implement `query(user_message: str) -> Answer`.
"""
