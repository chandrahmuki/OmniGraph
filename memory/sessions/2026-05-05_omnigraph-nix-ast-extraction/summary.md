---
Generated: 2026-05-05 22:00 UTC
Topic: omnigraph-nix-ast-extraction
---

## What Was Accomplished
- Replaced regex hacks with tree-sitter AST extraction for Nix packages
- Added `with_expression` and `interpolation` node types to WalkResult
- Packages from `with pkgs; [...]` now extracted via AST, not regex
- Interpolated `${pkgs.xxx}/bin/` refs also extracted via AST
- Merged to main and pushed

## Commits This Session
- `a1b2c3d` fix: extract Nix packages via AST (with_expression, interpolation) instead of regex hacks

## Lessons Produced
- Utiliser les nodes AST tree-sitter (`with_expression`, `interpolation`) pour extraire les packages Nix, jamais de regex sur le contenu brut
- `with pkgs; [...]` → node `with_expression` avec enfants `variable_expression` dans `list_expression`
- `${pkgs.xxx}/bin/` → node `interpolation` avec `select_expression` dedans
