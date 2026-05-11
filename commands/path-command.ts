import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class PathCommand {
  name = "path";
  description = "Find shortest dependency path between two nodes";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const fromId = args[0];
    const toId = args[1];
    if (!fromId || !toId) {
      console.log("Usage: omnigraph path <from-node> <to-node>");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allEdges = db.getAllEdges();
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const adjacency = new Map<string, string[]>();
    for (const n of allNodes) {
      adjacency.set(n.id, []);
    }
    for (const e of allEdges) {
      const neighbors = adjacency.get(e.from_id) || [];
      neighbors.push(e.to_id);
      adjacency.set(e.from_id, neighbors);
    }

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
    visited.add(fromId);
    let found: string[] | null = null;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.id === toId) {
        found = current.path;
        break;
      }
      const neighbors = adjacency.get(current.id) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, path: [...current.path, neighbor] });
        }
      }
    }

    console.log(`\n## Path: ${fromId} → ${toId}\n`);
    if (found) {
      console.log(`Length: ${found.length - 1} hops\n`);
      for (let i = 0; i < found.length; i++) {
        const node = nodeMap.get(found[i]);
        const prefix = i === 0 ? "●" : "→";
        console.log(`  ${prefix} ${found[i]} (${node?.type || "?"})`);
      }
    } else {
      console.log("No path found.");
    }

    db.close();
  }
}
