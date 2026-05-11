import { GraphDB } from "../db.ts";
import path from "node:path";
import fs from "node:fs";

interface Options {
  vacuum: boolean;
}

export class CleanupCommand {
  name = "cleanup";
  description = "Remove dead nodes, orphans, and stale edges";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);

    console.log("\n## DB Cleanup\n");

    const cleanup = db.cleanupDeadNodes(projectPath);
    console.log(`Removed ${cleanup.removed} dead references`);
    console.log(`Removed ${cleanup.orphans} orphan nodes\n`);

    const staleEdges = db.cleanupStaleEdges();
    console.log(`Removed ${staleEdges} stale edges\n`);

    if (options.vacuum) {
      console.log("Vacuuming database...");
      db.vacuum();
      console.log("✓ Database optimized\n");
    }

    const stats = db.count();
    console.log(`Final: ${stats.nodes} nodes, ${stats.edges} edges`);

    db.close();
  }
}
