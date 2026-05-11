import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  asJson: boolean;
}

export class DiffCommand {
  name = "diff";
  description = "Compare two snapshots or current vs last build";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const snapshot1 = args[0];
    const snapshot2 = args[1];

    if (!snapshot1) {
      console.log("Usage: omnigraph diff <snapshot1> <snapshot2> [--json]");
      console.log("       omnigraph diff --last (compare current vs last build)");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    let diffResult: any;

    if (snapshot1 === "--last") {
      const snapshots = db.listSnapshots();
      if (snapshots.length < 1) {
        console.error("No snapshots found. Create one with: omnigraph snapshot create <name>");
        db.close();
        process.exit(1);
      }
      const last = snapshots[0];
      const currentHash = db.getCurrentGraphHash();
      
      const allNodes = db.getAllNodes();
      const allEdges = db.getAllEdges();
      const lastSnapshot = db.getSnapshot(last.name);
      
      if (!lastSnapshot) {
        console.error("Failed to load snapshot");
        db.close();
        process.exit(1);
      }

      const nodeSet1 = new Set(lastSnapshot.nodes);
      const edgeSet1 = new Set(lastSnapshot.edges);
      const nodeSet2 = new Set(allNodes.map((n: any) => n.id));
      const edgeSet2 = new Set(allEdges.map((e: any) => e.id));

      const addedNodes = Array.from(nodeSet2).filter(id => !nodeSet1.has(id));
      const removedNodes = Array.from(nodeSet1).filter(id => !nodeSet2.has(id));
      const addedEdges = Array.from(edgeSet2).filter(id => !edgeSet1.has(id));
      const removedEdges = Array.from(edgeSet1).filter(id => !edgeSet2.has(id));

      diffResult = {
        added_nodes: addedNodes,
        removed_nodes: removedNodes,
        added_edges: addedEdges,
        removed_edges: removedEdges,
        snapshot1: { name: last.name, created_at: last.created_at, nodes: lastSnapshot.nodes.length, edges: lastSnapshot.edges.length },
        snapshot2: { name: "current", created_at: new Date().toISOString(), nodes: currentHash.nodes, edges: currentHash.edges }
      };
    } else {
      diffResult = db.diffSnapshots(snapshot1, snapshot2);
      if (!diffResult) {
        console.error(`Snapshot not found: ${snapshot1} or ${snapshot2}`);
        db.close();
        process.exit(1);
      }
    }

    if (options.asJson) {
      console.log(JSON.stringify(diffResult, null, 2));
    } else {
      console.log("\n## Graph Diff\n");
      console.log(`**From:** ${diffResult.snapshot1.name} (${diffResult.snapshot1.created_at.split("T")[0]}) — ${diffResult.snapshot1.nodes} nodes, ${diffResult.snapshot1.edges} edges`);
      console.log(`**To:** ${diffResult.snapshot2.name} (${diffResult.snapshot2.created_at.split("T")[0]}) — ${diffResult.snapshot2.nodes} nodes, ${diffResult.snapshot2.edges} edges\n`);

      console.log(`### Summary`);
      console.log(`- Added nodes: ${diffResult.added_nodes.length}`);
      console.log(`- Removed nodes: ${diffResult.removed_nodes.length}`);
      console.log(`- Added edges: ${diffResult.added_edges.length}`);
      console.log(`- Removed edges: ${diffResult.removed_edges.length}\n`);

      if (diffResult.added_nodes.length > 0) {
        console.log("### Added nodes:");
        for (const id of diffResult.added_nodes.slice(0, 20)) {
          console.log(`  + ${id}`);
        }
        if (diffResult.added_nodes.length > 20) {
          console.log(`  ... and ${diffResult.added_nodes.length - 20} more`);
        }
        console.log();
      }

      if (diffResult.removed_nodes.length > 0) {
        console.log("### Removed nodes:");
        for (const id of diffResult.removed_nodes.slice(0, 20)) {
          console.log(`  - ${id}`);
        }
        if (diffResult.removed_nodes.length > 20) {
          console.log(`  ... and ${diffResult.removed_nodes.length - 20} more`);
        }
        console.log();
      }

      if (diffResult.added_edges.length > 0) {
        console.log("### Added edges:");
        for (const id of diffResult.added_edges.slice(0, 20)) {
          console.log(`  + Edge #${id}`);
        }
        if (diffResult.added_edges.length > 20) {
          console.log(`  ... and ${diffResult.added_edges.length - 20} more`);
        }
        console.log();
      }

      if (diffResult.removed_edges.length > 0) {
        console.log("### Removed edges:");
        for (const id of diffResult.removed_edges.slice(0, 20)) {
          console.log(`  - Edge #${id}`);
        }
        if (diffResult.removed_edges.length > 20) {
          console.log(`  ... and ${diffResult.removed_edges.length - 20} more`);
        }
        console.log();
      }
    }

    db.close();
  }
}
