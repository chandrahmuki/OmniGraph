import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  asJson: boolean;
}

export class AnalyticsCommand {
  name = "analytics";
  description = "Graph statistics and metrics";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const analytics = db.computeAnalytics();
    db.close();

    if (options.asJson) {
      console.log(JSON.stringify(analytics, null, 2));
    } else {
      console.log("\n## Graph Analytics\n");
      console.log(`**Total:** ${analytics.total_nodes} nodes, ${analytics.total_edges} edges`);
      console.log(`**Density:** ${(analytics.density * 100).toFixed(4)}%`);
      console.log(`**Avg Degree:** ${analytics.avg_degree}\n`);

      console.log("### Nodes by Type:");
      for (const [type, count] of Object.entries(analytics.by_type).slice(0, 10)) {
        console.log(`  ${type}: ${count}`);
      }

      console.log("\n### Edges by Type:");
      for (const [type, count] of Object.entries(analytics.by_edge_type).slice(0, 10)) {
        console.log(`  ${type}: ${count}`);
      }

      console.log("\n### Hub Nodes (Top 10):");
      for (const hub of analytics.hub_nodes) {
        console.log(`  ${hub.id}: ${hub.degree} connections`);
      }

      console.log("\n### Clusters (Top 10):");
      for (const cluster of analytics.clusters) {
        console.log(`  ${cluster.name}/: ${cluster.size} nodes`);
      }

      if (analytics.isolated_nodes > 0) {
        console.log(`\n⚠️  ${analytics.isolated_nodes} isolated nodes found`);
      }
    }
  }
}
