---
Generated: 2026-05-05 14:30 UTC
Topic: omnigraph v3 semantic memory
---

## What Was Accomplished
- Implemented 2-pass call graph extraction (function registry → filtered calls)
- Added rationale extraction from inline comments (NOTE, WHY, HACK, TODO, FIXME)
- Added error/fix pattern extraction from session snapshots
- Added `omnigraph report` command generating GRAPH_REPORT.md
- Added `ignore_files` config pattern support to prevent minified file hangs
- Synced all changes to `~/.local/share/omnigraph/`

## Commits This Session
- `7d5cf6b` feat: v3 semantic memory — call graph, rationale, error/learning extraction, report command
- `bb85259` fix: extract Nix packages via AST (with_expression, interpolation) instead of regex hacks

## Skills Modified
- (none)

## Lessons Learned
- Tree-sitter call extraction requires 2-pass registry to avoid stdlib noise
- `findFileForFunction` needs optimization (currently O(n) linear scan)
- `errorFixMap` in memory.ts declared but unused — cleanup needed
- Rationale regex pattern duplicated across 5 language extractors
