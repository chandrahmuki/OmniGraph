#!/usr/bin/env bun

import { GraphDB } from "/home/david/.local/share/omnigraph/db.ts";
import { scanAndExtract } from "/home/david/.local/share/omnigraph/extract.ts";
import { buildHtml } from "/home/david/.local/share/omnigraph/web/build.ts";

const args = process.argv.slice(2);
const command = args[0];
const projectPath = process.cwd();
const dbPath = `${projectPath}/.omnigraph/graph.db`;
const htmlPath = `${projectPath}/.omnigraph/index.html`;

function ensureDir(path: string) {
  const fs = require("node:fs");
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}

function usage() {
  console.log(`
Usage: omnigraph <command>

Commands:
  build    Scan project, build DB and generate HTML
  query    Search the DB

Examples:
  omnigraph build
  omnigraph query flake
`);
}

async function main() {
  switch (command) {
    case "build": {
      ensureDir(`${projectPath}/.omnigraph`);
      const db = new GraphDB(dbPath);
      db.clear();

      console.log("Scanning project...");
      scanAndExtract(projectPath, db);

      const stats = db.count();
      console.log(`${stats.nodes} nodes, ${stats.edges} edges extracted`);

      console.log("Generating visualization...");
      buildHtml(dbPath, htmlPath);

      db.close();
      console.log(`Done: file://${htmlPath}`);
      break;
    }

    case "query": {
      const fs = require("node:fs");
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const term = args[1]?.toLowerCase();
      if (!term) {
        console.log("Usage: omnigraph query <search>");
        db.close();
        return;
      }

      const nodes = db.getAllNodes().filter(n =>
        n.label.toLowerCase().includes(term) ||
        n.id.toLowerCase().includes(term)
      );

      console.log(`\nFound ${nodes.length} node(s):\n`);
      for (const n of nodes.slice(0, 20)) {
        console.log(`  [${n.type}] ${n.label} (${n.id})`);
      }
      if (nodes.length > 20) console.log(`  ... and ${nodes.length - 20} more`);

      db.close();
      break;
    }

    default:
      usage();
      break;
  }
}

main().catch(console.error);
