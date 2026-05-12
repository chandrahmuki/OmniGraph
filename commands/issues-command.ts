import { GraphDB } from "../db.ts";

export class IssuesCommand {
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

    let issues = db.db.prepare(`
      SELECT n.id, n.label, n.file_path, n.created_at,
             (SELECT GROUP_CONCAT(DISTINCT s.id)
              FROM edges e
              JOIN nodes s ON e.from_id = s.id
              WHERE e.to_id = n.id AND e.type = 'detected_issue') as sessions,
             (SELECT GROUP_CONCAT(DISTINCT c.label)
              FROM edges e
              JOIN nodes c ON e.to_id = n.id
              WHERE e.from_id = c.id AND e.type = 'resolves') as resolved_by,
             (SELECT GROUP_CONCAT(DISTINCT c.label)
              FROM edges e
              JOIN nodes c ON e.to_id = n.id
              WHERE e.from_id = c.id AND e.type = 'workaround_for') as workaround_by
      FROM nodes n
      WHERE n.type = 'issue'
      ORDER BY n.created_at
    `).all() as any[];

    if (fileFilter) {
      const affectedIssueIds = allEdges
        .filter(e => e.to_id === fileFilter && e.type === "affects")
        .map(e => e.from_id);
      issues = issues.filter(i => affectedIssueIds.includes(i.id));
      console.log(`\n## Issues affecting ${fileFilter} (${issues.length})\n`);
    } else {
      console.log(`\n## Issues (${issues.length})\n`);
    }

    if (!issues.length) {
      console.log("No issues found.");
      db.close();
      return;
    }

    for (const issue of issues) {
      if (unresolvedOnly && (issue.resolved_by || issue.workaround_by)) continue;

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

  private checkDB(dbPath: string): boolean {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }
    return true;
  }
}
