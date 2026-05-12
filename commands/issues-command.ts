import { GraphDB } from "../db.ts";

export class IssuesCommand {
  name = "issues";
  description = "List issues detected in sessions";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
    const unresolvedOnly = args.includes("--unresolved") || args.includes("-u");

    const db = new GraphDB(dbPath);
    const issues = db.getIssues(fileFilter, unresolvedOnly);
    const allEdges = db.getAllEdges();
    const nodeMap = new Map(db.getAllNodes().map((n: any) => [n.id, n]));

    const header = fileFilter ? ` affecting ${fileFilter}` : "";
    const filterText = unresolvedOnly ? " (unresolved)" : "";
    console.log(`\n## Issues${header}${filterText} (${issues.length})\n`);

    if (!issues.length) {
      console.log("No issues found.");
      db.close();
      return;
    }

    for (const issue of issues) {
      console.log(`### ${issue.label}`);
      console.log(`  📅 Detected: ${issue.created_at || "unknown"}`);
      if (issue.sessions) {
        console.log(`  📝 From session: ${issue.sessions}`);
      }
      if (issue.resolved_by) {
        console.log(`  ✅ Resolved by: ${issue.resolved_by}`);
      }
      if (issue.workaround_by) {
        console.log(`  🔄 Workaround: ${issue.workaround_by}`);
      }
      if (!issue.resolved_by && !issue.workaround_by) {
        console.log(`  ⚠️  UNRESOLVED`);
      }

      const affectsEdges = allEdges.filter(e => e.from_id === issue.id && e.type === "affects");
      if (affectsEdges.length) {
        const affectedFiles = affectsEdges.map(e => e.to_id);
        console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
      }
      console.log("");
    }

    db.close();
  }
}
