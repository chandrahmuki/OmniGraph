# OmniGraph Roadmap 2026

**Vision:** Code dependency graph + memory system + AI-native search — tout-en-un pour devs.

---

## Phase 1: Core Enhancements (2-3 semaines)

### 1.1 Graph Diff & Versioning 📊
**Priorité:** HIGH | **Effort:** 2 jours

**Commands:**
```bash
omnigraph diff <build1> <build2>     # Compare two builds
omnigraph diff --last                # Compare current vs previous build
omnigraph snapshot create <name>     # Save current graph state
omnigraph snapshot list              # List saved snapshots
omnigraph snapshot restore <name>    # Restore a snapshot
```

**Implementation:**
- Add `graph_snapshots` table: `id, name, created_at, nodes_hash, edges_hash`
- Add `snapshot_nodes`, `snapshot_edges` junction tables
- Store diff as JSON: `{added_nodes, removed_nodes, added_edges, removed_edges}`
- CLI: compute diff via set operations on node/edge IDs

**Files to modify:**
- `db.ts` — new tables, snapshot CRUD methods
- `omnigraph.ts` — new subcommands
- `extract.ts` — auto-save snapshot on `build`

---

### 1.2 Backlinks & Reverse Dependencies 🔗
**Priorité:** HIGH | **Effort:** 1 jour

**Commands:**
```bash
omnigraph backlinks <file>           # Show all files that depend on this
omnigraph backlinks <file> --depth=2 # Transitive backlinks
omnigraph backlinks <file> --json    # Machine-readable output
```

**Implementation:**
- Already have BFS in `impact` command — refactor into reusable `getBacklinks()` in `db.ts`
- Add `--depth` parameter for transitive vs direct only
- Add `--json` for IDE integration

**Files to modify:**
- `db.ts` — add `getBacklinks(nodeId, depth)` method
- `omnigraph.ts` — new `backlinks` case in switch

---

### 1.3 Export Formats (GraphML, GEXF, JSON) 📤
**Priorité:** MEDIUM | **Effort:** 1 jour

**Commands:**
```bash
omnigraph export graphml             # Export to GraphML (Gephi compatible)
omnigraph export gexf                # Export to GEXF (Cytoscape)
omnigraph export json                # Export to raw JSON
omnigraph export json --filter=file  # Only file nodes
```

**Implementation:**
- GraphML: XML format with `<node id="..." label="...">` and `<edge source="..." target="...">`
- GEXF: Similar XML with graphviz attributes
- JSON: Direct serialization of `getAllNodes()`, `getAllEdges()`

**Files to modify:**
- `db.ts` — add `exportGraphML()`, `exportGEXF()`, `exportJSON()` methods
- `omnigraph.ts` — new `export` case with subcommand parsing

---

### 1.4 Enhanced Visualization UI 🎨
**Priorité:** MEDIUM | **Effort:** 3 jours

**Features:**
- Filter by node type (checkboxes: file, function, class, error, session)
- Search box with autocomplete
- Focus mode: click node → hide unrelated nodes (distance > 2)
- Cluster highlighting: color by module/folder
- Legend panel with confidence distribution
- Minimap for large graphs

**Implementation:**
- `web/build.ts` — add filter state, search index
- D3: add `.filter()` on force simulation, update on checkbox change
- Focus mode: BFS from clicked node, opacity=0.1 for others
- Clusters: pre-compute by folder prefix, assign colors

**Files to modify:**
- `web/build.ts` — generate enhanced HTML with filters
- `web/template.html` — new UI controls (or inline in build.ts)

---

## Phase 2: AI & Semantic Search (3-4 semaines)

### 2.1 Vector Embeddings 🧠
**Priorité:** HIGH | **Effort:** 4 jours

**Commands:**
```bash
omnigraph embed build                # Generate embeddings for all nodes
omnigraph embed query "<question>"   # Semantic search with vectors
omnigraph embed similar <node-id>    # Find similar nodes
```

