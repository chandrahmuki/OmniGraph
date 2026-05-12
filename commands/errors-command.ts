import { GraphDB } from "../db.ts";

export class ErrorsCommand {
  name = "errors";
  description = "List errors in graph with their fix status";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
    const unresolvedOnly = args.includes("--unresolved") || args.includes("-u");

    const db = new GraphDB(dbPath);
    const errors = db.getErrors(fileFilter, unresolvedOnly);
    const allEdges = db.getAllEdges();

    const header = fileFilter ? ` affecting ${fileFilter}` : "";
    const filterText = unresolvedOnly ? " (unresolved)" : "";
    console.log(`\n## Errors${header}${filterText} (${errors.length})\n`);

    if (!errors.length) {
      console.log("No errors found.");
      db.close();
      return;
    }

    for (const err of errors) {
      console.log(`### ${err.label}`);
      console.log(`  📁 ${err.file_path}`);
      if (err.sessions) {
        console.log(`  📅 Sessions: ${err.sessions}`);
      }
      if (err.fixes) {
        console.log(`  ✅ Fixes: ${err.fixes}`);
      }
      if (err.workarounds) {
        console.log(`  🔄 Workarounds: ${err.workarounds}`);
      }
      if (!err.fixes && !err.workarounds) {
        console.log(`  ⚠️  UNRESOLVED`);
      }

      const affectsEdges = allEdges.filter(e => e.from_id === err.id && e.type === "affects");
      if (affectsEdges.length) {
        const affectedFiles = affectsEdges.map(e => e.to_id);
        console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
      }
      console.log("");
    }

    db.close();
  }
}
