import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export class GraphDB {
  db: Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
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
        UNIQUE(from_id, to_id, type)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);

      CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_annotations_node ON annotations(node_id);
    `);

    try {
      this.db.exec("ALTER TABLE nodes ADD COLUMN created_at TEXT");
    } catch {}
  }

  insertNode(node: { id: string; type: string; label: string; file_path?: string; line_number?: number; content_hash?: string; created_at?: string }) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO nodes (id, type, label, file_path, line_number, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(node.id, node.type, node.label, node.file_path || null, node.line_number || null, node.content_hash || null, node.created_at || null);
  }

  insertEdge(edge: { from_id: string; to_id: string; type: string; confidence?: string }) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO edges (from_id, to_id, type, confidence)
       VALUES (?, ?, ?, ?)`
    );
    stmt.run(edge.from_id, edge.to_id, edge.type, edge.confidence || "auto");
  }

  insertAnnotation(ann: { node_id: string; key: string; value: string }) {
    const stmt = this.db.prepare(
      `INSERT INTO annotations (node_id, key, value) VALUES (?, ?, ?)`
    );
    stmt.run(ann.node_id, ann.key, ann.value);
  }

  getNodeById(id: string): any | null {
    return this.db.query("SELECT * FROM nodes WHERE id = ?").get(id) as any | null;
  }

  deleteEdgesFromNode(fromId: string) {
    this.db.exec(`DELETE FROM edges WHERE from_id = '${fromId.replace(/'/g, "''")}'`);
  }

  deleteNode(id: string) {
    const safeId = id.replace(/'/g, "''");
    this.db.exec(`DELETE FROM nodes WHERE id = '${safeId}'`);
    this.db.exec(`DELETE FROM edges WHERE from_id = '${safeId}'`);
    this.db.exec(`DELETE FROM annotations WHERE node_id = '${safeId}'`);
  }

  getAllNodes(): any[] {
    return this.db.query("SELECT * FROM nodes").all();
  }

  getAllEdges(): any[] {
    return this.db.query("SELECT * FROM edges").all();
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
    this.db.exec("DELETE FROM nodes; DELETE FROM edges; DELETE FROM annotations;");
  }

  close() {
    this.db.close();
  }
}
