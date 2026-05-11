import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class ImpactCommand {
  name = "impact";
  description = "Show full blast radius of changing a file (transitive reverse deps)";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph impact <file-path>");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const allEdges = db.getAllEdges();
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const visited = new Set<string>();
    const queue = [target];
    visited.add(target);
    const layers: Map<number, string[]> = new Map();
    let depth = 0;

    while (queue.length > 0) {
      const nextQueue: string[] = [];
      const currentLayer: string[] = [];
      for (const current of queue) {
        currentLayer.push(current);
        const reverseDeps = allEdges.filter((e: any) =>
          e.to_id === current && !e.from_id.startsWith("2026-")
        );
        for (const edge of reverseDeps) {
          if (!visited.has(edge.from_id)) {
            visited.add(edge.from_id);
            nextQueue.push(edge.from_id);
          }
        }
      }
      if (currentLayer.length > 0) {
        layers.set(depth, currentLayer);
      }
      depth++;
      queue.length = 0;
      queue.push(...nextQueue);
    }

    console.log(`\n## Impact Analysis: ${target}\n`);
    console.log(`Total affected: ${visited.size - 1} nodes (excluding source)\n`);

    const directDeps = allEdges.filter((e: any) =>
      e.to_id === target && !e.from_id.startsWith("2026-")
    );
    const directDepIds = [...new Set(directDeps.map((e: any) => e.from_id))];
    if (directDepIds.length) {
      console.log("### Direct dependents:");
      for (const id of directDepIds) {
        const node = nodeMap.get(id);
        const edgeTypes = directDeps.filter((e: any) => e.from_id === id).map((e: any) => e.type);
        console.log(`  ${id} [${[...new Set(edgeTypes)].join(",")}]${node ? ` (${node.type})` : ""}`);
      }
    }

    for (let d = 1; d < depth; d++) {
      const layer = layers.get(d);
      if (layer && layer.length > 0) {
        console.log(`\n### Depth ${d}:`);
        for (const id of layer) {
          const node = nodeMap.get(id);
          console.log(`  ${id} (${node?.type || "?"})`);
        }
      }
    }

    db.close();
  }
}
