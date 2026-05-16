# OmniGraph — Agent Guide

Knowledge graph CLI: scans project → SQLite dependency graph → D3.js force-directed visualization.
**Runtime:** Bun only (`bun:sqlite`, `Bun.CryptoHasher`, `import.meta.dirname`). No Node.
**Usage:** `omnigraph <command>` — always use system command (Nix/symlink). Dev: `bun run omnigraph.ts` then `flake update omnigraph && nos`.

## Architecture map

| Path | Responsibility |
|------|----------------|
| `omnigraph.ts` | CLI entry — all subcommands |
| `db.ts` | GraphDB — nodes/edges/annotations/concepts, indexes, migrations |
| `extract.ts` | `scanAndExtract` — walks dirs, runs extractors, shared deps, edge versioning |
| `extractors/generic.ts` | Regex imports/deps (Nix, TS, Python, Rust, Go, C) |
| `extractors/tree-sitter.ts` | AST parsing (optional, falls back to regex) |
| `extractors/memory.ts` | Session/lesson/error/fix/workaround/change from `memory/` |
| `extractors/git.ts` | Git commit history → nodes/edges |
| `extractors/semantic.ts` | BM25 index — stemming + stop words |
| `web/build.ts` | D3.js force-directed HTML generator |
| `config.default.jsonc` / `omnigraph.jsonc` | Default + project config |

## Runtime flow

1. `build` creates `.omnigraph/`, instantiates GraphDB
2. `scanAndExtract` walks `scan_dirs`, skips `ignore_dirs`, filters `extensions`
3. Per file: tree-sitter → fallback regex in `generic.ts`
4. Post-process: shared dep detection → `_shared_dep:` hub nodes
5. Memory extractor parses `memory/sessions/*/summary.md`
6. Git extractor adds commit nodes
7. Edge versioning: `valid_from`/`valid_until`
8. Dead node cleanup: deleted files → orphans
9. `buildHtml` generates D3.js visualization

## Extractor contracts

All return `{ nodes: ExtractedNode[], edges: ExtractedEdge[], concepts?: ExtractedConcept[] }`. Memory also returns `annotations`.

**Generic** (`generic.ts`): Language regex patterns. Add languages to `LANGUAGES` array.
**Tree-sitter** (`tree-sitter.ts`): Optional AST. Falls back to regex. Builds function registry.
**Memory** (`memory.ts`): Parses errors, fixes, workarounds, issues, decisions, changes, lessons. Creates `resolved_by`, `workaround_by`, `affects`, `applies_to` edges.

## DB schema

| Table | Columns |
|-------|---------|
| **nodes** | id (PK), type, label, file_path, line_number, content_hash, created_at |
| **edges** | id (auto), from_id, to_id, type, confidence (auto/inferred), valid_from, valid_until |
| **annotations** | id (auto), node_id, key, value |
| **concepts** | id (auto), node_id, kind (function/class/struct/etc), name, file_path, line_number, snippet |

## Key patterns

- **Incremental builds**: `content_hash` on file nodes — skip if matches. Delete old edges before re-insert.
- **Edge versioning**: `valid_from`/`valid_until` track edge lifecycle across builds.
- **Dead node cleanup**: removes deleted file refs, then orphans with no edges.
- **Shared deps**: files using same input → `shares_dep` edge via `_shared_dep:` hub node.
- **Memory**: session summaries use structured markdown with dates, decisions, errors, fixes, workarounds, changes, lessons.

## Commands

```bash
omnigraph build              # scan → build DB → generate HTML
omnigraph build --incremental # skip unchanged files
omnigraph query <term>       # search nodes/annotations
omnigraph search <term>      # search concepts (--kind=function|class|struct)
omnigraph check <file>       # pre-edit impact analysis
omnigraph impact <file>      # transitive reverse deps (BFS)
omnigraph path <a> <b>       # shortest path BFS
omnigraph orphans            # unused inputs, isolated files, dead refs
omnigraph lessons            # list lesson items (--recent, --module=)
omnigraph hotspots           # most-modified files + error patterns
omnigraph errors             # errors with fix/workaround status (--unresolved, --file=)
omnigraph issues             # issues with resolution status (--unresolved, --file=)
omnigraph decisions          # decisions with rationale (--file=)
omnigraph changes            # changes with type filter (--type=, --file=)
omnigraph timeline <file>    # chronological events for a file
omnigraph semantic <q>       # BM25 semantic search (--type=, --top=)
omnigraph git-log            # recent commits with files
omnigraph session-resume     # resume last session — modified files + context
```

**Dev shell:** `shell.nix` (bun, chromium, python3, typescript). **Test:** `tests/test.sh [target_dir]`.
**No typecheck, no linter.** `bun run test` runs `tests/test.sh`.
**Config:** `omnigraph.jsonc` (project), `config.default.jsonc` (default), `memory/sessions/`, `memory/lessons/`, `memory/skills/`.

## Conventions

- **Bun only**: No Node.js. Use `bun:sqlite`, `Bun.CryptoHasher`, `import.meta.dirname`.
- **Minimal diffs**: Edit in place. No speculative abstractions.
- **No emojis in code** unless asked.
- **Error handling**: Silent catch in extract loop — per-file, not fatal.
- **Config parsing**: JSON with comments — strip `//` and `/* */` before `JSON.parse`.
- **SQL safety**: `INSERT OR IGNORE`. Parameterized queries.
- **Edge confidence**: `auto` for detected, `inferred` for computed.
- **Session IDs**: `YYYY-MM-DD_topic` format.

## Skills to use

- **/omnigraph** — Query dependency graph before editing. Supports check, query, impact, path, orphans, git-log, session-resume.
- **/project-map** — Regenerate compact NixOS config project map.
- **/snapshot** — Create structured session snapshots to `memory/sessions/`.

## Where to look first

| Question | Start here |
|----------|------------|
| "How does extraction work?" | `extract.ts` — `scanAndExtract` |
| "How are deps detected?" | `extractors/generic.ts` — `LANGUAGES` array |
| "How does the DB work?" | `db.ts` — GraphDB class |
| "How does memory work?" | `extractors/memory.ts` — pattern matching |
| "How does the web viz work?" | `web/build.ts` — D3.js generation |
| "How to add a command?" | `omnigraph.ts` — switch in `main()` |
| "How does semantic search work?" | `extractors/semantic.ts` — BM25 |
| "How does tree-sitter work?" | `extractors/tree-sitter.ts` — grammar loading |
| "Why is my file not scanned?" | `omnigraph.jsonc` — `scan_dirs`, `ignore_dirs` |

## Search — use omnigraph commands, NEVER grep/find/rg

| Need | Command |
|------|---------|
| Find nodes/annotations | `omnigraph query <term>` |
| Find functions/classes | `omnigraph search <term> --kind=function` |
| Semantic search | `omnigraph semantic <query>` |
| Find references | `omnigraph impact <file>` |
| Find paths | `omnigraph path <a> <b>` |

## Coding guidelines (Karpathy-inspired)

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked. No abstractions for single-use code.
- If 200 lines could be 50, rewrite it.

### 3. Surgical Changes
- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Match existing style. Remove imports/variables YOUR changes made unused.
- The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
- Define success criteria. Loop until verified.
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- Multi-step: state brief plan with verify checks.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation.

## Maintainer preferences

- Keep responses and commits terse; no trailing summaries unless asked.
- User-facing changes must update README.md in the same change.
- Avoid adding new dependencies casually.
- French is acceptable for commit messages and conversation.
- Branch: `feat/semantic-memory` — active work on semantic search, error/fix/workaround tracking, timeline, memory extraction.
