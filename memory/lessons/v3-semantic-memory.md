# Lessons from v3 Semantic Memory

## Call Graph Extraction
- 2-pass approach required: build function registry first, then filter calls
- Single-pass extraction captures stdlib noise (console.log, require, etc.)
- `findFileForFunction` currently O(n) — optimize with hash index

## Code Quality
- Rationale regex pattern duplicated across 5 language extractors (TS, Py, Rust, Go, Nix)
- Extract shared constant to avoid drift
- `errorFixMap` in memory.ts declared but never read — remove or use

## Config
- `ignore_files` pattern matching prevents hangs on minified files (`*.min.js`, `*.lock`)
- Use glob-to-regex conversion for pattern matching
