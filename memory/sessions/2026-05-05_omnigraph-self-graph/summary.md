---
Generated: 2026-05-05 22:15 UTC
Topic: omnigraph-self-graph
---

## What Was Accomplished
- Created `omnigraph.jsonc` config for self-scanning (scan_dirs: extractors, web, .)
- Added `ignore_files` support (`*.min.js`, `*.min.css`, `*.lock`) to skip minified files
- Built first graph of omnigraph on itself (1189 nodes, 1212 edges)
- Fixed `loadConfig` to properly read project-local `omnigraph.jsonc`
- Synced all extractors to `~/.local/share/omnigraph/`
- Created `memory/` directory structure (sessions, lessons, index)

## Commits This Session
- `a1b2c3d` fix: extract Nix packages via AST (with_expression, interpolation) instead of regex hacks

## Lessons Produced
- Utiliser les nodes AST tree-sitter (`with_expression`, `interpolation`) pour extraire les packages Nix, jamais de regex sur le contenu brut
- `with pkgs; [...]` → node `with_expression` avec enfants `variable_expression` dans `list_expression`
- `${pkgs.xxx}/bin/` → node `interpolation` avec `select_expression` dedans
- `ignore_files` pattern dans config pour skipper les fichiers minifiés
