---
Generated: 2026-05-05 22:30 UTC
Topic: omnigraph-v3-planning
---

## What Was Accomplished
- Analyzed Graphify v7 architecture (extract.py, tree-sitter, caching, deterministic IDs)
- Compared Graphify features vs OmniGraph current state
- Identified call graph 2-pass pattern as priority #1
- Identified inline comments/rationale extraction as priority #2
- Identified error/learning extraction from sessions as unique differentiator
- Designed plan: call graph → inline comments → error/learning nodes → GRAPH_REPORT.md

## Key Decisions
- Call graph: only project-internal calls (filter out stdlib like .split(), .push())
- Memory/sessions layer is our unique advantage over Graphify
- Keep source in chandrahmuki/OmniGraph repo
- 100% offline, zero LLM API calls

## Commits This Session
- `bb85259` fix: extract Nix packages via AST (with_expression, interpolation) instead of regex hacks
- `e460306` feat: add Nix concept extraction — options, inputs, packages, lib/pkgs functions

## Lessons Produced
- Call extraction creates 1000+ useless nodes for trivial methods — must filter to internal calls only
- Graphify uses deterministic structural extraction with caching — OmniGraph should follow similar pattern
- **rtk sqlite3 always fails** — sqlite3 not installed in profile, recurring error every session (see lessons/rtk-sqlite3-missing.md)

## Files Modified
- `extractors/tree-sitter.ts`: Nix AST extraction, call extraction disabled
- `extract.ts`: ignore_files config support, loadConfig path fix
- `omnigraph.jsonc`: new self-scan config
- `extractors/memory.ts`: generalized session/lesson/skill extractor
- `memory/`: new sessions, lessons, index for omnigraph repo
