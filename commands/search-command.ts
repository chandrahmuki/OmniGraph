import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  kind?: string;
}

export class SearchCommand {
  name = "search";
  description = "Search concepts (functions, classes, structs, types)";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const term = args[0];
    if (!term) {
      console.log("Usage: omnigraph search <term> [--kind=function|class|struct]");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const results = db.searchConcepts(term, options.kind);

    console.log(`\n## Search: "${term}"${options.kind ? ` (kind: ${options.kind})` : ""}\n`);
    if (results.length === 0) {
      console.log("No results found.");
    } else {
      for (const r of results.slice(0, 20)) {
        console.log(`[${r.kind}] ${r.name}`);
        if (r.file_path) console.log(`  ${r.file_path}:${r.line_number || "?"}`);
      }
      if (results.length > 20) console.log(`\n... and ${results.length - 20} more`);
    }

    db.close();
  }
}
