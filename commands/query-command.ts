import { GraphDB } from "../db.ts";

export class QueryCommand {
  name = "query";
  description = "Search the DB (nodes, annotations, lesson items)";

  async run(projectPath: string, dbPath: string, args: string[]): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const term = args[0]?.toLowerCase();

    if (!term) {
      console.log("Usage: omnigraph query <search>");
      return;
    }

    const db = new GraphDB(dbPath);
    const nodes = db.searchNodes(term, 20);
    const annotations = db.searchAnnotations(term, 20);

    console.log(`\nFound ${nodes.length} node(s):\n`);
    for (const n of nodes) {
      const date = n.created_at ? ` (${n.created_at})` : "";
      console.log(`  [${n.type}] ${n.label}${date} (${n.id})`);
    }
    if (nodes.length >= 20) console.log(`  ... and more`);

    if (annotations.length > 0) {
      console.log(`\nMatching tags/annotations (${annotations.length}):\n`);
      for (const ann of annotations) {
        const node = db.getNodeById(ann.node_id);
        const nodeLabel = node ? node.label : ann.node_id;
        console.log(`  ${ann.key}=${ann.value} -> ${nodeLabel}`);
      }
    }

    db.close();
  }
}
