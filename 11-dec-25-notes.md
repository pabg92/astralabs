# 11 Dec 2025 Changes

## P1 Reconciliation (scripts/p1-reconciliation.ts)
- Raised accuracy by defaulting P1 model to `gpt-5.1` (configurable via `P1_MODEL`), with deterministic settings (`temperature: 0`, `top_p: 0.1`).
- Grounded comparisons with library exemplars: fetches matched `legal_clause_library` rows and injects the exemplar text into the prompt.
- Added a strict verifier pass for mandatory/borderline terms; verifier can override the initial judgment. If verifier parsing fails for mandatory terms, defaults to a conservative RED.
- Introduced `sanitizeComparisonResult` to normalize GPT outputs (booleans, severity enum, trimmed explanation, bounded confidence, cleaned key_differences) for both primary and verifier responses.
- Prompts and logging unchanged beyond the above; JSON parsing now uses sanitization to reduce malformed-response risk.

## Embeddings (supabase/functions/generate-embeddings/index.ts)
- Switched embedding generation from Cohere to OpenAI `text-embedding-3-large` (configurable via `EMBEDDING_MODEL`).
- Added `dimensions` parameter (default `1024`, configurable via `EMBEDDING_DIMENSIONS`) to match pgvector `vector(1024)` schema using OpenAI’s Matryoshka reduction.
- Uses OpenAI embeddings API with sorted outputs to align embeddings to batch order; updates `embedding_source` metadata and edge_function_logs to the OpenAI model name and dimensions.
- Requires `OPENAI_API_KEY` (no longer depends on `COHERE_API_KEY` for embedding generation). Keeps pgvector storage and `find_similar_clauses` flow unchanged apart from the new model.
- Note: Library embeddings are still from the previous model (likely Cohere); regenerate library embeddings with the same model/dimension for similarity search to produce matches.

## Notes / Next Steps
- Optional: add reranker/SBERT layer for library match refinement, or keep Cohere as a fallback path if OpenAI is unavailable.
- Mirror P1 sanitation/verification changes into `worker/p1-reconciliation.ts` for parity if that path is in use.
