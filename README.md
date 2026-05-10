# OmniGraph

**Knowledge graph CLI for any project.** Scans code, docs, and memory — builds an interactive dependency graph with D3.js visualization.

- 🚀 **Fast** — ~1.3s build time (40x faster with SQLite optimizations)
- 🧠 **Smart** — Vector embeddings, semantic search, auto-summaries
- 🌐 **Connected** — HTTP API, IDE-ready, export to Gephi/Cytoscape
- 💾 **Offline** — 100% local, zero API calls, SQLite backend

---

## Install

```bash
# Clone repository
git clone https://github.com/chandrahmuki/OmniGraph.git ~/.local/share/omnigraph

# Create symlink (make sure ~/.local/bin is in PATH)
ln -s ~/.local/share/omnigraph/omnigraph.ts ~/.local/bin/omnigraph

# Verify installation
omnigraph --help
```

**Requires:** [Bun](https://bun.sh) runtime

---

## Quick Start

```bash
# 1. Navigate to your project
cd ~/projects/my-project

# 2. Build the graph (first time)
omnigraph build

# 3. Open interactive visualization
open .omnigraph/index.html  # macOS
xdg-open .omnigraph/index.html  # Linux
```

---

## Commands Reference

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `build` | Scan project, build DB, generate HTML | `omnigraph build` |
| `build --incremental` | Skip unchanged files (faster) | `omnigraph build -i` |
| `save "<msg>"` | Git commit + snapshot + rebuild | `omnigraph save "feat: auth"` |
| `query <term>` | Search nodes/annotations | `omnigraph query auth` |
| `search <term>` | Search concepts (functions, classes) | `omnigraph search handleAuth` |
| `search --kind=function` | Filter by concept kind | `omnigraph search auth --kind=function` |

### Dependency Analysis

| Command | Description | Example |
|---------|-------------|---------|
| `check <file>` | Pre-edit impact (deps, sessions, risk) | `omnigraph check src/auth.ts` |
| `impact <file>` | Full transitive reverse dependencies | `omnigraph impact lib/db.ts` |
| `path <a> <b>` | Shortest dependency path between nodes | `omnigraph path A.ts B.ts` |
| `backlinks <file>` | Files that depend on this one | `omnigraph backlinks utils.ts` |
| `backlinks --depth=2` | Transitive backlinks (2 hops) | `omnigraph backlinks utils.ts --depth=2` |
| `backlinks --json` | JSON output for IDE integration | `omnigraph backlinks app.ts --json` |
| `orphans` | Detect unused inputs, dead refs, isolated nodes | `omnigraph orphans` |

### Version Control

| Command | Description | Example |
|---------|-------------|---------|
| `snapshot create <name>` | Save current graph state | `omnigraph snapshot create baseline` |
| `snapshot list` | List all snapshots | `omnigraph snapshot list` |
| `snapshot delete <name>` | Delete a snapshot | `omnigraph snapshot delete old` |
| `diff <snap1> <snap2>` | Compare two snapshots | `omnigraph diff baseline current` |
| `diff --last` | Compare current vs last snapshot | `omnigraph diff --last` |
| `diff --json` | JSON diff output | `omnigraph diff a b --json` |
| `git-log [n]` | Recent git commits with files | `omnigraph git-log 10` |
| `timeline <file>` | Chronological events for a file | `omnigraph timeline src/auth.ts` |

### Export & Integration

| Command | Description | Example |
|---------|-------------|---------|
| `export json [file]` | Export to JSON | `omnigraph export json graph.json` |
| `export graphml [file]` | GraphML for Gephi | `omnigraph export graphml graph.graphml` |
| `export gexf [file]` | GEXF for Cytoscape | `omnigraph export gexf graph.gexf` |
| `export --filter=file` | Export only file nodes | `omnigraph export json --filter=file` |
| `serve --port=8080` | Start HTTP API server | `omnigraph serve --port=8080` |
| `serve --read-only` | Read-only mode | `omnigraph serve --read-only` |

### AI & Semantic Features

| Command | Description | Example |
|---------|-------------|---------|
| `embed build` | Generate vector embeddings | `omnigraph embed build` |
| `embed query <text>` | Semantic search | `omnigraph embed query "auth handling"` |
| `embed --top=5` | Limit results | `omnigraph embed query auth --top=5` |
| `embed --type=function` | Filter by node type | `omnigraph embed query auth --type=function` |
| `ask <question>` | RAG Q&A over codebase | `omnigraph ask "Where is auth?"` |
| `summarize <node>` | Auto-summary for a node | `omnigraph summarize db.ts` |
| `summarize --clusters` | Summarize all clusters | `omnigraph summarize --clusters` |

### Analytics

| Command | Description | Example |
|---------|-------------|---------|
| `analytics` | Graph statistics & metrics | `omnigraph analytics` |
| `analytics --json` | JSON output | `omnigraph analytics --json` |
| `hotspots` | Most-modified files + error patterns | `omnigraph hotspots` |

### Memory & Sessions

| Command | Description | Example |
|---------|-------------|---------|
| `session-resume` | Last session summary + context | `omnigraph session-resume` |
| `lessons` | List lesson items | `omnigraph lessons` |
| `lessons --recent` | Recent lessons only | `omnigraph lessons --recent` |
| `lessons --module=<file>` | Lessons for specific module | `omnigraph lessons --module=auth.ts` |
| `errors` | List errors with fix status | `omnigraph errors` |
| `errors --unresolved` | Only unresolved errors | `omnigraph errors --unresolved` |
| `errors --file=<path>` | Errors affecting specific file | `omnigraph errors --file=auth.ts` |
| `issues` | List issues from sessions | `omnigraph issues` |
| `decisions` | List decisions with rationale | `omnigraph decisions` |
| `changes` | List changes (git + sessions) | `omnigraph changes` |
| `changes --type=replace` | Filter by change type | `omnigraph changes --type=replace` |

### Search

| Command | Description | Example |
|---------|-------------|---------|
| `semantic <query>` | BM25 semantic search | `omnigraph semantic "auth flow"` |
| `semantic --type=function` | Filter by node type | `omnigraph semantic auth --type=function` |
| `semantic --top=20` | Number of results | `omnigraph semantic auth --top=20` |

---

## HTTP API

Start the server:
```bash
omnigraph serve --port 8080
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /` | HTML | API documentation |
| `GET /api/nodes` | GET | List all nodes |
| `GET /api/nodes/:id` | GET | Node details + backlinks |
| `GET /api/backlinks?id=<id>` | GET | Reverse dependencies |
| `GET /api/impact?id=<id>` | GET | Impact analysis (BFS) |
| `GET /api/search?q=<query>` | GET | Text search |
| `GET /api/semantic?q=<query>` | GET | Semantic search |
| `POST /api/ask` | POST | RAG Q&A |
| `GET /api/summarize/:id` | GET | Auto-summary for node |
| `GET /api/analytics` | GET | Graph analytics |
| `GET /api/export?format=json` | GET | Export graph |
| `GET /api/stats` | GET | Basic statistics |
| `POST /api/webhook/git-push` | POST | Git webhook |

### Examples

```bash
# Get graph stats
curl http://localhost:8080/api/stats

# Semantic search
curl "http://localhost:8080/api/semantic?q=authentication&top=5"

# Get backlinks
curl "http://localhost:8080/api/backlinks?id=src/auth.ts&depth=2"

# Ask a question
curl -X POST http://localhost:8080/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Where is authentication handled?"}'

# Export for Gephi
curl http://localhost:8080/api/export?format=graphml > graph.graphml
```

---

## Session Workflow

### Recommended Workflow

```bash
# 1. Start working on a feature
git checkout -b feat/auth

# 2. Make changes, then save progress
omnigraph save "feat: add authentication"
# This does: git commit + snapshot + rebuild

# 3. Continue working...

# 4. Resume later (next day/session)
omnigraph session-resume
# Shows: last session summary + files modified + impact analysis

# 5. Before editing a file
omnigraph check src/auth.ts
# Shows: dependencies, reverse deps, risk level

# 6. After major changes
omnigraph snapshot create post-auth-feature
# Save graph state for future comparison
```

### What Gets Saved in a Session

When you run `omnigraph save "<message>"`:

1. **Git commit** — Your code changes
2. **Graph snapshot** — Current state of dependency graph
3. **Session summary** (`memory/sessions/<date>_topic/summary.md`):
   - Files modified
   - Errors encountered
   - Fixes applied
   - Decisions made
   - Lessons learned
   - Changes recorded

### Updating the Graph

**Option 1: Manual rebuild**
```bash
# Full rebuild (scans all files)
omnigraph build

# Incremental (only changed files)
omnigraph build --incremental
```

**Option 2: Save command (recommended)**
```bash
# Commit + snapshot + rebuild in one
omnigraph save "feat: description"
```

**Option 3: Automatic (HTTP webhook)**
```bash
# Configure git post-commit hook
echo 'omnigraph build --incremental' >> .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

### Session Resume Workflow

```bash
# Find latest session
LATEST=$(ls -t memory/sessions/ | head -1)

# Read summary
cat memory/sessions/$LATEST/summary.md

# Run impact analysis on modified files
omnigraph check <file-from-summary>
```

Or simply:
```bash
omnigraph session-resume
```

---

## Configuration

Create `omnigraph.jsonc` in your project root:

```jsonc
{
  "project_name": "MyProject",
  "scan_dirs": ["src", "lib", "."],
  "ignore_dirs": [".git", "node_modules", ".omnigraph", "dist", "build"],
  "ignore_files": ["*.min.js", "*.lock", "*.d.ts"],
  "extensions": [".ts", ".js", ".py", ".nix", ".rs", ".go"],
  "memory": {
    "sessions_dir": "memory/sessions",
    "lessons_dir": "memory/lessons",
    "skills_dir": "memory/skills"
  }
}
```

---

## Project Structure

```
my-project/
├── .omnigraph/              # Generated (gitignore this)
│   ├── graph.db            # SQLite dependency graph
│   ├── graph.db-shm        # SQLite shared memory
│   ├── graph.db-wal        # SQLite write-ahead log
│   └── index.html          # Interactive D3.js visualization
├── memory/
│   ├── sessions/           # Session snapshots (YYYY-MM-DD_topic/)
│   │   └── 2026-05-10_feat-auth/
│   │       └── summary.md  # Structured session data
│   ├── lessons/            # Lesson files
│   └── skills/             # Skill definitions
├── omnigraph.jsonc         # Project config
└── omnigraph.ts            # CLI tool (installed globally)
```

---

## Features

### Core
- ✅ **Universal parsing** — Regex extractors for any language (JS/TS/Python/Nix/Rust/Go/C)
- ✅ **Tree-sitter AST** — Optional deep parsing for functions, classes, structs
- ✅ **Cross-file call graph** — Track function calls across files via imports
- ✅ **Incremental builds** — ~1.3s build time (content hash caching)
- ✅ **Dead node cleanup** — Auto-remove references to deleted files

### Memory Layer
- ✅ **Sessions** — Automatic extraction of files modified, errors, fixes
- ✅ **Lessons** — Structured learning items
- ✅ **Errors/Fixes** — Track resolved and unresolved issues
- ✅ **Workarounds** — Document bypass solutions
- ✅ **Decisions** — Record rationale for choices
- ✅ **Changes** — Git + session change tracking

### AI & Search
- ✅ **Vector embeddings** — 128D TF-IDF vectors
- ✅ **Semantic search** — Cosine similarity ranking
- ✅ **RAG Q&A** — Context-aware answers
- ✅ **Auto-summaries** — Generate node/cluster summaries
- ✅ **Analytics** — Density, hub nodes, clusters

### Visualization
- ✅ **D3.js force-directed** — Interactive graph
- ✅ **Type filters** — Show/hide node types
- ✅ **Cluster filters** — Filter by folder
- ✅ **Focus mode** — Isolate node + neighbors
- ✅ **Search** — Real-time filtering
- ✅ **Legend** — Color-coded types

### Integration
- ✅ **HTTP API** — 13 REST endpoints
- ✅ **Export formats** — JSON, GraphML (Gephi), GEXF (Cytoscape)
- ✅ **Git integration** — Commits, hooks, webhooks
- ✅ **IDE-ready** — JSON output for plugins

---

## Examples

### Pre-Edit Safety Check
```bash
# See what depends on this file before editing
omnigraph check src/auth.ts

# Output:
# ## Pre-edit Check: src/auth.ts
# ### Used by (14):
#   ← src/api.ts [imports] (file)
#   ← src/middleware.ts [imports] (file)
# ⚠️  Risk: MEDIUM (14 reverse deps)
```

### Impact Analysis
```bash
# See full blast radius
omnigraph impact lib/database.ts

# Output:
# ## Impact Analysis: lib/database.ts
# Total affected: 47 nodes
# ### Direct dependents:
#   src/users.ts [imports]
#   src/posts.ts [imports]
# ### Depth 2:
#   src/api.ts (file)
#   src/routes.ts (file)
```

### Find Dependency Path
```bash
# How are these files connected?
omnigraph path inputs.niri modules/terminal.niri

# Output:
# ## Path: inputs.niri → modules/terminal.niri
# Length: 3 hops
# ● inputs.niri (input)
# → config.niri (file)
# → modules/base.niri (file)
# → modules/terminal.niri (file)
```

### Semantic Search
```bash
# Find code by meaning, not exact match
omnigraph embed query "user authentication"

# Output:
# ## Semantic Search: "user authentication"
# 87.3%  handleLogin (function)
# 82.1%  validateToken (function)
# 79.5%  src/auth.ts (file)
```

### Auto-Summary
```bash
# Generate summary for a complex file
omnigraph summarize src/auth.ts

# Output:
# ## Summary: src/auth.ts
# src/auth.ts is a file located in src/auth.ts.
# It has 47 related nodes within 2 hops.
# Connected to: 12 function, 8 change, 5 session, 3 error...
# Clusters: src, lib
```

### Graph Analytics
```bash
# Get graph statistics
omnigraph analytics

# Output:
# ## Graph Analytics
# **Total:** 738 nodes, 1370 edges
# **Density:** 0.25%
# **Avg Degree:** 3.44
# ### Hub Nodes (Top 10):
#   db.ts: 74 connections
#   omnigraph.ts:fetch: 67
# ### Clusters:
#   extractors/: 212 nodes
#   memory/: 125 nodes
```

---

## Troubleshooting

### "Database is locked"
```bash
# Wait a moment and retry (SQLite WAL mode)
sleep 2 && omnigraph build

# Or kill stuck processes
pkill -f "omnigraph.ts serve"
```

### "Graph not found"
```bash
# Build the graph first
omnigraph build
```

### "Node not found"
```bash
# Use exact node ID from query results
omnigraph query <partial-name>
omnigraph check <exact-id-from-results>
```

### Slow build
```bash
# Use incremental mode (only scans changed files)
omnigraph build --incremental

# Check what's being scanned
omnigraph orphans
```

---

## Performance

| Metric | Time |
|--------|------|
| Build (full) | ~1.3s |
| Build (incremental) | ~0.3s |
| Semantic search | ~50ms |
| Q&A (RAG) | ~60ms |
| HTTP API | <10ms/response |
| Embeddings (700 nodes) | ~100ms |

---

## License

MIT
