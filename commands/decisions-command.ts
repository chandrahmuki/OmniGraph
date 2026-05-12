import { GraphDB } from "../db.ts";

export class DecisionsCommand {
  name = "decisions";
  description = "List decisions made in sessions";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");

    const db = new GraphDB(dbPath);
    const decisions = db.getDecisions(fileFilter);
    const allEdges = db.getAllEdges();
    const annotationsByNode = db.getAllAnnotations();

    const header = fileFilter ? ` affecting ${fileFilter}` : "";
    console.log(`\n## Decisions${header} (${decisions.length})\n`);

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
}
