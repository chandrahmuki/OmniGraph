import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  maxDepth?: number;
  asJson?: boolean;
}

export class ImpactCommand {
  name = "impact";
  description = "Show full blast radius of changing a file (transitive reverse deps)";

  async run(projectPath: string, dbPath: string, args: string[], options: Options = {}): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph impact <file-path> [--depth=N] [--json]");
      process.exit(1);
    }

    const maxDepth = options.maxDepth || 10;
    const asJson = options.asJson || false;

    const db = new GraphDB(dbPath);
    const backlinks = db.getBacklinks(target, maxDepth);
    const allNodes = db.getAllNodes();
    const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

    const directDeps = backlinks.filter(b => b.distance === 1);
    const transitive = backlinks.filter(b => b.distance > 1);

    if (asJson) {
      console.log(JSON.stringify({
        target,
        total_affected: backlinks.length,
        direct: directDeps.length,
        transitive: transitive.length,
        by_depth: backlinks.reduce((acc, b) => {
          acc[b.distance] = (acc[b.distance] || 0) + 1;
          return acc;
        }, {} as Record<number, number>),
        backlinks: backlinks.map(b => ({
          id: b.id,
          type: b.type,
          edge_type: b.edge_type,
          distance: b.distance
        }))
      }, null, 2));
      db.close();
      return;
    }

    console.log(`\n## Impact Analysis: ${target}\n`);
    console.log(`Total affected: ${backlinks.length} nodes\n`);

    if (directDeps.length > 0) {
      console.log("### Direct dependents:");
      const grouped = new Map<string, { edge_types: Set<string>; node_type: string }>();
      for (const dep of directDeps) {
        if (!grouped.has(dep.id)) {
          grouped.set(dep.id, { edge_types: new Set(), node_type: dep.type });
        }
        grouped.get(dep.id)!.edge_types.add(dep.edge_type);
      }
      for (const [id, data] of grouped.entries()) {
        console.log(`  ${id} [${[...data.edge_types].join(",")}]${data.node_type ? ` (${data.node_type})` : ""}`);
      }
      console.log();
    }

    if (transitive.length > 0) {
      const byDepth = new Map<number, typeof backlinks>();
      for (const b of transitive) {
        if (!byDepth.has(b.distance)) byDepth.set(b.distance, []);
        byDepth.get(b.distance)!.push(b);
      }

      for (const [depth, layer] of byDepth.entries()) {
        console.log(`### Depth ${depth} (${layer.length}):`);
        for (const b of layer.slice(0, 20)) {
          console.log(`  ${b.id} [${b.edge_type}] (${b.type})`);
        }
        if (layer.length > 20) console.log(`  ... and ${layer.length - 20} more`);
        console.log();
      }
    }

    const risk = directDeps.length > 10 ? "HIGH" : directDeps.length > 3 ? "MEDIUM" : "LOW";
    console.log(`⚠️  Risk: ${risk} (${directDeps.length} direct, ${transitive.length} transitive)`);

    db.close();
  }
}
