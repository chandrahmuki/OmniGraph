import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class GitLogCommand {
  name = "git-log";
  description = "Show recent git commits with files modified";

  async run(projectPath: string, dbPath: string): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allNodes = db.getAllNodes();
    const allEdges = db.getAllEdges();

    const commits = allNodes.filter((n: any) => n.type === "commit");
    commits.sort((a: any, b: any) => {
      const dateA = a.created_at || "0000";
      const dateB = b.created_at || "0000";
      return dateB.localeCompare(dateA);
    });

    console.log("\n## Recent Commits\n");
    for (const commit of commits.slice(0, 10)) {
      const files = allEdges
        .filter(e => e.from_id === commit.id && e.type === "changed")
        .map(e => e.to_id);
      
      console.log(`[${commit.created_at?.split("T")[0]}] ${commit.label}`);
      for (const f of files.slice(0, 5)) {
        console.log(`  - ${f}`);
      }
      if (files.length > 5) {
        console.log(`  ... and ${files.length - 5} more`);
      }
      console.log();
    }

    db.close();
  }
}
