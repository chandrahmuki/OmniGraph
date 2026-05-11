# OmniGraph — Agent Guide

A knowledge graph CLI that scans any project and builds a SQLite dependency graph with D3.js visualization. Code, docs, memory — everything connected.

## What OmniGraph is

Scans a project directory, extracts dependencies/concepts/memory, stores them in SQLite, and generates an interactive D3.js force-directed graph. Works with any language via regex extractors, with optional tree-sitter AST parsing for deeper analysis.

**Install:** `git clone` → symlink `omnigraph.ts` to `~/.local/bin/omnigraph`
**Runtime:** Bun only — uses `bun:sqlite`, `Bun.CryptoHasher`, `import.meta.dirname`. Will NOT work with Node.
**Entry point:** `omnigraph.ts` — CLI dispatcher with all subcommands.

**Usage:** `omnigraph <command>` — always use the system command (installed via Nix/symlink).

**Dev mode:** Only use `bun run omnigraph.ts <command>` for testing new features before they're merged. Then update system version with `flake update omnigraph && nos`.

## Architecture map

| Path | Responsibility |
|------|----------------|
| `omnigraph.ts` | CLI entry point, all subcommands (build, query, search, check, impact, path, orphans, lessons, hotspots, errors, issues, decisions, changes, timeline, semantic, git-log) |
| `db.ts` | GraphDB wrapper — nodes/edges/annotations/concepts tables, indexes, migrations |
| `extract.ts` | `scanAndExtract` — walks dirs, runs extractors, post-processes shared deps, edge versioning |
| `extractors/generic.ts` | Regex-based import/dependency extraction (Nix, TS, Python, Rust, Go, C) |
| `extractors/tree-sitter.ts` | AST-based function/class/concept extraction (optional, falls back to regex) |
| `extractors/memory.ts` | Session/lesson/decision/error/fix/workaround/change extraction from `memory/` |
| `extractors/git.ts` | Git commit history → nodes/edges |
| `extractors/semantic.ts` | BM25 index — zero-dependency, stemming + stop words |
| `web/build.ts` | D3.js force-directed graph HTML generator |
| `config.default.jsonc` | Default config — entity types, relation types, colors |
| `omnigraph.jsonc` | Project-specific config (JSON with comments) |

## Runtime flow (read this before touching `omnigraph.ts`)

1. `build` command creates `.omnigraph/` dir, instantiates GraphDB
2. `scanAndExtract` walks `scan_dirs`, skips `ignore_dirs`, filters by `extensions`
3. For each file: tree-sitter if available → fallback to regex in `generic.ts`
4. Post-processing: shared dependency detection creates `_shared_dep:` hub nodes
5. Memory extractor parses `memory/sessions/*/summary.md` for structured data
6. Git extractor adds commit history nodes
7. Edge versioning: `valid_from`/`valid_until` track edge lifecycle
8. Dead node cleanup: removes nodes referencing deleted files, then orphans with no edges
9. `buildHtml` generates D3.js visualization

## Extractor contracts

All extractors return `{ nodes: ExtractedNode[], edges: ExtractedEdge[], concepts?: ExtractedConcept[] }`. Memory extractor also returns `annotations`.

**Generic extractor** (`generic.ts`): Language-specific regex patterns for imports, external deps, resource refs. Add new language support by appending to `LANGUAGES` array.

**Tree-sitter extractor** (`tree-sitter.ts`): Optional AST parsing. Falls back to regex if grammars fail to load. Builds function registry for cross-file call tracking.

**Memory extractor** (`memory.ts`): Parses session summaries for:
- Errors (ERROR_PATTERN, ERROR_PROSE_PATTERN)
- Fixes (FIX_PATTERN)
- Workarounds (WORKAROUND_PATTERN — bypass vs root-cause)
- Issues, decisions, changes, lesson items
- Creates `resolved_by`, `workaround_by`, `affects`, `applies_to` edges

## DB schema

| Table | Columns |
|-------|---------|
| **nodes** | id (PK), type, label, file_path, line_number, content_hash, created_at |
| **edges** | id (auto), from_id, to_id, type, confidence (auto/inferred), valid_from, valid_until |
| **annotations** | id (auto), node_id, key, value |
| **concepts** | id (auto), node_id, kind (function/class/struct/etc), name, file_path, line_number, snippet |

## Key patterns

- **Incremental builds**: `content_hash` on file nodes — skip if hash matches. Delete old edges before re-inserting.
- **Edge versioning**: `valid_from`/`valid_until` track when edges appeared/disappeared across builds.
- **Dead node cleanup**: `build` removes nodes referencing deleted files, then orphans with no edges.
- **Shared dependency detection**: files using the same input get a `shares_dep` edge through a `_shared_dep:` hub node.
- **Memory patterns**: session summaries use structured markdown with dates, decisions, errors, fixes, workarounds, changes, lesson items.