**Implementation:**
- Use `@xenova/transformers` (Bun-compatible) for local embeddings
- Model: `all-MiniLM-L6-v2` (80MB, fast, 384 dims)
- Add `embeddings` table: `node_id, vector BLOB, model_version`
- Cosine similarity query: `1 - (a·b / ||a||·||b||)`

**Files to modify:**
- `package.json` — add `@xenova/transformers`
- `db.ts` — new `embeddings` table, similarity query method
- `extractors/semantic.ts` — replace BM25 with vector search (or hybrid)
- `omnigraph.ts` — new `embed` command

**Alternative (lighter):** Call Ollama API if available, fallback to BM25

---

### 2.2 LLM Q&A Interface 💬
**Priorité:** MEDIUM | **Effort:** 3 jours

**Commands:**
```bash
omnigraph ask "Where is auth handled?"           # RAG over graph
omnigraph ask "What files would break if I change X?"  # Impact + explanation
omnigraph ask --stream                           # Streaming response
```

**Implementation:**
- RAG pipeline:
  1. Embed query → top 5 similar nodes
  2. Fetch node content + 2-hop neighborhood
  3. Build prompt: "You are a codebase assistant. Context: {nodes}. Question: {q}"
  4. Call LLM (Ollama local or OpenAI)
- Add `llm_config` to `omnigraph.jsonc`: `{provider, model, api_key}`

**Files to modify:**
- `omnigraph.ts` — new `ask` command
- `extractors/semantic.ts` — add `retrieveContext(query, k)` method
- `config.default.jsonc` — add LLM config section

---

### 2.3 Auto-Summaries & Cluster Labeling 🏷️
**Priorité:** LOW | **Effort:** 2 jours

**Commands:**
```bash
omnigraph summarize <node-id>          # Generate summary for a node
omnigraph summarize --clusters         # Label all clusters
omnigraph annotate <node-id> "TODO"    # Add manual annotation
```

**Implementation:**
- Cluster detection: Louvain algorithm (or simple folder-based)
- For each cluster: extract top 5 keywords (TF-IDF), prompt LLM for label
- Node summaries: fetch node + 1-hop neighbors, prompt LLM

**Files to modify:**
- `db.ts` — add `getClusters()` method
- `omnigraph.ts` — new `summarize`, `annotate` commands

---

## Phase 3: Collaboration & Integration (2-3 semaines)

### 3.1 HTTP API Server 🌐
**Statut:** ✅ IMPLÉMENTÉ

**Commandes:**
```bash
omnigraph serve --port 8080            # Start HTTP server
omnigraph serve --read-only            # No write operations
```

**Endpoints:**
```
GET  /api/nodes                         # List all nodes
GET  /api/nodes/:id                     # Get node by ID + backlinks
GET  /api/nodes/:id/backlinks           # Get backlinks
GET  /api/search?q=auth                 # Text search
GET  /api/semantic?q=auth               # Semantic search
POST /api/ask                           # LLM Q&A (RAG)
GET  /api/backlinks?id=file.ts          # Reverse dependencies
GET  /api/impact?id=file.ts             # Impact analysis (BFS)
GET  /api/export?format=json            # Full graph export
GET  /api/export?format=graphml         # GraphML for Gephi
GET  /api/stats                         # Graph statistics
POST /api/webhook/git-push              # Git webhook
GET  /                                  # API docs (HTML)
```

**Implémentation:**
- Bun.serve() natif — zero dépendance
- CORS enabled pour apps web
- JSON responses pour tous endpoints
- HTML docs sur `/`
- Mode read-only optionnel

**Cas d'usage:**
- IDE plugins (VS Code, Neovim)
- Dashboard web
- Scripts Python/Node.js
- CI/CD integration
- Webhooks Git

---

### 3.2 GitHub/GitLab Integration 🔗
**Priorité:** MEDIUM | **Effort:** 2 jours

**Commandes:**
```bash
omnigraph github link <repo>           # Link GitHub repo
omnigraph github pr <number>           # Analyze PR impact
omnigraph github status                # Show linked repo status
```

