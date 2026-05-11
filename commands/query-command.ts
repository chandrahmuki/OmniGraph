import { GraphDB } from "../db.ts";
import fs from "node:fs";

export class QueryCommand {
  name = "query";
  description = "Search the DB (nodes, annotations, lesson items)";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const term = args[0]?.toLowerCase();

    if (!term) {
      console.log("Usage: omnigraph query <search>");
      db.close();
      return;
    }

    const nodes = db.getAllNodes().filter(n =>
      n.label.toLowerCase().includes(term) ||
      n.id.toLowerCase().includes(term)
    );

    const annotationsByNode = db.getAllAnnotations();
    const matchingAnnotations: { node_id: string; key: string; value: string }[] = [];
    for (const [nodeId, anns] of annotationsByNode) {
      for (const ann of anns) {
        if (ann.value.toLowerCase().includes(term) || ann.key.toLowerCase().includes(term)) {
          matchingAnnotations.push({ node_id: nodeId, key: ann.key, value: ann.value });
        }
      }
    }

    console.log(`\nFound ${nodes.length} node(s):\n`);
    for (const n of nodes.slice(0, 20)) {
      const date = n.created_at ? ` (${n.created_at})` : "";
      console.log(`  [${n.type}] ${n.label}${date} (${n.id})`);
    }
    if (nodes.length > 20) console.log(`  ... and ${nodes.length - 20} more`);

    if (matchingAnnotations.length > 0) {
      console.log(`\nMatching tags/annotations (${matchingAnnotations.length}):\n`);
      for (const ann of matchingAnnotations.slice(0, 20)) {
        const node = db.getNodeById(ann.node_id);
        const nodeLabel = node ? node.label : ann.node_id;
        console.log(`  ${ann.key}=${ann.value} -> ${nodeLabel}`);
      }
    }

    db.close();
  }
}
