import { GraphDB } from "../db.ts";

export class HotspotsCommand {
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
    const annotationsByNode = db.getAllAnnotations();

    const sessionModCount = new Map<string, number>();
    const sessionModSessions = new Map<string, string[]>();
    for (const e of allEdges) {
      if (e.type === "session_modified") {
        sessionModCount.set(e.to_id, (sessionModCount.get(e.to_id) || 0) + 1);
        if (!sessionModSessions.has(e.to_id)) sessionModSessions.set(e.to_id, []);
        sessionModSessions.get(e.to_id)!.push(e.from_id);
      }
    }

    const lessonApplyCount = new Map<string, number>();
    const lessonApplyLessons = new Map<string, string[]>();
    for (const e of allEdges) {
      if (e.type === "lesson_applies_to") {
        lessonApplyCount.set(e.to_id, (lessonApplyCount.get(e.to_id) || 0) + 1);
        if (!lessonApplyLessons.has(e.to_id)) lessonApplyLessons.set(e.to_id, []);
        lessonApplyLessons.get(e.to_id)!.push(e.from_id);
      }
    }

    const allTargets = new Set([...sessionModCount.keys(), ...lessonApplyCount.keys()]);
    const sorted = [...allTargets].sort((a, b) => {
      const scoreA = (sessionModCount.get(a) || 0) * 2 + (lessonApplyCount.get(a) || 0);
      const scoreB = (sessionModCount.get(b) || 0) * 2 + (lessonApplyCount.get(b) || 0);
      return scoreB - scoreA;
    });

    console.log("\n## Hotspots\n");
    const errorPattern = /\b(crash|failure|broken|segfault|panic|OOM|unreachable|fatal)\b/i;

    for (const target of sorted.slice(0, 15)) {
      const sCount = sessionModCount.get(target) || 0;
      const lCount = lessonApplyCount.get(target) || 0;
      if (sCount === 0 && lCount === 0) continue;

      const node = nodeMap.get(target);
      const label = node ? node.label : target;
      console.log(`### ${label} (${target})`);
      console.log(`  Sessions: ${sCount} | Lessons: ${lCount}`);

      if (sCount > 0) {
        const sessions = sessionModSessions.get(target) || [];
        console.log(`  Sessions: ${sessions.slice(-3).join(", ")}`);
      }

      const relatedErrors = allEdges
        .filter(e => e.to_id === target && e.type === "caused")
        .map(e => e.from_id);

      const errorLessons = (lessonApplyLessons.get(target) || [])
        .filter(lId => {
          const items = allEdges.filter(e => e.from_id === lId && e.type === "lesson_contains").map(e => e.to_id);
          return items.some(itemId => {
            const itemNode = nodeMap.get(itemId);
            return itemNode && errorPattern.test(itemNode.label);
          });
        });

      if (errorLessons.length > 0) {
        console.log(`  Error-related lessons: ${errorLessons.join(", ")}`);
      }

      const errorItems = allEdges
        .filter(e => e.to_id === target && e.type === "lesson_applies_to")
        .map(e => e.from_id)
        .flatMap(lessonId =>
          allEdges.filter(e => e.from_id === lessonId && e.type === "lesson_contains").map(e => e.to_id)
        )
        .filter(itemId => {
          const itemNode = nodeMap.get(itemId);
          return itemNode && itemNode.type === "lesson_item" && errorPattern.test(itemNode.label);
        })
        .map(itemId => {
          const itemNode = nodeMap.get(itemId);
          const tags = (annotationsByNode.get(itemId) || []).filter(a => a.key === "tag").map(a => a.value);
          return `${itemNode.label}${tags.length ? ` [${tags.join(", ")}]` : ""}`;
        });

      if (errorItems.length > 0) {
        console.log(`  Recurring issues:`);
        for (const err of [...new Set(errorItems)].slice(0, 5)) {
          console.log(`    - ${err}`);
        }
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
