import { GraphDB } from "../db.ts";

interface Options {
  recent: boolean;
  date?: string;
}

export class SessionsCommand {
  name = "sessions";
  description = "List all sessions from the graph";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const sessions = db.getSessions(options.date, options.recent, 10);

    console.log(`\n## Sessions (${sessions.length})\n`);

    for (const s of sessions) {
      const files = db.getSessionFiles(s.id);
      console.log(`  [${s.created_at || "unknown"}] ${s.label} (${files.length} files)`);
    }

    db.close();
  }
}
