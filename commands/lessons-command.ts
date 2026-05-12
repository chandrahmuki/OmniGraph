import { GraphDB } from "../db.ts";

export class LessonsCommand {
  name = "lessons";
  description = "List lesson items (recent, for module, or all)";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const moduleFilter = args.find(a => a.startsWith("--module="))?.replace("--module=", "");
    const recentOnly = args.includes("--recent") || args.includes("-r");

    const db = new GraphDB(dbPath);
    const items = db.getLessonItems(moduleFilter, recentOnly, 15);
    const allEdges = db.getAllEdges();
    const annotationsByNode = db.getAllAnnotations();

    const header = moduleFilter ? ` for ${moduleFilter}` : "";
    const filterText = recentOnly ? " (recent)" : "";
    console.log(`\n## Lesson Items${header}${filterText} (${items.length})\n`);

    if (!items.length) {
      console.log("No lesson items found.");
      db.close();
      return;
    }

    for (const li of items) {
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
}
