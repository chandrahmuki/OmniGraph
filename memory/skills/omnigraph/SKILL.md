# Skill: omnigraph

Query the project dependency graph via the `omnigraph` CLI (Bun + SQLite).

## When
- Before editing any `.nix` module
- When user asks "what depends on X" or "what does X affect"
- At session resume (auto-query last session's modules)
- Invoked: `/omnigraph check modules/niri.nix`

## Commands

### check <file-path>
Pre-edit impact analysis. Shows imports, inputs, reverse deps, sessions, lessons, risk level.
```
omnigraph check modules/niri.nix
```

### impact <file-path>
Full blast radius analysis. Shows transitive reverse dependencies organized by depth.
```
omnigraph impact lib/colors.nix
```

### path <from> <to>
Find shortest dependency path between two nodes.
```
omnigraph path inputs.niri modules/terminal.nix
```

### query <search-term>
Search nodes by label or ID. Returns matching node list.
```
omnigraph query niri
```

### build [--incremental]
Rebuild the graph DB and visualization. Use `--incremental` to skip unchanged files.
```
omnigraph build
omnigraph build --incremental
```

### orphans
Detect unused flake inputs, dead file references, isolated nodes.
```
omnigraph orphans
```

### git-log [count]
Show recent git commits with files modified. Default count: 10.
```
omnigraph git-log 5
```

### session-resume
Auto-query context for the last session. Reads the latest summary, then runs `check` on each modified module.
```
1. Find latest: ls -t memory/sessions/ | head -1
2. Read summary.md
3. For each module in "Files Modified": omnigraph check <module>
4. Present compact context report
```

## Process

1. **Verify DB exists** — If `.omnigraph/graph.db` missing, run `omnigraph build` first
2. **Run command** — Use `bun run omnigraph.ts <command> [args]` from project root
3. **Present results** — Max 15 lines, no prose, structured format

## Output Format (check)
```
## <module>
↓ uses_input: niri, sops-nix
↓ uses_colors: lib/colors.nix
↑ used_by: 10 sessions
⚙️ provides: option.programs.niri, pkg.pamixer
📝 sessions: noctalia-fix, neovim-modernization, ...
⚠️ risk: HIGH (10 reverse deps)
```

## Output Format (impact)
```
## Impact Analysis: lib/colors.nix
Total affected: 5 nodes (excluding source)
### Direct dependents:
  modules/terminal.nix [imports,uses_colors] (file)
### Depth 1:
  modules/zen-browser.nix (file)
```

## Invoke
```
/omnigraph check modules/niri.nix
/omnigraph impact lib/colors.nix
/omnigraph path inputs.niri modules/terminal.nix
/omnigraph query sops
/omnigraph orphans
/omnigraph git-log 5
/omnigraph session-resume
```
