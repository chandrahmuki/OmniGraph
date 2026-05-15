---
description: Query the omnigraph dependency graph (check, query, impact, path, orphans, session-resume, semantic)
---

Use the `skill` tool to load the "omnigraph" skill, then execute the requested command.

Always use the system `omnigraph` command (installed via NixOS). Never use `bun run omnigraph.ts`.

Run `omnigraph <command>` from project root.

## Available commands

| Command | Description |
|---------|-------------|
| `omnigraph check <file>` | Pre-edit impact analysis |
| `omnigraph query <term>` | Search nodes/annotations |
| `omnigraph search <term>` | Search concepts (--kind=function\|class\|struct) |
| `omnigraph impact <file>` | Transitive reverse deps (BFS) |
| `omnigraph path <a> <b>` | Shortest path BFS |
| `omnigraph orphans` | Unused inputs, isolated files, dead refs |
| `omnigraph git-log` | Recent commits with files |
| `omnigraph session-resume` | Resume last session — modified files + context |
| `omnigraph semantic <q>` | BM25 semantic search (--type=, --top=) |
| `omnigraph build` | Scan → build DB → generate HTML |

## If `.omnigraph/graph.db` is missing

Run `omnigraph build` first.

## Output

Present results in max 15 lines, structured format.

$ARGUMENTS
