import { GraphDB } from "../db.ts";
import path from "node:path";
import fs from "node:fs";

export class OrphansCommand {
  name = "orphans";
  description = "Detect unused inputs, dead refs, isolated nodes";

  async run(projectPath: string, dbPath: string): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allNodes = db.getAllNodes();
    const allEdges = db.getAllEdges();

    const nodeIds = new Set(allNodes.map((n: any) => n.id));
    const fromIds = new Set(allEdges.map((e: any) => e.from_id));
    const toIds = new Set(allEdges.map((e: any) => e.to_id));

    const orphans = allNodes.filter((n: any) => !fromIds.has(n.id) && !toIds.has(n.id));
    const unusedInputs = allNodes.filter((n: any) => n.type === "input" && !toIds.has(n.id));
    const deadRefs = allNodes.filter((n: any) => {
      if (n.type !== "file" || !n.file_path) return false;
      const fullPath = path.join(projectPath, n.file_path);
      return !fs.existsSync(fullPath);
    });

    console.log("\n## Orphan Analysis\n");

    if (orphans.length > 0) {
      console.log(`### Isolated nodes (${orphans.length}):`);
      for (const o of orphans.slice(0, 20)) {
        console.log(`  ${o.id} (${o.type})`);
      }
      if (orphans.length > 20) console.log(`  ... and ${orphans.length - 20} more`);
      console.log();
    }

    if (unusedInputs.length > 0) {
      console.log(`### Unused inputs (${unusedInputs.length}):`);
      for (const i of unusedInputs) {
        console.log(`  ${i.id}`);
      }
      console.log();
    }

    if (deadRefs.length > 0) {
      console.log(`### Dead references (${deadRefs.length}):`);
      for (const d of deadRefs) {
        console.log(`  ${d.id} — file not found: ${d.file_path}`);
      }
      console.log();
    }

    if (orphans.length === 0 && unusedInputs.length === 0 && deadRefs.length === 0) {
      console.log("✓ No orphans found!");
    }

    db.close();
  }
}
