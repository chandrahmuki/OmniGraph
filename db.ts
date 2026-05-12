import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import path from "node:path";

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
      CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);

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
      CREATE INDEX IF NOT EXISTS idx_edges_valid ON edges(valid_from, valid_until);

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
    this.db.exec("PRAGMA busy_timeout = 5000");

    try {
      this.db.exec("ALTER TABLE nodes ADD COLUMN created_at TEXT");
    } catch {}
    try {
      this.db.exec("ALTER TABLE edges ADD COLUMN valid_from TEXT");
    } catch {}
    try {
      this.db.exec("ALTER TABLE edges ADD COLUMN valid_until TEXT");
    } catch {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        nodes_hash TEXT,
        edges_hash TEXT,
        node_count INTEGER,
        edge_count INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_name ON graph_snapshots(name);
      CREATE INDEX IF NOT EXISTS idx_snapshots_created ON graph_snapshots(created_at);

      CREATE TABLE IF NOT EXISTS snapshot_nodes (
        snapshot_id INTEGER NOT NULL,
        node_id TEXT NOT NULL,
        PRIMARY KEY (snapshot_id, node_id),
        FOREIGN KEY (snapshot_id) REFERENCES graph_snapshots(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_snapshot_nodes ON snapshot_nodes(snapshot_id);

      CREATE TABLE IF NOT EXISTS snapshot_edges (
        snapshot_id INTEGER NOT NULL,
        edge_id INTEGER NOT NULL,
        PRIMARY KEY (snapshot_id, edge_id),
        FOREIGN KEY (snapshot_id) REFERENCES graph_snapshots(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_snapshot_edges ON snapshot_edges(snapshot_id);
    `);
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

  cleanupDeadNodes(projectPath: string): { removed: number; orphans: number } {
    const allNodes = this.getAllNodes();
    const deadIds: string[] = [];
    
    for (const n of allNodes) {
      if (n.type === "file" && n.file_path && !n.file_path.startsWith("inputs.")) {
        const fullPath = join(projectPath, n.file_path);
        if (!existsSync(fullPath)) {
          deadIds.push(n.id);
        }
      }
    }

    if (deadIds.length === 0) {
      return { removed: 0, orphans: 0 };
    }

    const deadList = deadIds.map(id => id.replace(/'/g, "''")).join("','");
    this.db.exec(`DELETE FROM edges WHERE from_id IN ('${deadList}') OR to_id IN ('${deadList}')`);
    this.db.exec(`DELETE FROM nodes WHERE id IN ('${deadList}')`);
    
    const orphansResult = this.db.exec(`
      DELETE FROM nodes WHERE id NOT IN (
        SELECT from_id FROM edges UNION SELECT to_id FROM edges
      ) AND type NOT IN ('lesson', 'lesson_item', 'session')
    `);
    const orphans = orphansResult?.changes || 0;

    return { removed: deadIds.length, orphans };
  }

  cleanupStaleEdges(): number {
    const now = new Date().toISOString();
    const result = this.db.exec(`DELETE FROM edges WHERE valid_until IS NOT NULL AND valid_until != '' AND valid_until < '${now}'`);
    return result?.changes || 0;
  }

  vacuum(): void {
    this.db.exec("VACUUM");
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

  createSnapshot(name: string): { id: number; nodes: number; edges: number } {
    const allNodes = this.getAllNodes();
    const allEdges = this.getAllEdges();
    const nodeIds = allNodes.map((n: any) => n.id).sort();
    const edgeIds = allEdges.map((e: any) => e.id).sort();
    
    const nodesHash = Bun.CryptoHasher.hash("sha256", nodeIds.join("|"));
    const edgesHash = Bun.CryptoHasher.hash("sha256", edgeIds.map(id => id.toString()).join("|"));
    const createdAt = new Date().toISOString();

    this.runInTransaction(() => {
      this.db.run(
        `INSERT OR REPLACE INTO graph_snapshots (name, created_at, nodes_hash, edges_hash, node_count, edge_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        name, createdAt, nodesHash, edgesHash, nodeIds.length, edgeIds.length
      );

      const snapshotId = this.db.query("SELECT id FROM graph_snapshots WHERE name = ?").get(name) as { id: number };
      
      this.db.run("DELETE FROM snapshot_nodes WHERE snapshot_id = ?", snapshotId.id);
      this.db.run("DELETE FROM snapshot_edges WHERE snapshot_id = ?", snapshotId.id);

      const nodeStmt = this.db.prepare("INSERT OR IGNORE INTO snapshot_nodes (snapshot_id, node_id) VALUES (?, ?)");
      for (const nodeId of nodeIds) {
        nodeStmt.run(snapshotId.id, nodeId);
      }

      const edgeStmt = this.db.prepare("INSERT OR IGNORE INTO snapshot_edges (snapshot_id, edge_id) VALUES (?, ?)");
      for (const edgeId of edgeIds) {
        edgeStmt.run(snapshotId.id, edgeId);
      }
    });

    const snapshotId = this.db.query("SELECT id FROM graph_snapshots WHERE name = ?").get(name) as { id: number };
    return { id: snapshotId.id, nodes: nodeIds.length, edges: edgeIds.length };
  }

  listSnapshots(): { id: number; name: string; created_at: string; nodes: number; edges: number }[] {
    return this.db.query(`
      SELECT id, name, created_at, node_count as nodes, edge_count as edges
      FROM graph_snapshots
      ORDER BY created_at DESC
    `).all() as any[];
  }

  getSnapshot(name: string): { id: number; name: string; created_at: string; nodes: string[]; edges: number[] } | null {
    const snapshot = this.db.query("SELECT * FROM graph_snapshots WHERE name = ?").get(name) as any;
    if (!snapshot) return null;

    const nodeRows = this.db.query("SELECT node_id FROM snapshot_nodes WHERE snapshot_id = ?").all(snapshot.id) as { node_id: string }[];
    const edgeRows = this.db.query("SELECT edge_id FROM snapshot_edges WHERE snapshot_id = ?").all(snapshot.id) as { edge_id: number }[];

    return {
      id: snapshot.id,
      name: snapshot.name,
      created_at: snapshot.created_at,
      nodes: nodeRows.map(r => r.node_id),
      edges: edgeRows.map(r => r.edge_id)
    };
  }

  deleteSnapshot(name: string): boolean {
    const snapshot = this.db.query("SELECT id FROM graph_snapshots WHERE name = ?").get(name) as { id: number } | undefined;
    if (!snapshot) return false;

    this.db.run("DELETE FROM snapshot_nodes WHERE snapshot_id = ?", snapshot.id);
    this.db.run("DELETE FROM snapshot_edges WHERE snapshot_id = ?", snapshot.id);
    this.db.run("DELETE FROM graph_snapshots WHERE name = ?", name);
    return true;
  }

  diffSnapshots(snapshot1Name: string, snapshot2Name: string): {
    added_nodes: string[];
    removed_nodes: string[];
    added_edges: number[];
    removed_edges: number[];
    snapshot1: { name: string; created_at: string; nodes: number; edges: number };
    snapshot2: { name: string; created_at: string; nodes: number; edges: number };
  } | null {
    const s1 = this.getSnapshot(snapshot1Name);
    const s2 = this.getSnapshot(snapshot2Name);
    if (!s1 || !s2) return null;

    const nodeSet1 = new Set(s1.nodes);
    const nodeSet2 = new Set(s2.nodes);
    const edgeSet1 = new Set(s1.edges);
    const edgeSet2 = new Set(s2.edges);

    const addedNodes = s2.nodes.filter(id => !nodeSet1.has(id));
    const removedNodes = s1.nodes.filter(id => !nodeSet2.has(id));
    const addedEdges = s2.edges.filter(id => !edgeSet1.has(id));
    const removedEdges = s1.edges.filter(id => !edgeSet2.has(id));

    const meta1 = this.db.query("SELECT name, created_at, node_count, edge_count FROM graph_snapshots WHERE name = ?").get(snapshot1Name) as any;
    const meta2 = this.db.query("SELECT name, created_at, node_count, edge_count FROM graph_snapshots WHERE name = ?").get(snapshot2Name) as any;

    return {
      added_nodes: addedNodes,
      removed_nodes: removedNodes,
      added_edges: addedEdges,
      removed_edges: removedEdges,
      snapshot1: { name: meta1.name, created_at: meta1.created_at, nodes: meta1.node_count, edges: meta1.edge_count },
      snapshot2: { name: meta2.name, created_at: meta2.created_at, nodes: meta2.node_count, edges: meta2.edge_count }
    };
  }

  getBacklinks(nodeId: string, depth: number = 1): { id: string; type: string; edge_type: string; distance: number }[] {
    const visited = new Set<string>();
    const queue: { id: string; distance: number }[] = [{ id: nodeId, distance: 0 }];
    visited.add(nodeId);
    const results: { id: string; type: string; edge_type: string; distance: number }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.distance >= depth) continue;

      const edges = this.db.query(`
        SELECT e.from_id, e.type as edge_type, n.type as node_type
        FROM edges e
        LEFT JOIN nodes n ON e.from_id = n.id
        WHERE e.to_id = ? AND e.from_id NOT LIKE '2026-%'
      `).all(current.id) as any[];

      for (const edge of edges) {
        if (!visited.has(edge.from_id)) {
          visited.add(edge.from_id);
          results.push({
            id: edge.from_id,
            type: edge.node_type || "unknown",
            edge_type: edge.edge_type,
            distance: current.distance + 1
          });
          queue.push({ id: edge.from_id, distance: current.distance + 1 });
        }
      }
    }

    return results;
  }

  getFileContext(nodeId: string, depth: number = 1) {
    const node = this.getNodeById(nodeId);
    if (!node) return null;

    const deps = this.db.query(`
      SELECT e.to_id, e.type as edge_type, n.type as node_type, n.label
      FROM edges e
      LEFT JOIN nodes n ON e.to_id = n.id
      WHERE e.from_id = ?
    `).all(nodeId) as any[];

    const backlinks = this.getBacklinks(nodeId, depth);
    const backlinkIds = new Set(backlinks.map(b => b.id));

    const sessions = this.db.query(`
      SELECT e.from_id as session_id, e.type as edge_type
      FROM edges e
      WHERE e.to_id = ? AND e.from_id LIKE '2026-%'
    `).all(nodeId) as any[];

    const errors = this.db.query(`
      SELECT e.from_id as error_id, e.type as edge_type, n.label
      FROM edges e
      LEFT JOIN nodes n ON e.from_id = n.id
      WHERE e.to_id = ? AND e.type = 'affects' AND n.type = 'error'
    `).all(nodeId) as any[];

    const issues = this.db.query(`
      SELECT e.from_id as issue_id, e.type as edge_type, n.label
      FROM edges e
      LEFT JOIN nodes n ON e.from_id = n.id
      WHERE e.to_id = ? AND e.type = 'affects' AND n.type = 'issue'
    `).all(nodeId) as any[];

    const lessons = this.db.query(`
      SELECT e.from_id as lesson_id, e.type as edge_type, n.label
      FROM edges e
      LEFT JOIN nodes n ON e.from_id = n.id
      WHERE e.to_id = ? AND e.type = 'applies_to' AND n.type = 'lesson'
    `).all(nodeId) as any[];

    const directDepCount = backlinks.filter(b => b.distance === 1).length;
    const risk = directDepCount > 10 || errors.length > 0 ? "HIGH" 
                 : directDepCount > 3 ? "MEDIUM" 
                 : "LOW";

    return {
      node,
      deps,
      backlinks,
      sessions,
      errors,
      issues,
      lessons,
      risk,
      dependent_count: directDepCount
    };
  }

  exportJSON(filterType?: string): { nodes: any[]; edges: any[] } {
    let nodes: any[];
    if (filterType) {
      nodes = this.db.query("SELECT * FROM nodes WHERE type = ?").all(filterType) as any[];
    } else {
      nodes = this.getAllNodes();
    }
    const edges = this.getAllEdges();
    
    const nodeIds = new Set(nodes.map(n => n.id));
    const filteredEdges = edges.filter((e: any) => nodeIds.has(e.from_id) && nodeIds.has(e.to_id));

    return { nodes, edges: filteredEdges };
  }

  exportGraphML(): string {
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n';
    xml += '  <key id="type" for="node" attr.name="type" attr.type="string"/>\n';
    xml += '  <key id="label" for="node" attr.name="label" attr.type="string"/>\n';
    xml += '  <key id="file_path" for="node" attr.name="file_path" attr.type="string"/>\n';
    xml += '  <key id="edge_type" for="edge" attr.name="type" attr.type="string"/>\n';
    xml += '  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>\n';
    xml += '  <graph edgedefault="directed">\n';

    for (const node of nodes) {
      xml += `    <node id="${this.escapeXml(node.id)}">\n`;
      xml += `      <data key="type">${this.escapeXml(node.type)}</data>\n`;
      xml += `      <data key="label">${this.escapeXml(node.label)}</data>\n`;
      if (node.file_path) {
        xml += `      <data key="file_path">${this.escapeXml(node.file_path)}</data>\n`;
      }
      xml += `    </node>\n`;
    }

    for (const edge of edges) {
      xml += `    <edge source="${this.escapeXml(edge.from_id)}" target="${this.escapeXml(edge.to_id)}">\n`;
      xml += `      <data key="edge_type">${this.escapeXml(edge.type)}</data>\n`;
      xml += `      <data key="confidence">${this.escapeXml(edge.confidence || "auto")}</data>\n`;
      xml += `    </edge>\n`;
    }

    xml += '  </graph>\n';
    xml += '</graphml>';
    
    return xml;
  }

  exportGEXF(): string {
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n';
    xml += '  <meta lastmodifieddate="' + new Date().toISOString().split('T')[0] + '">\n';
    xml += '    <creator>OmniGraph</creator>\n';
    xml += '  </meta>\n';
    xml += '  <graph defaultedgetype="directed">\n';
    xml += '    <attributes class="node">\n';
    xml += '      <attribute id="0" title="type" type="string"/>\n';
    xml += '      <attribute id="1" title="label" type="string"/>\n';
    xml += '      <attribute id="2" title="file_path" type="string"/>\n';
    xml += '    </attributes>\n';
    xml += '    <nodes>\n';

    for (const node of nodes) {
      xml += `      <node id="${this.escapeXml(node.id)}" label="${this.escapeXml(node.label)}">\n`;
      xml += `        <attvalues>\n`;
      xml += `          <attvalue for="0" value="${this.escapeXml(node.type)}"/>\n`;
      xml += `          <attvalue for="1" value="${this.escapeXml(node.label)}"/>\n`;
      if (node.file_path) {
        xml += `          <attvalue for="2" value="${this.escapeXml(node.file_path)}"/>\n`;
      }
      xml += `        </attvalues>\n`;
      xml += `      </node>\n`;
    }

    xml += '    </nodes>\n';
    xml += '    <edges>\n';

    for (const edge of edges) {
      xml += `      <edge source="${this.escapeXml(edge.from_id)}" target="${this.escapeXml(edge.to_id)}">\n`;
      xml += `        <attvalues>\n`;
      xml += `          <attvalue for="0" value="${this.escapeXml(edge.type)}"/>\n`;
      xml += `        </attvalues>\n`;
      xml += `      </edge>\n`;
    }

    xml += '    </edges>\n';
    xml += '  </graph>\n';
    xml += '</gexf>';
    
    return xml;
  }

  private escapeXml(str: string): string {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private simpleHash(text: string): number[] {
    const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom']);
    
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    
    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    
    const vector = new Array(128).fill(0);
    let idx = 0;
    for (const [word, freq] of wordFreq.entries()) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash;
      }
      const bucket = Math.abs(hash) % 128;
      vector[bucket] += freq * Math.log(1 + word.length);
      idx++;
    }
    
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map(v => v / norm);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  getRelatedNodes(nodeId: string, hops: number = 2): { id: string; type: string; label: string; distance: number }[] {
    const visited = new Map<string, number>();
    const queue: { id: string; distance: number }[] = [{ id: nodeId, distance: 0 }];
    visited.set(nodeId, 0);
    const results: { id: string; type: string; label: string; distance: number }[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.distance >= hops) continue;

      const edges = this.db.query(`
        SELECT e.from_id, e.to_id, n.type, n.label
        FROM edges e
        LEFT JOIN nodes n ON e.to_id = n.id
        WHERE e.from_id = ?
        UNION
        SELECT e.from_id, e.to_id, n.type, n.label
        FROM edges e
        LEFT JOIN nodes n ON e.from_id = n.id
        WHERE e.to_id = ?
      `).all(current.id, current.id) as any[];

      for (const edge of edges) {
        const neighborId = edge.from_id === current.id ? edge.to_id : edge.from_id;
        if (!visited.has(neighborId)) {
          visited.set(neighborId, current.distance + 1);
          results.push({
            id: neighborId,
            type: edge.type || "unknown",
            label: edge.label || neighborId,
            distance: current.distance + 1
          });
          queue.push({ id: neighborId, distance: current.distance + 1 });
        }
      }
    }

    return results;
  }

  generateSummary(nodeId: string): { summary: string; context: string[]; clusters: string[] } | null {
    const node = this.getNodeById(nodeId);
    if (!node) return null;

    const related = this.getRelatedNodes(nodeId, 2);
    const annotations = this.getAnnotationsForNode(nodeId);
    
    const context: string[] = [];
    context.push(`Node: ${node.label} (${node.type})`);
    if (node.file_path) context.push(`File: ${node.file_path}`);
    
    const byType = new Map<string, number>();
    for (const r of related) {
      byType.set(r.type, (byType.get(r.type) || 0) + 1);
    }

    const clusters = new Set<string>();
    if (node.file_path) {
      clusters.add(node.file_path.split('/')[0]);
    }
    for (const r of related) {
      if (r.type === 'file' && related.some(x => x.id.includes(r.id))) {
        const parts = r.id.split('/');
        if (parts.length > 1) clusters.add(parts[0]);
      }
    }

    let summary = `${node.label} is a ${node.type}`;
    if (node.file_path) summary += ` located in ${node.file_path}`;
    summary += `. It has ${related.length} related nodes within 2 hops.`;
    
    if (byType.size > 0) {
      const typeSummary = Array.from(byType.entries())
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');
      summary += ` Connected to: ${typeSummary}.`;
    }

    if (annotations.length > 0) {
      const tags = annotations.filter(a => a.key === 'tag').map(a => a.value);
      if (tags.length > 0) {
        summary += ` Tags: ${tags.join(', ')}.`;
      }
    }

    return { summary, context, clusters: Array.from(clusters) };
  }

  computeAnalytics(): {
    total_nodes: number;
    total_edges: number;
    by_type: Record<string, number>;
    by_edge_type: Record<string, number>;
    density: number;
    avg_degree: number;
    isolated_nodes: number;
    hub_nodes: { id: string; degree: number }[];
    clusters: { name: string; size: number }[];
  } {
    const nodes = this.getAllNodes();
    const edges = this.getAllEdges();
    
    const byType = new Map<string, number>();
    for (const n of nodes) {
      byType.set(n.type, (byType.get(n.type) || 0) + 1);
    }

    const byEdgeType = new Map<string, number>();
    for (const e of edges) {
      byEdgeType.set(e.type, (byEdgeType.get(e.type) || 0) + 1);
    }

    const degreeMap = new Map<string, number>();
    for (const e of edges) {
      degreeMap.set(e.from_id, (degreeMap.get(e.from_id) || 0) + 1);
      degreeMap.set(e.to_id, (degreeMap.get(e.to_id) || 0) + 1);
    }

    const degrees = Array.from(degreeMap.values());
    const avgDegree = degrees.length > 0 ? degrees.reduce((a, b) => a + b, 0) / degrees.length : 0;
    const maxPossibleEdges = nodes.length * (nodes.length - 1);
    const density = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;

    const isolatedNodes = nodes.filter(n => !degreeMap.has(n.id)).length;

    const hubNodes = Array.from(degreeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, degree]) => ({ id, degree }));

    const clusterMap = new Map<string, number>();
    for (const n of nodes) {
      if (n.file_path) {
        const folder = n.file_path.split('/')[0];
        clusterMap.set(folder, (clusterMap.get(folder) || 0) + 1);
      }
    }
    const clusters = Array.from(clusterMap.entries())
      .map(([name, size]) => ({ name, size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return {
      total_nodes: nodes.length,
      total_edges: edges.length,
      by_type: Object.fromEntries(byType),
      by_edge_type: Object.fromEntries(byEdgeType),
      density,
      avg_degree: parseFloat(avgDegree.toFixed(2)),
      isolated_nodes: isolatedNodes,
      hub_nodes: hubNodes,
      clusters
    };
  }

  getCurrentGraphHash(): { nodes_hash: string; edges_hash: string; nodes: number; edges: number } {
    const allNodes = this.getAllNodes();
    const allEdges = this.getAllEdges();
    const nodeIds = allNodes.map((n: any) => n.id).sort();
    const edgeIds = allEdges.map((e: any) => e.id).sort();
    
    return {
      nodes_hash: Bun.CryptoHasher.hash("sha256", nodeIds.join("|")),
      edges_hash: Bun.CryptoHasher.hash("sha256", edgeIds.map(id => id.toString()).join("|")),
      nodes: nodeIds.length,
      edges: edgeIds.length
    };
  }

  close() {
    this.db.close();
  }
}
