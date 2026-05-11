import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  filter?: string;
  outputFile?: string;
}

export class ExportCommand {
  name = "export";
  description = "Export graph to different formats";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const format = args[0];
    const outputFile = args[1] && !args[1].startsWith("--") ? args[1] : null;

    if (!format || !["json", "graphml", "gexf"].includes(format)) {
      console.log("Usage: omnigraph export <json|graphml|gexf> [output-file] [--filter=<type>]");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    let output: string;

    switch (format) {
      case "json": {
        const data = db.exportJSON(options.filter);
        output = JSON.stringify(data, null, 2);
        break;
      }
      case "graphml": {
        if (options.filter) {
          console.error("Filter not supported for GraphML export");
          db.close();
          process.exit(1);
        }
        output = db.exportGraphML();
        break;
      }
      case "gexf": {
        if (options.filter) {
          console.error("Filter not supported for GEXF export");
          db.close();
          process.exit(1);
        }
        output = db.exportGEXF();
        break;
      }
      default: {
        db.close();
        process.exit(1);
      }
    }

    db.close();

    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      console.log(`✓ Exported to ${outputFile}`);
      const stats = fs.statSync(outputFile);
      console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
    } else {
      console.log(output);
    }
  }
}
