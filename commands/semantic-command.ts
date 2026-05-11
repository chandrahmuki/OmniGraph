import { GraphDB } from "../db.js";
import { buildIndex } from "../extractors/semantic.js";

export class SemanticCommand {
  async run(
    projectPath: string,
    dbPath: string,
    args: string[],
    _options: {}
  ): Promise<void> {
    if (!this.checkDB(dbPath)) return;

    const searchArgs = args;
    const query = searchArgs.find(a => !a.startsWith("--"));
    const typeFilter = searchArgs.find(a => a.startsWith("--type="))?.replace("--type=", "");
    const topK = parseInt(searchArgs.find(a => a.startsWith("--top="))?.replace("--top=", "") || "10", 10);

    if (!query) {
      console.log("Usage: omnigraph semantic <query> [--type=function|class|lesson_item|error|...] [--top=10]");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const index = buildIndex(db);
    const results = index.search(query, topK);

    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    console.log(`\n## Semantic Search: "${query}"\n`);
    console.log(`Found ${results.length} results:\n`);

    if (results.length === 0) {
      console.log("No results found.");
      db.close();
      return;
    }

    const filtered = typeFilter
      ? results.filter(r => {
          const node = nodeMap.get(r.docId);
          return node && node.type === typeFilter;
        })
      : results;

    for (const r of filtered.slice(0, topK)) {
      const node = nodeMap.get(r.docId);
      const scorePct = (r.score * 100).toFixed(1);
      const bar = "█".repeat(Math.round(r.score * 20)) + "░".repeat(20 - Math.round(r.score * 20));
      console.log(`[${bar}] ${scorePct}%`);
      console.log(`  [${node?.type || "?"}] ${node?.label || r.docId}`);
      console.log(`  id: ${r.docId}`);
      if (node?.file_path) console.log(`  file: ${node.file_path}`);
      console.log("");
    }

    db.close();
  }

  private checkDB(dbPath: string): boolean {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }
    return true;
  }
}
