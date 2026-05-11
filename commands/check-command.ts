import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class CheckCommand {
  name = "check";
  description = "Pre-edit check for a file (dependencies, sessions, lessons)";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph check <file-path>");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allEdges = db.getAllEdges();
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const node = allNodes.find((n: any) => n.id === target || n.file_path === target);
    if (!node) {
      console.log(`Node not found: ${target}`);
      db.close();
      process.exit(1);
    }

    console.log(`\n## Pre-edit Check: ${node.id}\n`);

    const deps = allEdges.filter((e: any) => e.from_id === node.id);
    const reverseDeps = allEdges.filter((e: any) => e.to_id === node.id && !e.from_id.startsWith("2026-"));

    if (deps.length > 0) {
      console.log(`### Uses (${deps.length}):`);
      for (const e of deps.slice(0, 10)) {
        const target = nodeMap.get(e.to_id);
        console.log(`  → ${e.to_id} [${e.type}]${target ? ` (${target.type})` : ""}`);
      }
      if (deps.length > 10) console.log(`  ... and ${deps.length - 10} more`);
      console.log();
    }

    if (reverseDeps.length > 0) {
      console.log(`### Used by (${reverseDeps.length}):`);
      for (const e of reverseDeps.slice(0, 10)) {
        const source = nodeMap.get(e.from_id);
        console.log(`  ← ${e.from_id} [${e.type}]${source ? ` (${source.type})` : ""}`);
      }
      if (reverseDeps.length > 10) console.log(`  ... and ${reverseDeps.length - 10} more`);
      console.log();
    }

    const sessions = allEdges.filter((e: any) => e.from_id.startsWith("2026-") && e.to_id === node.id);
    if (sessions.length > 0) {
      console.log(`### Related sessions (${sessions.length}):`);
      for (const e of sessions.slice(0, 5)) {
        console.log(`  - ${e.from_id} [${e.type}]`);
      }
      console.log();
    }

    const risk = reverseDeps.length > 10 ? "HIGH" : reverseDeps.length > 3 ? "MEDIUM" : "LOW";
    console.log(`⚠️  Risk: ${risk} (${reverseDeps.length} reverse deps)`);

    db.close();
  }
}
