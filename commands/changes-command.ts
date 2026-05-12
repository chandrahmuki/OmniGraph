import { GraphDB } from "../db.ts";

export class ChangesCommand {
  name = "changes";
  description = "List changes recorded in sessions and git";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
    const typeFilter = args.find(a => a.startsWith("--type="))?.replace("--type=", "");

    const db = new GraphDB(dbPath);
    const changes = db.getChanges(fileFilter, typeFilter);
    const allEdges = db.getAllEdges();
    const nodeMap = new Map(db.getAllNodes().map((n: any) => [n.id, n]));
    const annotationsByNode = db.getAllAnnotations();

    let header = "";
    if (fileFilter && typeFilter) {
      header = ` affecting ${fileFilter} (type: ${typeFilter})`;
    } else if (fileFilter) {
      header = ` affecting ${fileFilter}`;
    } else if (typeFilter) {
      header = ` (type: ${typeFilter})`;
    }
    console.log(`\n## Changes${header} (${changes.length})\n`);

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
}
