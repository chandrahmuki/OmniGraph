import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  clustersOnly: boolean;
}

export class SummarizeCommand {
  name = "summarize";
  description = "Generate summaries for nodes and clusters";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    const db = new GraphDB(dbPath);

    if (options.clustersOnly) {
      const analytics = db.computeAnalytics();
      console.log("\n## Cluster Summaries\n");
      for (const cluster of analytics.clusters) {
        console.log(`### ${cluster.name}/ (${cluster.size} nodes)`);
        console.log(`   Folder containing ${cluster.size} files and related entities\n`);
      }
      db.close();
      return;
    }

    if (!target) {
      console.log("Usage: omnigraph summarize <node-id> [--clusters]");
      console.log("       omnigraph summarize --clusters  # Summarize all clusters");
      db.close();
      process.exit(1);
    }

    const result = db.generateSummary(target);
    if (!result) {
      console.log(`Node not found: ${target}`);
      db.close();
      process.exit(1);
    }

    console.log(`\n## Summary: ${target}\n`);
    console.log(`${result.summary}\n`);
    
    if (result.clusters.length > 0) {
      console.log(`**Clusters:** ${result.clusters.join(', ')}\n`);
    }

    if (result.context.length > 0) {
      console.log(`**Context:**`);
      for (const ctx of result.context) {
        console.log(`- ${ctx}`);
      }
      console.log();
    }

    db.close();
  }
}
