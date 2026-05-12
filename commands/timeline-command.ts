import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class TimelineCommand {
  name = "timeline";
  description = "Show timeline of events for a file";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph timeline <file-path>");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const events = db.getFileTimeline(target);

    if (events.length === 0) {
      console.log(`\n## Timeline: ${target}\n`);
      console.log("No events found for this file.");
      db.close();
      return;
    }

    console.log(`\n## Timeline: ${target}\n`);
    console.log(`Total events: ${events.length}\n`);

    for (const event of events) {
      const icon = event.type === "CHANGE" ? "📝" : event.type === "ISSUE" ? "⚠️" : event.type === "DECISION" ? "💡" : "📋";
      console.log(`${event.date ? `[${event.date}]` : "[unknown]"} ${icon} ${event.type}: ${event.label.slice(0, 100)}`);
      if (event.metadata) {
        console.log(`    ${event.metadata}`);
      }
    }

    db.close();
  }
}
