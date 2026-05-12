import { GraphDB } from "../db.ts";

export class GitLogCommand {
  name = "git-log";
  description = "Show recent git commits with files modified";

  async run(projectPath: string, dbPath: string): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    try {
      const db = new GraphDB(dbPath);
      const commits = db.getRecentCommits(10);

      console.log("\n## Recent Commits\n");
      
      if (commits.length === 0) {
        console.log("No commits found in graph.");
        db.close();
        return;
      }

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
    } catch (error) {
      console.error(`Error reading git log: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }
}
