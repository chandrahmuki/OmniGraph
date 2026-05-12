import { GraphDB } from "../db.ts";

export class GitLogCommand {
  name = "git-log";
  description = "Show recent git commits with files modified";

  async run(projectPath: string, dbPath: string): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const commits = db.getRecentCommits(10);

    console.log("\n## Recent Commits\n");
    
    for (const commit of commits) {
      const date = commit.created_at?.split("T")[0] || "unknown";
      console.log(`[${date}] ${commit.label}`);
      for (const f of commit.files.slice(0, 5)) {
        console.log(`  - ${f}`);
      }
      if (commit.files.length > 5) {
        console.log(`  ... and ${commit.files.length - 5} more`);
      }
      console.log();
    }

    db.close();
  }
}
