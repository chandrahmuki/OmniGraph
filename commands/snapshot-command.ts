import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  name?: string;
}

export class SnapshotCommand {
  name = "snapshot";
  description = "Manage graph snapshots (save/restore graph state)";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const subcommand = args[0];
    const name = args[1];

    switch (subcommand) {
      case "create": {
        if (!name) {
          console.log("Usage: omnigraph snapshot create <name>");
          process.exit(1);
        }
        const db = new GraphDB(dbPath);
        const result = db.createSnapshot(name);
        console.log(`✓ Snapshot created: ${name}`);
        console.log(`  ID: ${result.id}`);
        console.log(`  Nodes: ${result.nodes}`);
        console.log(`  Edges: ${result.edges}`);
        db.close();
        break;
      }

      case "list": {
        const db = new GraphDB(dbPath);
        const snapshots = db.listSnapshots();
        if (snapshots.length === 0) {
          console.log("No snapshots found.");
        } else {
          console.log("\n## Snapshots\n");
          console.log("| ID | Name | Created | Nodes | Edges |");
          console.log("|----|------|---------|-------|-------|");
          for (const s of snapshots) {
            console.log(`| ${s.id} | ${s.name} | ${s.created_at.split("T")[0]} | ${s.nodes} | ${s.edges} |`);
          }
        }
        db.close();
        break;
      }

      case "delete": {
        if (!name) {
          console.log("Usage: omnigraph snapshot delete <name>");
          process.exit(1);
        }
        const db = new GraphDB(dbPath);
        const deleted = db.deleteSnapshot(name);
        if (deleted) {
          console.log(`✓ Snapshot deleted: ${name}`);
        } else {
          console.error(`Snapshot not found: ${name}`);
        }
        db.close();
        break;
      }

      default: {
        console.log("Usage: omnigraph snapshot <create|list|delete> [name]");
        process.exit(1);
      }
    }
  }
}
