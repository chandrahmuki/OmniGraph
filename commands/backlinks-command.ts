import { GraphDB } from "../db.ts";

interface Options {
  depth: number;
  asJson: boolean;
}

export class BacklinksCommand {
  name = "backlinks";
  description = "Show files that depend on this file (reverse deps)";

  async run(projectPath: string, dbPath: string, args: string[], options: Options): Promise<void> {
    if (!Bun.file(dbPath).exists) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph backlinks <file-path> [--depth=N] [--json]");
      process.exit(1);
    }

    const db = new GraphDB(dbPath);
    const backlinks = db.getBacklinks(target, options.depth);

    if (options.asJson) {
      const backlinksWithLabels = backlinks.map(b => ({
        id: b.id,
        type: b.type,
        edge_type: b.edge_type,
        distance: b.distance,
        label: db.getNodeById(b.id)?.label || b.id
      }));

      console.log(JSON.stringify({
        target,
        depth: options.depth,
        total: backlinks.length,
        backlinks: backlinksWithLabels
      }, null, 2));
    } else {
      console.log(`\n## Backlinks: ${target}\n`);
      console.log(`Total: ${backlinks.length} files depend on this\n`);

      const byDistance = new Map<number, typeof backlinks>();
      for (const b of backlinks) {
        if (!byDistance.has(b.distance)) byDistance.set(b.distance, []);
        byDistance.get(b.distance)!.push(b);
      }

      for (const [dist, links] of byDistance.entries()) {
        console.log(`### Depth ${dist}:`);
        for (const link of links) {
          const node = db.getNodeById(link.id);
          console.log(`  ${link.id} [${link.edge_type}] (${link.type})${node?.file_path ? ` — ${node.file_path}` : ""}`);
        }
        console.log();
      }
    }

    db.close();
  }
}
