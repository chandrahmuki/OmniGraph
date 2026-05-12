import { GraphDB } from "../db.ts";

export class PathCommand {
  name = "path";
  description = "Find shortest dependency path between two nodes";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
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
    const path = db.findPath(fromId, toId);
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    console.log(`\n## Path: ${fromId} → ${toId}\n`);
    
    if (path) {
      console.log(`Length: ${path.length - 1} hops\n`);
      for (let i = 0; i < path.length; i++) {
        const node = nodeMap.get(path[i]);
        const prefix = i === 0 ? "●" : "→";
        console.log(`  ${prefix} ${path[i]} (${node?.type || "?"})`);
      }
    } else {
      console.log("No path found.");
    }

    db.close();
  }
}
