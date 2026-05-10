import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Node {
  id: string;
  type: string;
  label: string;
  file_path?: string;
  line_number?: number;
  content_hash?: string;
  created_at?: string;
}

export interface Edge {
  id?: number;
  from_id: string;
  to_id: string;
  type: string;
  confidence?: string;
  valid_from?: string;
  valid_until?: string;
}

export interface Annotation {
  node_id: string;
  key: string;
  value: string;
}

export interface Concept {
  node_id: string;
  kind: string;
  name: string;
  file_path?: string;
  line_number?: number;
  snippet?: string;
}

export class GraphDB {
  db: Database;
  private stmtCache: Map<string, any> = new Map();

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
    this.prepareStatements();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        file_path TEXT,
        line_number INTEGER,
        content_hash TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        confidence TEXT DEFAULT 'auto',
        valid_from TEXT,
        valid_until TEXT,
        UNIQUE(from_id, to_id, type)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
      CREATE INDEX IF NOT EXISTS idx_edges_from_type ON edges(from_id, type);
      CREATE INDEX IF NOT EXISTS idx_edges_to_type ON edges(to_id, type);

      CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_annotations_node ON annotations(node_id);
      CREATE INDEX IF NOT EXISTS idx_annotations_key ON annotations(key);
      CREATE INDEX IF NOT EXISTS idx_annotations_node_key ON annotations(node_id, key);