**Endpoints:**
```
GET  /api/nodes                         # List all nodes
GET  /api/nodes/:id                     # Get node by ID
GET  /api/nodes/:id/backlinks           # Get backlinks
GET  /api/search?q=auth                 # Search nodes
POST /api/query                         # SQL-like query (read-only)
GET  /api/graph                         # Full graph export
POST /api/ask                           # LLM Q&A
```

**Implementation:**
- Use Bun's native `Bun.serve()` API
- Add CORS headers, API key auth (optional)
- Rate limiting: 100 req/min default

**Files to modify:**
- `omnigraph.ts` — new `serve` command with route handlers
- `db.ts` — ensure thread-safe reads (already SQLite WAL mode)

---

### 3.2 GitHub/GitLab Integration 🔗
**Priorité:** MEDIUM | **Effort:** 2 jours

**Commands:**
```bash
omnigraph github link <repo>           # Link GitHub repo
omnigraph github pr <number>           # Analyze PR impact
omnigraph github status                # Show linked repo status
```

**Features:**
- Webhook listener: auto-rebuild on push
- PR comments: post impact analysis as comment
- Badge: "Graph health: 95% coverage"

**Implementation:**
- Use `octokit` for GitHub API
- Store repo config in `.omnigraph/github.json`
- Webhook: `omnigraph webhook` endpoint for CI/CD

**Files to modify:**
- `package.json` — add `octokit`
- `omnigraph.ts` — new `github` command
- `extractors/git.ts` — enhance with PR metadata

---

### 3.3 IDE Plugins 🖥️
**Priorité:** LOW | **Effort:** 4 jours

**Targets:**
- VS Code extension (TypeScript)
- Neovim plugin (Lua)
- JetBrains plugin (Kotlin)

**Features:**
- Sidebar: graph visualization (mini)
- Right-click: "Show impact" on any file
- Inline: backlink count in gutter
- Command palette: `OmniGraph: Search`, `OmniGraph: Ask`

**Implementation:**
- VS Code: use webview for D3 graph, call `omnigraph serve` API
- Neovim: Telescope picker for search, floating window for impact

**Files to create:**
- `plugins/vscode/` — extension manifest, webview, commands
- `plugins/nvim/` — Lua plugin, Telescope integration

---

## Phase 4: Advanced Features (4-6 semaines)

### 4.1 Multi-User & Permissions 👥
**Priorité:** LOW | **Effort:** 3 jours

**Features:**
- User accounts (local or OAuth)
- Role-based access: read, write, admin
- Shared graphs: team workspace

**Implementation:**
- Add `users` table: `id, email, password_hash, role`
- Add `graph_access` table: `user_id, graph_id, permissions`
- JWT tokens for API auth

**Files to modify:**
- `db.ts` — new tables, auth methods
- `omnigraph.ts` — `login`, `share`, `users` commands

---

### 4.2 Real-Time Sync 🔄
**Priorité:** LOW | **Effort:** 4 jours

**Features:**
- WebSocket: live graph updates on file save
- Collaborative editing: see who's viewing what
- Conflict resolution: last-write-wins with merge hints

**Implementation:**
- WebSocket server in `omnigraph serve`
- File watcher: `fs.watch()` → broadcast to connected clients
- Operational transform for concurrent edits

**Files to modify:**
- `omnigraph.ts` — WebSocket handler in `serve` command
- `extract.ts` — emit events on scan complete

---

### 4.3 Advanced Analytics 📈
**Priorité:** LOW | **Effort:** 3 jours

**Commands:**
```bash
omnigraph analytics                  # Show graph statistics
omnigraph analytics --centrality     # PageRank, betweenness
omnigraph analytics --trends         # Graph growth over time
omnigraph health                     # Graph health score
```

**Metrics:**
- Node/edge count, density, avg degree
- Centrality: PageRank, betweenness, closeness
- Clustering coefficient, modularity
- Health score: coverage %, dead refs, orphan ratio

