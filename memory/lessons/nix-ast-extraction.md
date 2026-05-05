---
title: "Nix AST extraction"
tags: [tree-sitter, nix, ast, extraction]
created: 2026-05-05
---

## Lessons

- **Utiliser les nodes AST tree-sitter** (`with_expression`, `interpolation`) pour extraire les packages Nix, jamais de regex sur le contenu brut
- `with pkgs; [...]` → node `with_expression` avec enfants `variable_expression` dans `list_expression`
- `${pkgs.xxx}/bin/` → node `interpolation` avec `select_expression` dedans
- `ignore_files` pattern dans config pour skipper les fichiers minifiés (`*.min.js`)
