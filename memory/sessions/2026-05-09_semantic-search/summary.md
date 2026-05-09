---
Generated: 2026-05-09T09:30:00Z
Topic: semantic-search
---

## What Was Accomplished
- [2026-05-09T09:00] Implemented BM25 semantic search in extractors/semantic.ts — zero dependencies, 100% offline
- [2026-05-09T09:15] Added `omnigraph semantic` command with type filtering and top-K results
- [2026-05-09T09:20] Added stemming dictionary (~150 word families) and stop words filter
- [2026-05-09T09:25] Tested: "crash symlink" finds fix+error nodes, "tree sitter" finds extractors, "error tracking" finds changes

## Key Design Decisions
- [2026-05-09T09:05] BM25 over embeddings — transformers libs need native libs (libvips/sharp) not available on this system
- [2026-05-09T09:10] In-memory index built per-query — fast enough for ~350 nodes, no storage needed
- [2026-05-09T09:12] Tokenization strips hyphens so "tree-sitter" matches "tree sitter" query

## Files Modified
- [2026-05-09T09:00] extractors/semantic.ts — new BM25Index class with stemming + stop words
- [2026-05-09T09:15] omnigraph.ts — semantic command with score visualization
- [2026-05-09T09:20] db.ts — removed unused embeddings table/schema
- [2026-05-09T09:20] extract.ts — removed unused embeddings import
- [2026-05-09T09:22] package.json — removed @xenova/transformers dependency

## Commits This Session
- `79d4a2a` [2026-05-09T09:30] feat: BM25 semantic search — zero-dependency semantic ranking with stemming, stop words, and type filtering