      CREATE TABLE IF NOT EXISTS concepts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT,
        line_number INTEGER,
        snippet TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_concepts_name ON concepts(name);
      CREATE INDEX IF NOT EXISTS idx_concepts_kind ON concepts(kind);
      CREATE INDEX IF NOT EXISTS idx_concepts_node ON concepts(node_id);
    `);

    this.db.exec("PRAGMA synchronous = OFF");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA cache_size = -64000");
    this.db.exec("PRAGMA temp_store = MEMORY");

    try {
      this.db.exec("ALTER TABLE nodes ADD COLUMN created_at TEXT");
    } catch {}
    try {
      this.db.exec("ALTER TABLE edges ADD COLUMN valid_from TEXT");
    } catch {}
    try {
      this.db.exec("ALTER TABLE edges ADD COLUMN valid_until TEXT");
    } catch {}
  }

  private prepareStatements() {
    this.stmtCache.set('insertNode', this.db.prepare(
      `INSERT OR IGNORE INTO nodes (id, type, label, file_path, line_number, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ));
    this.stmtCache.set('insertEdge', this.db.prepare(
      `INSERT OR IGNORE INTO edges (from_id, to_id, type, confidence)
       VALUES (?, ?, ?, ?)`
    ));
    this.stmtCache.set('insertAnnotation', this.db.prepare(
      `INSERT INTO annotations (node_id, key, value) VALUES (?, ?, ?)`
    ));
    this.stmtCache.set('insertConcept', this.db.prepare(
      `INSERT OR IGNORE INTO concepts (node_id, kind, name, file_path, line_number, snippet)
       VALUES (?, ?, ?, ?, ?, ?)`
    ));
    this.stmtCache.set('getNodeById', this.db.prepare(
      `SELECT * FROM nodes WHERE id = ?`
    ));
    this.stmtCache.set('getAllNodes', this.db.prepare(
      `SELECT * FROM nodes`
    ));
    this.stmtCache.set('getAllNodesMinimal', this.db.prepare(
      `SELECT id, content_hash FROM nodes`
    ));
    this.stmtCache.set('deleteEdgesFromNode', this.db.prepare(
      `DELETE FROM edges WHERE from_id = ?`
    ));
    this.stmtCache.set('deleteNode', this.db.prepare(
      `DELETE FROM nodes WHERE id = ?`
    ));
    this.stmtCache.set('deleteEdges', this.db.prepare(
      `DELETE FROM edges WHERE from_id = ?`
    ));
    this.stmtCache.set('deleteAnnotations', this.db.prepare(
      `DELETE FROM annotations WHERE node_id = ?`
    ));
    this.stmtCache.set('updateEdgeValidUntil', this.db.prepare(
      `UPDATE edges SET valid_until = ? WHERE id = ?`
    ));
    this.stmtCache.set('setEdgeValidFrom', this.db.prepare(
      `UPDATE edges SET valid_from = ? WHERE id = ?`
    ));
    this.stmtCache.set('getEdgesWithValidFrom', this.db.prepare(
      `SELECT id, from_id, to_id, type FROM edges WHERE valid_from IS NOT NULL AND type != 'indexes'`
    ));
    this.stmtCache.set('getAllEdges', this.db.prepare(
      `SELECT id, from_id, to_id, type FROM edges`
    ));
    this.stmtCache.set('getUsesInputEdges', this.db.prepare(
      `SELECT from_id, to_id FROM edges WHERE type = 'uses_input'`
    ));
  }

  beginTransaction() {
    this.db.exec('BEGIN TRANSACTION');
  }

  commitTransaction() {
    this.db.exec('COMMIT');
  }

  rollbackTransaction() {
    this.db.exec('ROLLBACK');
  }

  runInTransaction<T>(fn: () => T): T {
    try {
      this.beginTransaction();
      const result = fn();
      this.commitTransaction();
      return result;
    } catch (e) {
      this.rollbackTransaction();
      throw e;
    }
  }

  insertNode(node: { id: string; type: string; label: string; file_path?: string; line_number?: number; content_hash?: string; created_at?: string }) {
    this.stmtCache.get('insertNode').run(node.id, node.type, node.label, node.file_path || null, node.line_number || null, node.content_hash || null, node.created_at || null);
  }

  insertEdge(edge: { from_id: string; to_id: string; type: string; confidence?: string }) {
    this.stmtCache.get('insertEdge').run(edge.from_id, edge.to_id, edge.type, edge.confidence || "auto");
  }

  insertAnnotation(ann: { node_id: string; key: string; value: string }) {
    this.stmtCache.get('insertAnnotation').run(ann.node_id, ann.key, ann.value);
  }

  insertConcept(concept: { node_id: string; kind: string; name: string; file_path?: string; line_number?: number; snippet?: string }) {
    this.stmtCache.get('insertConcept').run(concept.node_id, concept.kind, concept.name, concept.file_path || null, concept.line_number || null, concept.snippet || null);
  }

  insertNodesBatch(nodes: { id: string; type: string; label: string; file_path?: string; line_number?: number; content_hash?: string; created_at?: string }[]) {
    const stmt = this.stmtCache.get('insertNode');
    for (const node of nodes) {
      stmt.run(node.id, node.type, node.label, node.file_path || null, node.line_number || null, node.content_hash || null, node.created_at || null);
    }
  }

  insertEdgesBatch(edges: { from_id: string; to_id: string; type: string; confidence?: string }[]) {
    const stmt = this.stmtCache.get('insertEdge');
    for (const edge of edges) {
      stmt.run(edge.from_id, edge.to_id, edge.type, edge.confidence || "auto");
    }
  }

  insertConceptsBatch(concepts: { node_id: string; kind: string; name: string; file_path?: string; line_number?: number; snippet?: string }[]) {
    const stmt = this.stmtCache.get('insertConcept');
    for (const concept of concepts) {
      stmt.run(concept.node_id, concept.kind, concept.name, concept.file_path || null, concept.line_number || null, concept.snippet || null);
    }
  }

  searchConcepts(term: string, kindFilter?: string): any[] {
    const safeTerm = `%${term.toLowerCase()}%`;
    let query = `
      SELECT c.*, n.type as node_type, n.label as node_label
      FROM concepts c
      LEFT JOIN nodes n ON c.node_id = n.id
      WHERE LOWER(c.name) LIKE ?
    `;
    const params: any[] = [safeTerm];
    if (kindFilter) {
      query += ` AND c.kind = ?`;
      params.push(kindFilter);
    }
    query += ` ORDER BY c.kind, c.name`;
    return this.db.query(query).all(...params) as any[];
  }

  getConceptsForNode(nodeId: string): any[] {
    return this.db.query("SELECT * FROM concepts WHERE node_id = ?").all(nodeId) as any[];
  }

  getNodeById(id: string): any | null {
    return this.stmtCache.get('getNodeById').get(id) as any | null;
  }

  deleteEdgesFromNode(fromId: string) {
    this.stmtCache.get('deleteEdgesFromNode').run(fromId);
  }

  deleteNode(id: string) {
    this.stmtCache.get('deleteNode').run(id);
    this.stmtCache.get('deleteEdges').run(id);
    this.stmtCache.get('deleteAnnotations').run(id);
  }

  getAllNodes(): any[] {
    return this.stmtCache.get('getAllNodes').all();
  }

  getAllNodesMinimal(): { id: string; content_hash: string | null }[] {
    return this.stmtCache.get('getAllNodesMinimal').all();
  }

  getAllEdges(): any[] {
    return this.stmtCache.get('getAllEdges').all();
  }

  getUsesInputEdges(): { from_id: string; to_id: string }[] {
    return this.stmtCache.get('getUsesInputEdges').all();
  }

  getEdgesWithValidFrom(): { id: number; from_id: string; to_id: string; type: string }[] {
    return this.stmtCache.get('getEdgesWithValidFrom').all();
  }

  getAnnotationsForNode(nodeId: string): any[] {
    return this.db.query("SELECT * FROM annotations WHERE node_id = ?").all(nodeId);
  }

  getAllAnnotations(): Map<string, { key: string; value: string }[]> {
    const rows = this.db.query("SELECT node_id, key, value FROM annotations").all() as { node_id: string; key: string; value: string }[];
    const map = new Map<string, { key: string; value: string }[]>();
    for (const row of rows) {
      if (!map.has(row.node_id)) map.set(row.node_id, []);
      map.get(row.node_id)!.push({ key: row.key, value: row.value });
    }
    return map;
  }

  getNeighbors(nodeId: string): any[] {
    return this.db.query(`
      SELECT n.*, e.type as edge_type, e.confidence
      FROM nodes n
      JOIN edges e ON (n.id = e.to_id OR n.id = e.from_id)
      WHERE (e.from_id = ? OR e.to_id = ?)
        AND n.id != ?
    `).all(nodeId, nodeId, nodeId);
  }

  count(): { nodes: number; edges: number } {
    const nodes = this.db.query("SELECT COUNT(*) as c FROM nodes").get() as { c: number };
    const edges = this.db.query("SELECT COUNT(*) as c FROM edges").get() as { c: number };
    return { nodes: nodes.c, edges: edges.c };
  }

  clear() {
    this.db.exec("DELETE FROM nodes; DELETE FROM edges; DELETE FROM annotations; DELETE FROM concepts;");
  }

  updateEdgeValidUntil(edgeId: number, validUntil: string) {
    this.db.prepare("UPDATE edges SET valid_until = ? WHERE id = ?").run(validUntil, edgeId);
  }

  getEdgesForNode(nodeId: string, onlyValid = true): any[] {
    if (onlyValid) {
      return this.db.query(`
        SELECT * FROM edges
        WHERE (from_id = ? OR to_id = ?)
          AND (valid_until IS NULL OR valid_until = '')
      `).all(nodeId, nodeId);
    }
    return this.db.query(`
      SELECT * FROM edges
      WHERE from_id = ? OR to_id = ?
    `).all(nodeId, nodeId);
  }

  getEdgeHistory(nodeId: string): any[] {
    return this.db.query(`
      SELECT e.*,
        CASE WHEN e.valid_until IS NULL THEN 'active' ELSE 'expired' END as status
      FROM edges e
      WHERE e.from_id = ? OR e.to_id = ?
      ORDER BY e.valid_from, e.id
    `).all(nodeId, nodeId);
  }

  close() {
    this.db.close();
  }
}
