import { GraphDB } from "../db.ts";

export class ChangesCommand {
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
    const annotationsByNode = db.getAllAnnotations();

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
    const typeFilter = args.find(a => a.startsWith("--type="))?.replace("--type=", "");

    let changes = db.db.prepare(`
      SELECT n.id, n.label, n.file_path, n.created_at,
             (SELECT GROUP_CONCAT(s.id)
              FROM edges e
              JOIN nodes s ON e.from_id = s.id
              WHERE e.to_id = n.id AND e.type = 'recorded_change') as recorded_in
      FROM nodes n
      WHERE n.type = 'change'
      ORDER BY n.created_at
    `).all() as any[];

    if (fileFilter) {
      const affectedChangeIds = allEdges
        .filter(e => e.to_id === fileFilter && e.type === "affects")
        .map(e => e.from_id);
      changes = changes.filter(c => affectedChangeIds.includes(c.id));
    }

    if (typeFilter) {
      changes = changes.filter(c => {
        const anns = annotationsByNode.get(c.id) || [];
        const changeType = anns.find(a => a.key === "change_type");
        return changeType && changeType.value === typeFilter;
      });
    }

    if (fileFilter && typeFilter) {
      console.log(`\n## Changes affecting ${fileFilter} (type: ${typeFilter}) (${changes.length})\n`);
    } else if (fileFilter) {
      console.log(`\n## Changes affecting ${fileFilter} (${changes.length})\n`);
    } else if (typeFilter) {
      console.log(`\n## Changes (type: ${typeFilter}) (${changes.length})\n`);
    } else {
      console.log(`\n## Changes (${changes.length})\n`);
    }

    if (!changes.length) {
      console.log("No changes found.");
      db.close();
      return;
    }

    for (const change of changes) {
      const anns = annotationsByNode.get(change.id) || [];
      const changeType = anns.find(a => a.key === "change_type");

      console.log(`### ${change.label}`);
      console.log(`  📅 Date: ${change.created_at || "unknown"}`);
      if (changeType) {
        console.log(`  🏷️ Type: ${changeType.value}`);
      }

      const oldValue = anns.find(a => a.key === "old_value");
      const newValue = anns.find(a => a.key === "new_value");
      if (oldValue && newValue) {
        console.log(`  🔄 ${oldValue.value} → ${newValue.value}`);
      }

      const reason = anns.find(a => a.key === "reason");
      if (reason) {
        console.log(`  📝 Reason: ${reason.value}`);
      }

      const affectsEdges = allEdges.filter(e => e.from_id === change.id && e.type === "affects");
      if (affectsEdges.length) {
        const affectedFiles = affectsEdges.map(e => e.to_id);
        console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
      }

      const resolvesEdges = allEdges.filter(e => e.from_id === change.id && e.type === "resolves");
      if (resolvesEdges.length) {
        const resolvedIssues = resolvesEdges.map(e => {
          const node = nodeMap.get(e.to_id);
          return node ? node.label.slice(0, 80) : e.to_id;
        });
        console.log(`  ✅ Resolves: ${resolvedIssues.join("; ")}`);
      }

      const implementsEdges = allEdges.filter(e => e.from_id === change.id && e.type === "implements");
      if (implementsEdges.length) {
        const implementedDecisions = implementsEdges.map(e => {
          const node = nodeMap.get(e.to_id);
          return node ? node.label.slice(0, 80) : e.to_id;
        });
        console.log(`  💡 Implements: ${implementedDecisions.join("; ")}`);
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
