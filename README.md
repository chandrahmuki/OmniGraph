# OmniGraph

Knowledge graph tool for any project. Code, docs, stories — everything connected.

## Install

```bash
git clone https://github.com/chandrahmuki/OmniGraph.git ~/.local/share/omnigraph
ln -s ~/.local/share/omnigraph/omnigraph.ts ~/.local/bin/omnigraph
```

Requires [Bun](https://bun.sh).

## Usage

```bash
# In any project directory
omnigraph build              # Scan → build graph → generate HTML
omnigraph build --incremental # Skip unchanged files
omnigraph query foo          # Search nodes
omnigraph session-resume     # Resume last session with context check

# Open the visualization
open .omnigraph/index.html
```

## Commands

### Core
| Command | Description |
|---------|-------------|
| `build` | Scan project, build DB, generate HTML visualization |
| `build --incremental` | Skip unchanged files (faster) |
| `save "<msg>"` | Git commit + snapshot + rebuild (all-in-one) |
| `query <term>` | Search nodes, annotations, lesson items |
| `search <term>` | Search concepts (functions, classes, structs) |

### Analysis
| Command | Description |
|---------|-------------|
| `check <file>` | Pre-edit impact analysis (deps, sessions, risk) |
| `impact <file>` | Full transitive reverse dependencies (BFS) |
| `path <a> <b>` | Shortest dependency path between two nodes |
| `orphans` | Detect unused inputs, dead refs, isolated nodes |
| `timeline <file>` | Chronological events for a file |

### Memory
| Command | Description |
|---------|-------------|
| `session-resume` | Show last session summary + context check |
| `lessons` | List lesson items (`--recent`, `--module=`) |
| `errors` | List errors with fix status (`--unresolved`, `--file=`) |
| `issues` | List issues from sessions (`--unresolved`, `--file=`) |
| `decisions` | List decisions with rationale (`--file=`) |
| `changes` | List changes (`--type=`, `--file=`) |
| `hotspots` | Most-modified files + recurring error patterns |

### Search
| Command | Description |
|---------|-------------|
| `semantic <query>` | BM25 semantic search (`--type=`, `--top=`) |
| `git-log [n]` | Recent git commits with files modified |

## Features

- **Universal parsing** — regex extractors work with any language (JS, TS, Python, Nix, Rust, Go, C, ...)
- **Tree-sitter AST** — optional deep parsing for functions, classes, structs
- **Memory layer** — sessions, lessons, errors, fixes, workarounds, decisions
- **Manual tags** — add relations inline: `# @omnigraph: link-to ./other.md`
- **Interactive web viz** — D3.js force-directed graph, search, filters by type
- **Zero API cost** — 100% offline, no LLM needed
- **SQLite backend** — fast, zero-config, file-based
- **Edge versioning** — track when edges appeared/disappeared across builds

## Project Structure

```
.omnigraph/
  graph.db        # SQLite dependency graph
  index.html      # Interactive D3.js visualization
memory/
  sessions/       # Session snapshots (summary.md per session)
  lessons/        # Lesson files (.md)
  skills/         # Skill definitions (SKILL.md)
  index_sessions.md
omnigraph.jsonc   # Project config (scan dirs, ignore patterns)
```

## Session Workflow

1. Work on a feature
2. Run `omnigraph save "feat: description"` — commits + creates snapshot
3. Snapshot auto-extracts: files modified, errors, fixes, decisions, lessons
4. Later: `omnigraph session-resume` — shows last session + impact analysis

## Config (omnigraph.jsonc)

```jsonc
{
  "project_name": "MyProject",
  "scan_dirs": ["src", "lib", "."],
  "ignore_dirs": [".git", "node_modules", ".omnigraph"],
  "ignore_files": ["*.min.js", "*.lock"],
  "extensions": [".ts", ".js", ".py", ".nix"],
  "memory": {
    "sessions_dir": "memory/sessions",
    "lessons_dir": "memory/lessons",
    "skills_dir": "memory/skills"
  }
}
```

## Examples

```bash
# Check impact before editing
omnigraph check modules/niri.nix
omnigraph impact lib/colors.nix

# Find dependency path
omnigraph path inputs.niri modules/terminal.nix

# Search memory
omnigraph errors --unresolved
omnigraph decisions --file=modules/niri.nix
omnigraph changes --type=replace

# Recent activity
omnigraph lessons --recent
omnigraph git-log 5
omnigraph session-resume

# Semantic search
omnigraph semantic "authentication flow" --type=function
```

## License

MIT
