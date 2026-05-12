import { GraphDB } from "../db.ts";

export class ErrorsCommand {
  async run(
    projectPath: string,
    dbPath: string,
    args: string[],
    _options: {}
  ): Promise<void> {
    if (!this.checkDB(dbPath)) return;

    const db = new GraphDB(dbPath);
    const allEdges = db.getAllEdges();
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
    const unresolvedOnly = args.includes("--unresolved") || args.includes("-u");

    let errors = db.db.prepare(`
      SELECT e.id, e.label, e.file_path,
             (SELECT GROUP_CONCAT(DISTINCT f.label || ' [' || f.file_path || ']')
              FROM edges er
              JOIN nodes f ON er.to_id = f.id
              WHERE er.from_id = e.id AND er.type = 'resolved_by') as fixes,
             (SELECT GROUP_CONCAT(DISTINCT w.label || ' [' || w.file_path || ']')
              FROM edges er
              JOIN nodes w ON er.to_id = w.id
              WHERE er.from_id = e.id AND er.type = 'workaround_by') as workarounds,
             (SELECT GROUP_CONCAT(DISTINCT s.id)
              FROM edges de
              JOIN nodes s ON de.from_id = s.id
              WHERE de.to_id = e.id AND de.type = 'detected_error') as sessions
      FROM nodes e
      WHERE e.type = 'error'
      ORDER BY e.id
    `).all() as any[];

    if (fileFilter) {
      const affectedErrorIds = allEdges
        .filter(e => e.to_id === fileFilter && e.type === "affects")
        .map(e => e.from_id);
      errors = errors.filter(e => affectedErrorIds.includes(e.id));
      console.log(`\n## Errors affecting ${fileFilter} (${errors.length})\n`);
    } else {
      console.log(`\n## Errors (${errors.length})\n`);
    }

    if (!errors.length) {
      console.log("No errors found.");
      db.close();
      return;
    }

    for (const err of errors) {
      if (unresolvedOnly && (err.fixes || err.workarounds)) continue;

      console.log(`### ${err.label}`);
      console.log(`  📁 ${err.file_path}`);
      if (err.sessions) {
        console.log(`  📅 Sessions: ${err.sessions}`);
      }
      if (err.fixes) {
        console.log(`  ✅ Fixes: ${err.fixes}`);
      }
      if (err.workarounds) {
        console.log(`  🔄 Workarounds: ${err.workarounds}`);
      }
      if (!err.fixes && !err.workarounds) {
        console.log(`  ⚠️  UNRESOLVED`);
      }

      const affectsEdges = allEdges.filter(e => e.from_id === err.id && e.type === "affects");
      if (affectsEdges.length) {
        const affectedFiles = affectsEdges.map(e => e.to_id);
        console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
      }
      console.log("");
    }

    db.close();
  }

  private checkDB(dbPath: string): boolean {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }
    return true;
  }
}
