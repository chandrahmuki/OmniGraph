---
Generated: 2026-05-06T14:30:00Z
Topic: confidence-symlink-graph
---

## What Was Accomplished
- [2026-05-06T14:15] Fixed symlink crash: replaced `readdirSync({recursive: true})` with custom `walkDir` that skips symlinks and applies `ignore_dirs` before descending
- [2026-05-06T14:20] Added confidence labels to all edge types: `extracted` for explicit AST matches, `inferred` for deduced relationships (calls, uses_input, shares_dep)
- [2026-05-06T14:25] Added confidence display to `omnigraph check` output (`🏷️ confidence: X extracted, Y inferred`)
- [2026-05-06T14:28] Graph HTML now shows confidence visually: `extracted` edges solid (1.5px), `inferred` edges dashed (1px, 4,3 dasharray)

## Key Design Decisions
- [2026-05-06T14:18] `walkDir` checks `entry.isSymbolicLink()` before recursing, preventing Nix store traversal crash
- [2026-05-06T14:22] 5 confidence levels used: `extracted` (AST/regex explicit), `inferred` (deduced), `manual` (user annotations), `auto` (default), `unknown`

## Files Modified
- [2026-05-06T14:15] extract.ts — added walkDir function, removed recursive readdirSync
- [2026-05-06T14:20] extractors/tree-sitter.ts — updated all 5 language extractors with correct confidence
- [2026-05-06T14:20] extractors/generic.ts — default confidence changed to inferred
- [2026-05-06T14:20] extractors/memory.ts — default confidence changed to extracted
- [2026-05-06T14:25] omnigraph.ts — added confidence summary to check command
- [2026-05-06T14:28] web/build.ts — added stroke-dasharray for inferred edges

## Commits This Session
- `22c7d58` [2026-05-06T14:20] fix: skip symlinks in walkDir, add confidence labels to all edges
- `5e76754` [2026-05-06T14:28] feat: show confidence in graph (dashed lines for inferred edges)
