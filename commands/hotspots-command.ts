import { GraphDB } from "../db.ts";

export class HotspotsCommand {
  name = "hotspots";
  description = "Show most-modified files and recurring error patterns";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const hotspots = db.getHotspots(15);
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const errorPattern = /\b(crash|failure|broken|segfault|panic|OOM|unreachable|fatal)\b/i;

    console.log("\n## Hotspots\n");

    for (const hs of hotspots) {
      const node = nodeMap.get(hs.target);
      const label = node ? node.label : hs.target;
      console.log(`### ${label} (${hs.target})`);
      console.log(`  Sessions: ${hs.session_count} | Lessons: ${hs.lesson_count}`);

      if (hs.sessions.length > 0) {
        console.log(`  Recent sessions: ${hs.sessions.slice(-3).join(", ")}`);
      }

      const errorItems = db.db.query(`
        SELECT li.id, li.label, li.type
        FROM edges e
        JOIN nodes li ON e.from_id = li.id
        WHERE e.to_id = ? AND e.type = 'lesson_applies_to' AND li.type = 'lesson_item'
      `).all(hs.target) as any[];

      const errorLabels = errorItems
        .filter(item => errorPattern.test(item.label))
        .map(item => item.label);

      if (errorLabels.length > 0) {
        console.log(`  Recurring issues:`);
        for (const err of [...new Set(errorLabels)].slice(0, 5)) {
          console.log(`    - ${err}`);
        }
      }

      console.log("");
    }

    if (hotspots.length === 0) {
      console.log("No hotspots found.");
    }

    db.close();
  }
}
