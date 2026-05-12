import { GraphDB } from "../db.ts";

export class LessonsCommand {
  async run(
    projectPath: string,
    dbPath: string,
    args: string[],
    _options: {}
  ): Promise<void> {
    if (!this.checkDB(dbPath)) return;

    const db = new GraphDB(dbPath);
    const allNodes = db.getAllNodes();
    const allEdges = db.getAllEdges();
    const annotationsByNode = db.getAllAnnotations();

    const lessonItems = allNodes.filter((n: any) => n.type === "lesson_item");
    const moduleFilter = args.find(a => a.startsWith("--module="));
    const isRecent = args.includes("--recent") || args.includes("-r");
    const isAll = args.includes("--all") || args.includes("-a");

    let filtered = lessonItems;
    if (moduleFilter) {
      const modPath = moduleFilter.replace("--module=", "");
      const applicableIds = new Set(
        allEdges.filter(e => e.type === "lesson_applies_to" && e.to_id === modPath).map(e => e.from_id)
      );
      filtered = filtered.filter((n: any) => applicableIds.has(n.id));
    }

    if (isRecent) {
      filtered.sort((a: any, b: any) => {
        const dateA = a.created_at || "0000";
        const dateB = b.created_at || "0000";
        return dateB.localeCompare(dateA);
      });
      filtered = filtered.slice(0, 15);
    }

    console.log(`\n## Lesson Items (${filtered.length}${moduleFilter ? ` for ${moduleFilter.replace("--module=", "")}` : ""})\n`);
    for (const li of filtered) {
      const tags = (annotationsByNode.get(li.id) || [])
        .filter(a => a.key === "tag")
        .map(a => a.value);
      const date = li.created_at || "";
      const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
      const modules = allEdges
        .filter(e => e.from_id === li.id && e.type === "lesson_applies_to")
        .map(e => e.to_id);
      const modStr = modules.length ? ` → ${modules.join(", ")}` : "";
      console.log(`  ${date ? `[${date}] ` : ""}${li.label}${tagStr}${modStr}`);
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
