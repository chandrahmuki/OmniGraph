import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  recent: boolean;
  date?: string;
}

export class SessionsCommand {
  name = "sessions";
  description = "List all sessions from the graph";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allNodes = db.getAllNodes();
    const allEdges = db.getAllEdges();

    const sessions = allNodes.filter((n: any) => n.type === "session");
    let filtered = sessions;

    if (options.date) {
      filtered = sessions.filter((n: any) => n.created_at?.startsWith(options.date));
    }

    if (options.recent) {
      filtered.sort((a: any, b: any) => {
        const dateA = a.created_at || "0000";
        const dateB = b.created_at || "0000";
        return dateB.localeCompare(dateA);
      });
      filtered = filtered.slice(0, 10);
    }

    filtered.sort((a: any, b: any) => {
      const dateA = a.created_at || "0000";
      const dateB = b.created_at || "0000";
      return dateB.localeCompare(dateA);
    });

    console.log(`\n## Sessions (${filtered.length})\n`);
    for (const s of filtered) {
      const modifiedFiles = allEdges.filter(e => e.from_id === s.id && e.type === "session_modified").map(e => e.to_id);
      console.log(`  [${s.created_at || "unknown"}] ${s.label} (${modifiedFiles.length} files)`);
    }

    db.close();
  }
}
