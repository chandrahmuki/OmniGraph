import { GraphDB } from "../db.ts";

export class DecisionsCommand {
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

    let decisions = db.db.prepare(`
      SELECT n.id, n.label, n.file_path, n.created_at,
             (SELECT GROUP_CONCAT(s.id)
              FROM edges e
              JOIN nodes s ON e.from_id = s.id
              WHERE e.to_id = n.id AND e.type = 'made_decision') as sessions
      FROM nodes n
      WHERE n.type = 'decision'
      ORDER BY n.created_at
    `).all() as any[];

    if (fileFilter) {
      const affectedDecisionIds = allEdges
        .filter(e => e.to_id === fileFilter && e.type === "applies_to")
        .map(e => e.from_id);
      decisions = decisions.filter(d => affectedDecisionIds.includes(d.id));
      console.log(`\n## Decisions affecting ${fileFilter} (${decisions.length})\n`);
    } else {
      console.log(`\n## Decisions (${decisions.length})\n`);
    }

    if (!decisions.length) {
      console.log("No decisions found.");
      db.close();
      return;
    }

    for (const decision of decisions) {
      console.log(`### ${decision.label}`);
      console.log(`  📅 Date: ${decision.created_at || "unknown"}`);
      if (decision.sessions) {
        console.log(`  📝 From session: ${decision.sessions}`);
      }

      const anns = annotationsByNode.get(decision.id) || [];
      const rationale = anns.find(a => a.key === "rationale");
      if (rationale) {
        console.log(`  📝 Rationale: ${rationale.value}`);
      }
      const alternatives = anns.find(a => a.key === "alternatives");
      if (alternatives) {
        console.log(`  🔄 Alternatives: ${alternatives.value}`);
      }

      const appliesEdges = allEdges.filter(e => e.from_id === decision.id && e.type === "applies_to");
      if (appliesEdges.length) {
        const appliesTo = appliesEdges.map(e => e.to_id);
        console.log(`  📂 Applies to: ${appliesTo.join(", ")}`);
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
