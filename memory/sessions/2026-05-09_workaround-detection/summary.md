---
Generated: 2026-05-09T11:15:00Z
Topic: workaround-detection
---

## What Was Accomplished
- [2026-05-09T11:00] Added WORKAROUND_PATTERN (EN/FR) to detect bypass vs root-cause fix in memory.ts
- [2026-05-09T11:05] Created workaround nodes with workaround_by edges instead of resolved_by
- [2026-05-09T11:08] Added resolution_type annotation (fix/workaround) on error nodes
- [2026-05-09T11:10] Updated errors/issues commands to display 🔄 Workarounds separately from ✅ Fixes
- [2026-05-09T11:12] --unresolved flag now filters out workarounds as well as fixes

## Key Design Decisions
- [2026-05-09T11:02] Separate node type `workaround` (not just a fix subtype) for graph clarity
- [2026-05-09T11:04] Prose lines that are both error + workaround get both error and workaround nodes
- [2026-05-09T11:06] change_type=replace/remove on changes triggers workaround_for edge on issues

## Files Modified
- [2026-05-09T11:00] extractors/memory.ts — WORKAROUND_PATTERN, workaround nodes, workaround_by edges, resolution_type annotation
- [2026-05-09T11:10] omnigraph.ts — errors/issues queries with workaround_by, display 🔄 Workarounds, --unresolved fix

## Commits This Session
- `e24e7e9` [2026-05-09T11:15] feat: workaround detection — distinguish fix vs workaround (replaced, removed, switched)