**Implementation:**
- Graph algorithms: implement in pure JS or use `graphology`
- Store historical metrics in `analytics` table
- Generate CSV/JSON reports

**Files to modify:**
- `db.ts` — add analytics methods
- `omnigraph.ts` — new `analytics`, `health` commands

---

## Phase 5: Ecosystem & Polish (ongoing)

### 5.1 Documentation Site 📚
- Docusaurus or VitePress
- API reference, tutorials, examples
- Host on GitHub Pages

### 5.2 Plugin System 🔌
- Hook system: `onScan`, `onBuild`, `onQuery`
- Example plugins: Mermaid export, Slack notifications
- Plugin registry (npm-based)

### 5.3 Performance Optimization 🚀
- Parallel scanning: worker threads for extractors
- Incremental indexing: only changed files
- Caching: LRU cache for frequent queries

### 5.4 Mobile App 📱
- React Native app for graph viewing
- Offline mode: cached graph
- Push notifications: build complete, errors detected

---

## Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Graph Diff | HIGH | LOW | **P0** |
| Backlinks | HIGH | LOW | **P0** |
| Export GraphML | MEDIUM | LOW | **P1** |
| Enhanced UI | HIGH | MEDIUM | **P1** |
| Vector Embeddings | HIGH | MEDIUM | **P1** |
| HTTP API | HIGH | MEDIUM | **P1** |
| LLM Q&A | MEDIUM | MEDIUM | **P2** |
| GitHub Integration | MEDIUM | MEDIUM | **P2** |
| IDE Plugins | HIGH | HIGH | **P2** |
| Auto-Summaries | LOW | MEDIUM | **P3** |
| Multi-User | LOW | MEDIUM | **P3** |
| Real-Time Sync | LOW | HIGH | **P3** |

---

## Next Actions (This Week)

1. ✅ **Backlinks command** — 1 day, immediate value
2. ✅ **Graph diff** — 2 days, critical for versioning
3. ✅ **Export GraphML** — 1 day, enables Gephi/Cytoscape
4. ✅ **Enhanced UI filters** — 3 days, major UX improvement

**Total: 7 days for Phase 1 core** — ✅ COMPLETE

---

## Phase 2: AI & Semantic Search (3-4 semaines)

### 2.1 Vector Embeddings 🧠
**Statut:** ✅ IMPLÉMENTÉ

**Commandes:**
```bash
omnigraph embed build                # Generate embeddings for all nodes
omnigraph embed query "<question>"   # Semantic search with vectors
omnigraph embed similar <node-id>    # Find similar nodes
```

**Implémentation:**
- Embeddings vectoriels 128D avec TF-IDF simplifié
- Stop words filtering
- Similarité cosinus pour le ranking
- Stockage SQLite (table `embeddings`)
- Zero dépendance externe

**À améliorer:**
- Intégrer @xenova/transformers pour vrais embeddings (all-MiniLM-L6-v2)
- Ou appel API Ollama si disponible

---

### 2.2 LLM Q&A Interface 💬
**Statut:** ✅ IMPLÉMENTÉ (version baseline)

**Commandes:**
```bash
omnigraph ask "Where is auth handled?"           # RAG over graph
omnigraph ask "What files would break if I change X?"  # Impact + explanation
```

**Implémentation actuelle:**
- RAG baseline: retrieval des top 5 nodes similaires
- Affiche le contexte pertinent
- Suggère les commandes next steps (check, backlinks, impact)

**À ajouter:**
- Intégration LLM (Ollama local ou OpenAI)
- Prompt template avec contexte + question
- Streaming response
- Config LLM dans omnigraph.jsonc

---

## Success Metrics

- [ ] Build time < 2s (✅ already achieved)
- [ ] Query latency < 100ms
- [ ] Graph coverage > 90% of files
- [ ] 100+ stars on GitHub
- [ ] 10+ active users (external)
- [ ] IDE plugin installed 100+ times

---

**Last updated:** 2026-05-10
**Next review:** After Phase 1 completion