## Build, test, and local workflow

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
omnigraph session-resume     # resume last session — shows modified files + context
```

**Dev shell:** `shell.nix` provides bun, chromium, python3, typescript.
**Test:** `tests/test.sh [target_dir]` — builds graph, runs commands, takes headless chromium screenshot.
**Test projects:** `tests/test-ts/` and `tests/test-py/` — sample projects.
**Screenshot test:** chromium at hardcoded Nix store path (update in test.sh if changed).
**No typecheck, no linter.** `bun run test` runs `tests/test.sh`.

**Config locations:**
- Project: `omnigraph.jsonc` (JSON with comments)
- Default: `config.default.jsonc`
- Memory: `memory/sessions/`, `memory/lessons/`, `memory/skills/`

## Conventions to follow

- **Bun only**: No Node.js compatibility. Use `bun:sqlite`, `Bun.CryptoHasher`, `import.meta.dirname`.
- **Minimal diffs**: Prefer editing in place over rewriting files. No speculative abstractions.
- **No emojis in code** unless the user asks.
- **Error handling**: Silent catch in extract loop — failures are per-file, not fatal.
- **Config parsing**: JSON with comments — strip `//` and `/* */` before `JSON.parse`.
- **SQL safety**: `INSERT OR IGNORE` for nodes/edges/concepts. Parameterized queries where possible.
- **Edge confidence**: `auto` for detected, `inferred` for computed (shared deps).
- **Session IDs**: Date-based format `YYYY-MM-DD_topic` for memory/sessions directories.

## Skills to use

When working in this repo, prefer these skills over ad-hoc approaches:

- **/omnigraph** — Query the dependency graph for context before editing Nix modules. Supports check, query, impact, path, orphans, git-log, and session-resume.
- **/project-map** — Regenerate the compact NixOS config project map. Use when user asks to "map the project", "update the project map", or when new modules are added.
- **/snapshot** — Create structured session snapshots to `memory/sessions/`. Use for important decisions, fixes, new modules. NOT for minor changes.

## Session-resume command

```bash
omnigraph session-resume
```

**Output:** Shows latest session topic, files modified, and context check (dependents count, sessions, errors) for each modified file.

## Golden path for a non-trivial change

1. Read relevant extractor code + skim existing patterns
2. Plan the change (what nodes/edges/annotations to add)
3. Implement the narrowest change that works
4. Run `omnigraph build` to verify
5. Run `omnigraph check <affected-file>` to verify impact
6. Run `omnigraph test` if test project exists
7. If user-visible: update README.md and docs

## Where to look first

| Question | Start here |
|----------|------------|
| "How does extraction work?" | `extract.ts` — `scanAndExtract` function |
| "How are dependencies detected?" | `extractors/generic.ts` — `LANGUAGES` array with regex patterns |
| "How does the DB work?" | `db.ts` — GraphDB class, schema, migrations |
| "How does memory extraction work?" | `extractors/memory.ts` — pattern matching, node/edge creation |
| "How does the web viz work?" | `web/build.ts` — D3.js force-directed graph generation |
| "How do I add a new command?" | `omnigraph.ts` — switch case in `main()`, update usage() |
| "How does semantic search work?" | `extractors/semantic.ts` — BM25 index, stemming, stop words |
| "How does tree-sitter work?" | `extractors/tree-sitter.ts` — grammar loading, AST parsing, function registry |
| "How does incremental build work?" | `extract.ts` — `content_hash` comparison, edge deletion/re-insertion |
| "How are sessions tracked?" | `extractors/memory.ts` — session summary parsing, edge creation |
| "Why is my file not being scanned?" | `omnigraph.jsonc` — `scan_dirs`, `ignore_dirs`, `extensions` |
| "How do I add a new language?" | `extractors/generic.ts` — add to `LANGUAGES` array with patterns |

## Search commands — use these directly

**NEVER use grep/find/rg for code search** — use omnigraph commands instead:

| Search need | Command |
|-------------|---------|
| Find nodes/annotations | `omnigraph query <term>` |
| Find functions/classes | `omnigraph search <term> --kind=function` |
| Semantic search | `omnigraph semantic <query>` |
| Find references | `omnigraph impact <file>` |
| Find paths | `omnigraph path <a> <b>` |

## Things to know about the maintainer's preferences

- Keep responses and commits terse; no trailing summaries unless asked.
- User-facing changes must update README.md in the same change.
- Avoid adding new dependencies casually — the dependency list in package.json is intentional.
- French is acceptable for commit messages and conversation.
- Branch: `feat/semantic-memory` — active work on semantic search, error/fix/workaround tracking, timeline, memory extraction.
