#!/usr/bin/env bun

import { GraphDB } from "./db.ts";
import { scanAndExtract } from "./extract.ts";
import { buildHtml } from "./web/build.ts";
import { buildIndex } from "./extractors/semantic.ts";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const LIB_DIR = import.meta.dirname;

const args = process.argv.slice(2);
const command = args[0];
const projectPath = process.cwd();
const dbPath = `${projectPath}/.omnigraph/graph.db`;
const htmlPath = `${projectPath}/.omnigraph/index.html`;
const incremental = args.includes("--incremental") || args.includes("-i");

function ensureDir(path: string) {
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}

function cleanupDeadNodes(db: GraphDB, projectPath: string) {
  const deadIds: string[] = [];
  const allNodes = db.getAllNodes();
  for (const n of allNodes) {
    if (n.type === "file" && n.file_path && !n.file_path.startsWith("inputs.")) {
      const fullPath = path.join(projectPath, n.file_path);
      if (!fs.existsSync(fullPath)) {
        deadIds.push(n.id);
      }
    }
  }
  if (deadIds.length > 0) {
    const deadList = deadIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
    db.db.exec(`DELETE FROM edges WHERE from_id IN (${deadList}) OR to_id IN (${deadList})`);
    db.db.exec(`DELETE FROM nodes WHERE id IN (${deadList})`);
    db.db.exec(`DELETE FROM nodes WHERE id NOT IN (SELECT from_id FROM edges UNION SELECT to_id FROM edges)`);
    console.log(`Removed ${deadIds.length} dead references: ${deadIds.join(", ")}`);
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

async function buildGraph(projectPath: string, dbPath: string, htmlPath: string, incremental: boolean) {
  ensureDir(`${projectPath}/.omnigraph`);
  const db = new GraphDB(dbPath);

  if (!incremental) {
    db.clear();
  }

  console.log(incremental ? "Incremental scan..." : "Scanning project...");
  await scanAndExtract(projectPath, db, incremental);

  if (!incremental) {
    db.db.exec(`
      DELETE FROM nodes WHERE id NOT IN (
        SELECT from_id FROM edges UNION SELECT to_id FROM edges
      ) AND type NOT IN ('lesson', 'lesson_item');
    `);
  }

  cleanupDeadNodes(db, projectPath);

  const stats = db.count();
  console.log(`${stats.nodes} nodes, ${stats.edges} edges extracted`);

  console.log("Generating visualization...");
  buildHtml(dbPath, htmlPath, projectPath);

  db.close();
  console.log(`Done: file://${htmlPath}`);
}

function usage() {
  console.log(`
Usage: omnigraph <command>

Commands:
  build      Scan project, build DB and generate HTML
  save       Git commit + snapshot + rebuild graph (all-in-one)
  query      Search the DB (nodes, annotations, lesson items)
  search     Search concepts (functions, classes, structs, types)
  check      Pre-edit check for a file (dependencies, sessions, lessons)
  impact     Show full blast radius of changing a file (transitive reverse deps)
  path       Find shortest dependency path between two nodes
  backlinks  Show files that depend on this file (reverse deps)
               --depth=N      Transitive backlinks up to depth N (default: 1)
               --json         Output as JSON for IDE integration
  snapshot   Manage graph snapshots (save/restore graph state)
               create <name>  Create a new snapshot
               list           List all snapshots
               delete <name>  Delete a snapshot
  diff       Compare two snapshots or current vs last build
               <snap1> <snap2>  Compare two named snapshots
               --last           Compare current vs last snapshot
               --json           Output as JSON
  export     Export graph to different formats
               <json|graphml|gexf>  Export format
               [output-file]  Output file (default: stdout)
               --filter=<type>  Filter by node type
  embed      Vector embeddings for semantic search
               build            Generate embeddings for all nodes
               query <text>     Semantic search (--top=N, --type=)
  ask        AI-powered Q&A over your codebase (RAG)
               <question>       Natural language question
  summarize  Generate summaries for nodes and clusters
               <node-id>        Summary for specific node
               --clusters       Summarize all clusters
  analytics  Graph statistics and metrics
               --json           Output as JSON
  serve      Start HTTP API server
               --port=N         Port number (default: 8080)
               --read-only      Read-only mode (no write operations)
  git-log    Show recent git commits with files modified
  orphans    Detect unused inputs, dead refs, isolated nodes
  lessons    List lesson items (recent, for module, or all)
  hotspots   Show most-modified files and recurring error patterns
  errors     List errors in graph with their fix status
              --file=<path>  Show only errors affecting a specific file
              --unresolved   Show only unresolved errors
  issues     List issues detected in sessions
              --file=<path>  Show only issues affecting a specific file
              --unresolved   Show only unresolved issues
  decisions  List decisions made in sessions
              --file=<path>  Show only decisions affecting a specific file
  changes    List changes recorded in sessions and git
              --file=<path>  Show only changes affecting a specific file
              --type=<type>  Filter by change type (replace, add, remove, refactor)
  timeline   Show timeline of events for a file
               <file-path>    Required: file to show timeline for
  semantic   Semantic search across all embedded nodes
               <query>        Required: search query
               --type=<type>  Filter by node type
               --top=<n>      Number of results (default: 10)
  session-resume  Show last session summary and context check
  sessions       List all sessions from the graph
                   --recent       Show only recent sessions (last 10)
                   --date=<date>  Filter by date (YYYY-MM-DD)

Examples:
  omnigraph save "feat: workaround detection"
  omnigraph build
  omnigraph build --incremental
  omnigraph query flake
  omnigraph search handleAuth
  omnigraph search --kind function
  omnigraph check modules/niri.nix
  omnigraph impact modules/niri.nix
  omnigraph path modules/niri.nix modules/terminal.nix
  omnigraph backlinks modules/niri.nix
  omnigraph backlinks modules/niri.nix --depth=2
  omnigraph snapshot create baseline
  omnigraph snapshot list
  omnigraph diff baseline current
  omnigraph diff --last
  omnigraph export json graph.json
  omnigraph export graphml graph.graphml
  omnigraph export gexf graph.gexf
  omnigraph embed build
  omnigraph embed query "auth handling"
  omnigraph ask "Where is auth handled?"
  omnigraph summarize db.ts
  omnigraph summarize --clusters
  omnigraph analytics
  omnigraph serve --port=8080
  omnigraph orphans
  omnigraph git-log
  omnigraph lessons
  omnigraph lessons --recent
  omnigraph lessons --module modules/dbus.nix
  omnigraph issues --unresolved
  omnigraph decisions --file=modules/niri.nix
  omnigraph changes --type=replace
  omnigraph timeline modules/niri.nix
  omnigraph session-resume
`);
}

async function main() {
  switch (command) {
    case "build": {
      await buildGraph(projectPath, dbPath, htmlPath, incremental);
      break;
    }

    case "save": {
      const commitMessage = args[1];
      if (!commitMessage) {
        console.log("Usage: omnigraph save <commit-message>");
        console.log("\nExample: omnigraph save \"feat: workaround detection\"");
        process.exit(1);
      }

      console.log("📦 OmniGraph Save — Git + Snapshot + Build\n");

      // Step 1: Git status check
      console.log("[1/5] Checking git status...");
      try {
        const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
        if (!status) {
          console.log("  ✓ No changes to commit");
        } else {
          console.log("  Modified files:");
          status.split("\n").slice(0, 10).forEach(line => {
            const file = line.substring(3);
            console.log(`    ${line[0]} ${file}`);
          });
          if (status.split("\n").length > 10) {
            console.log(`    ... and ${status.split("\n").length - 10} more`);
          }
        }
      } catch (e) {
        console.log("  ⚠ Not a git repository");
      }

      // Step 2: Git add & commit
      console.log("\n[2/5] Committing changes...");
      try {
        execSync(`git add -A`, { stdio: "inherit" });
        execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
        console.log("  ✓ Committed");
      } catch (e) {
        const stderr = (e as any).stderr?.toString() || "";
        if (stderr.includes("nothing added")) {
          console.log("  ✓ Nothing to commit");
        } else {
          console.log("  ⚠ Commit failed:", stderr.split("\n")[0]);
        }
      }

      // Step 3: Git push (optional, skip if no remote)
      console.log("\n[3/5] Pushing to remote...");
      try {
        execSync("git push", { stdio: "pipe", encoding: "utf-8" });
        console.log("  ✓ Pushed");
      } catch (e) {
        const stderr = (e as any).stderr?.toString() || "";
        if (stderr.includes("fatal: no push destination")) {
          console.log("  ⚠ No remote configured, skipping push");
        } else {
          console.log("  ⚠ Push failed:", stderr.split("\n")[0]);
        }
      }

      // Step 4: Create snapshot
      console.log("\n[4/5] Creating session snapshot...");
      const topic = commitMessage.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 50);
      const dateStr = new Date().toISOString().split("T")[0];
      const snapshotTopic = `${dateStr}_${topic}`;
      const sessionsDir = path.join(projectPath, "memory/sessions");
      const snapshotDir = path.join(sessionsDir, snapshotTopic);

      ensureDir(snapshotDir);

      const summaryPath = path.join(snapshotDir, "summary.md");
      const now = new Date().toISOString();

      let summaryContent = `---
Generated: ${now}
Topic: ${topic}
---

## What Was Accomplished
- [${now}] ${commitMessage}

## Files Modified
`;

      try {
        const files = execSync("git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --cached --name-only", { encoding: "utf-8" }).trim();
        if (files) {
          files.split("\n").forEach(f => {
            summaryContent += `- [${now}] ${f}\n`;
          });
        }
      } catch {}

      try {
        const lastCommit = execSync("git log -1 --format='%h %s'", { encoding: "utf-8" }).trim();
        summaryContent += `\n## Commits This Session\n- \`${lastCommit}\` [${now}]\n`;
      } catch {}

      summaryContent += "\n(End of file)\n";

      fs.writeFileSync(summaryPath, summaryContent);
      console.log(`  ✓ Snapshot: ${snapshotDir}`);

      // Update index_sessions.md
      const indexPath = path.join(projectPath, "memory/index_sessions.md");
      let indexContent = "";
      if (fs.existsSync(indexPath)) {
        indexContent = fs.readFileSync(indexPath, "utf-8");
      } else {
        indexContent = "# Session Snapshots\n\n";
      }

      if (!indexContent.includes(`[${topic}]`)) {
        if (!indexContent.includes(`## ${dateStr}`)) {
          indexContent += `\n## ${dateStr}\n\n`;
        }
        indexContent += `- [${topic}](sessions/${snapshotTopic}/)\n`;
        fs.writeFileSync(indexPath, indexContent);
        console.log("  ✓ Updated index_sessions.md");
      }

      // Step 5: Rebuild graph
      console.log("\n[5/5] Rebuilding graph...");
      await buildGraph(projectPath, dbPath, htmlPath, false);

      console.log("\n✅ Save complete!");
      console.log(`   Graph: file://${htmlPath}`);
      console.log(`   Session: ${snapshotDir}`);
      break;
    }

    case "query": {
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
      break;
    }

    case "embed": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const subcommand = args[1];

      switch (subcommand) {
        case "build": {
          const db = new GraphDB(dbPath);
          console.log("Building embeddings...");
          const result = db.embedAndStore();
          console.log(`✓ Embedded ${result.embedded} nodes (${result.failed} failed)`);
          db.close();
          break;
        }

        case "query": {
          const queryArgs = args.slice(2).filter(a => !a.startsWith("--"));
          const query = queryArgs.join(" ");
          if (!query) {
            console.log("Usage: omnigraph embed query <search-query>");
            process.exit(1);
          }
          const topArg = args.find(a => a.startsWith("--top="));
          const top = topArg ? parseInt(topArg.split("=")[1], 10) : 10;
          const typeArg = args.find(a => a.startsWith("--type="));
          const typeFilter = typeArg ? typeArg.split("=")[1] : undefined;

          const db = new GraphDB(dbPath);
          const results = db.semanticSearch(query, top, typeFilter);
          
          console.log(`\n## Semantic Search: "${query}"\n`);
          if (results.length === 0) {
            console.log("No results found.");
          } else {
            for (const r of results) {
              const score = (r.score * 100).toFixed(1);
              console.log(`${score.padEnd(6, " ")}% ${r.node?.label || r.node_id} (${r.node?.type || "?"})`);
            }
          }
          db.close();
          break;
        }

        default: {
          console.log("Usage: omnigraph embed <build|query> [options]");
          console.log("\nCommands:");
          console.log("  build              Generate embeddings for all nodes");
          console.log("  query <text>       Semantic search");
          console.log("\nOptions:");
          console.log("  --top=N            Number of results (default: 10)");
          console.log("  --type=<type>      Filter by node type");
          process.exit(1);
        }
      }
      break;
    }

    case "ask": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const query = args.slice(1).join(" ");
      if (!query) {
        console.log("Usage: omnigraph ask <question>");
        console.log("\nExample: omnigraph ask 'Where is auth handled?'");
        process.exit(1);
      }

      const db = new GraphDB(dbPath);
      const results = db.semanticSearch(query, 5);
      
      console.log(`\n## Answer: "${query}"\n`);
      
      if (results.length === 0) {
        console.log("No relevant nodes found. Try building embeddings first: omnigraph embed build");
      } else {
        console.log("**Relevant context:**\n");
        for (const r of results) {
          const score = (r.score * 100).toFixed(1);
          console.log(`- ${r.node?.label || r.node_id} (${r.node?.type || "?"}) — ${score}% match`);
          if (r.node?.file_path) {
            console.log(`  File: ${r.node.file_path}`);
          }
        }
        console.log("\n**Next steps:**");
        console.log("- Use 'omnigraph check <file>' to see dependencies");
        console.log("- Use 'omnigraph backlinks <file>' to see reverse dependencies");
        console.log("- Use 'omnigraph impact <file>' to see full blast radius");
      }
      
      db.close();
      break;
    }

    case "check": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const target = args[1];
      if (!target) {
        console.log("Usage: omnigraph check <file-path>");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      const node = allNodes.find((n: any) => n.id === target || n.file_path === target);
      if (!node) {
        console.log(`Node not found: ${target}`);
        db.close();
        process.exit(1);
      }

      console.log(`\n## Pre-edit Check: ${node.id}\n`);

      const deps = allEdges.filter((e: any) => e.from_id === node.id);
      const reverseDeps = allEdges.filter((e: any) => e.to_id === node.id && !e.from_id.startsWith("2026-"));

      if (deps.length > 0) {
        console.log(`### Uses (${deps.length}):`);
        for (const e of deps.slice(0, 10)) {
          const target = nodeMap.get(e.to_id);
          console.log(`  → ${e.to_id} [${e.type}]${target ? ` (${target.type})` : ""}`);
        }
        if (deps.length > 10) console.log(`  ... and ${deps.length - 10} more`);
        console.log();
      }

      if (reverseDeps.length > 0) {
        console.log(`### Used by (${reverseDeps.length}):`);
        for (const e of reverseDeps.slice(0, 10)) {
          const source = nodeMap.get(e.from_id);
          console.log(`  ← ${e.from_id} [${e.type}]${source ? ` (${source.type})` : ""}`);
        }
        if (reverseDeps.length > 10) console.log(`  ... and ${reverseDeps.length - 10} more`);
        console.log();
      }

      const sessions = allEdges.filter((e: any) => e.from_id.startsWith("2026-") && e.to_id === node.id);
      if (sessions.length > 0) {
        console.log(`### Related sessions (${sessions.length}):`);
        for (const e of sessions.slice(0, 5)) {
          console.log(`  - ${e.from_id} [${e.type}]`);
        }
        console.log();
      }

      const risk = reverseDeps.length > 10 ? "HIGH" : reverseDeps.length > 3 ? "MEDIUM" : "LOW";
      console.log(`⚠️  Risk: ${risk} (${reverseDeps.length} reverse deps)`);

      db.close();
      break;
    }

    case "impact": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const target = args[1];
      if (!target) {
        console.log("Usage: omnigraph impact <file-path>");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      const visited = new Set<string>();
      const queue = [target];
      visited.add(target);
      const layers: Map<number, string[]> = new Map();
      let depth = 0;

      while (queue.length > 0) {
        const nextQueue: string[] = [];
        const currentLayer: string[] = [];
        for (const current of queue) {
          currentLayer.push(current);
          const reverseDeps = allEdges.filter((e: any) =>
            e.to_id === current && !e.from_id.startsWith("2026-")
          );
          for (const edge of reverseDeps) {
            if (!visited.has(edge.from_id)) {
              visited.add(edge.from_id);
              nextQueue.push(edge.from_id);
            }
          }
        }
        if (currentLayer.length > 0) {
          layers.set(depth, currentLayer);
        }
        depth++;
        queue.length = 0;
        queue.push(...nextQueue);
      }

      console.log(`\n## Impact Analysis: ${target}\n`);
      console.log(`Total affected: ${visited.size - 1} nodes (excluding source)\n`);

      const directDeps = allEdges.filter((e: any) =>
        e.to_id === target && !e.from_id.startsWith("2026-")
      );
      const directDepIds = [...new Set(directDeps.map((e: any) => e.from_id))];
      if (directDepIds.length) {
        console.log("### Direct dependents:");
        for (const id of directDepIds) {
          const node = nodeMap.get(id);
          const edgeTypes = directDeps.filter((e: any) => e.from_id === id).map((e: any) => e.type);
          console.log(`  ${id} [${[...new Set(edgeTypes)].join(",")}]${node ? ` (${node.type})` : ""}`);
        }
      }

      for (let d = 1; d < depth; d++) {
        const layer = layers.get(d);
        if (layer && layer.length > 0) {
          console.log(`\n### Depth ${d}:`);
          for (const id of layer) {
            const node = nodeMap.get(id);
            console.log(`  ${id} (${node?.type || "?"})`);
          }
        }
      }

      db.close();
      break;
    }

    case "path": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const fromId = args[1];
      const toId = args[2];
      if (!fromId || !toId) {
        console.log("Usage: omnigraph path <from-node> <to-node>");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      const adjacency = new Map<string, string[]>();
      for (const n of allNodes) {
        adjacency.set(n.id, []);
      }
      for (const e of allEdges) {
        const neighbors = adjacency.get(e.from_id) || [];
        neighbors.push(e.to_id);
        adjacency.set(e.from_id, neighbors);
      }

      const visited = new Set<string>();
      const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
      visited.add(fromId);
      let found: string[] | null = null;

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.id === toId) {
          found = current.path;
          break;
        }
        const neighbors = adjacency.get(current.id) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push({ id: neighbor, path: [...current.path, neighbor] });
          }
        }
      }

      console.log(`\n## Path: ${fromId} → ${toId}\n`);
      if (found) {
        console.log(`Length: ${found.length - 1} hops\n`);
        for (let i = 0; i < found.length; i++) {
          const node = nodeMap.get(found[i]);
          const prefix = i === 0 ? "●" : "→";
          console.log(`  ${prefix} ${found[i]} (${node?.type || "?"})`);
        }
      } else {
        console.log("No path found.");
      }

      db.close();
      break;
    }

    case "backlinks": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const target = args[1];
      if (!target) {
        console.log("Usage: omnigraph backlinks <file-path> [--depth=N] [--json]");
        process.exit(1);
      }

      const depthArg = args.find(a => a.startsWith("--depth="));
      const depth = depthArg ? parseInt(depthArg.split("=")[1], 10) : 1;
      const asJson = args.includes("--json");

      const db = new GraphDB(dbPath);
      const backlinks = db.getBacklinks(target, depth);
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      if (asJson) {
        console.log(JSON.stringify({
          target,
          depth,
          total: backlinks.length,
          backlinks: backlinks.map(b => ({
            id: b.id,
            type: b.type,
            edge_type: b.edge_type,
            distance: b.distance,
            label: nodeMap.get(b.id)?.label || b.id
          }))
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
            const node = nodeMap.get(link.id);
            console.log(`  ${link.id} [${link.edge_type}] (${link.type})${node?.file_path ? ` — ${node.file_path}` : ""}`);
          }
          console.log();
        }
      }

      db.close();
      break;
    }

    case "snapshot": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const subcommand = args[1];
      const name = args[2];

      switch (subcommand) {
        case "create": {
          if (!name) {
            console.log("Usage: omnigraph snapshot create <name>");
            process.exit(1);
          }
          const db = new GraphDB(dbPath);
          const result = db.createSnapshot(name);
          console.log(`✓ Snapshot created: ${name}`);
          console.log(`  ID: ${result.id}`);
          console.log(`  Nodes: ${result.nodes}`);
          console.log(`  Edges: ${result.edges}`);
          db.close();
          break;
        }

        case "list": {
          const db = new GraphDB(dbPath);
          const snapshots = db.listSnapshots();
          if (snapshots.length === 0) {
            console.log("No snapshots found.");
          } else {
            console.log("\n## Snapshots\n");
            console.log("| ID | Name | Created | Nodes | Edges |");
            console.log("|----|------|---------|-------|-------|");
            for (const s of snapshots) {
              console.log(`| ${s.id} | ${s.name} | ${s.created_at.split("T")[0]} | ${s.nodes} | ${s.edges} |`);
            }
          }
          db.close();
          break;
        }

        case "delete": {
          if (!name) {
            console.log("Usage: omnigraph snapshot delete <name>");
            process.exit(1);
          }
          const db = new GraphDB(dbPath);
          const deleted = db.deleteSnapshot(name);
          if (deleted) {
            console.log(`✓ Snapshot deleted: ${name}`);
          } else {
            console.error(`Snapshot not found: ${name}`);
          }
          db.close();
          break;
        }

        default: {
          console.log("Usage: omnigraph snapshot <create|list|delete> [name]");
          process.exit(1);
        }
      }
      break;
    }

    case "diff": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const snapshot1 = args[1];
      const snapshot2 = args[2];
      const asJson = args.includes("--json");

      if (!snapshot1) {
        console.log("Usage: omnigraph diff <snapshot1> <snapshot2> [--json]");
        console.log("       omnigraph diff --last (compare current vs last build)");
        process.exit(1);
      }

      const db = new GraphDB(dbPath);
      let diffResult;

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
          snapshot1: { name: last.name, created_at: last.created_at, nodes: last.nodes, edges: last.edges },
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

      if (asJson) {
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
      break;
    }

    case "export": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const format = args[1];
      const filterTypeArg = args.find(a => a.startsWith("--filter="));
      const filterType = filterTypeArg ? filterTypeArg.split("=")[1] : undefined;
      
      const outputFile = args[2] && !args[2].startsWith("--") ? args[2] : null;

      if (!format || !["json", "graphml", "gexf"].includes(format)) {
        console.log("Usage: omnigraph export <json|graphml|gexf> [output-file] [--filter=<type>]");
        console.log("\nFormats:");
        console.log("  json     Raw JSON export (default: stdout)");
        console.log("  graphml  GraphML format for Gephi");
        console.log("  gexf     GEXF format for Cytoscape");
        console.log("\nOptions:");
        console.log("  --filter=<type>  Only export nodes of this type (e.g., file, function)");
        process.exit(1);
      }

      const db = new GraphDB(dbPath);
      let output: string;

      switch (format) {
        case "json": {
          const data = db.exportJSON(filterType);
          output = JSON.stringify(data, null, 2);
          break;
        }
        case "graphml": {
          if (filterType) {
            console.error("Filter not supported for GraphML export");
            db.close();
            process.exit(1);
          }
          output = db.exportGraphML();
          break;
        }
        case "gexf": {
          if (filterType) {
            console.error("Filter not supported for GEXF export");
            db.close();
            process.exit(1);
          }
          output = db.exportGEXF();
          break;
        }
        default: {
          db.close();
          process.exit(1);
        }
      }

      db.close();

      if (outputFile) {
        fs.writeFileSync(outputFile, output);
        console.log(`✓ Exported to ${outputFile}`);
        const stats = fs.statSync(outputFile);
        console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
      } else {
        console.log(output);
      }
      break;
    }

    case "orphans": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allNodes = db.getAllNodes();
      const allEdges = db.getAllEdges();

      const nodeIds = new Set(allNodes.map((n: any) => n.id));
      const fromIds = new Set(allEdges.map((e: any) => e.from_id));
      const toIds = new Set(allEdges.map((e: any) => e.to_id));

      const orphans = allNodes.filter((n: any) => !fromIds.has(n.id) && !toIds.has(n.id));
      const unusedInputs = allNodes.filter((n: any) => n.type === "input" && !toIds.has(n.id));
      const deadRefs = allNodes.filter((n: any) => {
        if (n.type !== "file" || !n.file_path) return false;
        const fullPath = path.join(projectPath, n.file_path);
        return !fs.existsSync(fullPath);
      });

      console.log("\n## Orphan Analysis\n");

      if (orphans.length > 0) {
        console.log(`### Isolated nodes (${orphans.length}):`);
        for (const o of orphans.slice(0, 20)) {
          console.log(`  ${o.id} (${o.type})`);
        }
        if (orphans.length > 20) console.log(`  ... and ${orphans.length - 20} more`);
        console.log();
      }

      if (unusedInputs.length > 0) {
        console.log(`### Unused inputs (${unusedInputs.length}):`);
        for (const i of unusedInputs) {
          console.log(`  ${i.id}`);
        }
        console.log();
      }

      if (deadRefs.length > 0) {
        console.log(`### Dead references (${deadRefs.length}):`);
        for (const d of deadRefs) {
          console.log(`  ${d.id} — file not found: ${d.file_path}`);
        }
        console.log();
      }

      if (orphans.length === 0 && unusedInputs.length === 0 && deadRefs.length === 0) {
        console.log("✓ No orphans found!");
      }

      db.close();
      break;
    }

    case "search": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const term = args[1];
      if (!term) {
        console.log("Usage: omnigraph search <term> [--kind=function|class|struct]");
        process.exit(1);
      }
      const kindArg = args.find(a => a.startsWith("--kind="));
      const kind = kindArg ? kindArg.split("=")[1] : undefined;

      const db = new GraphDB(dbPath);
      const results = db.searchConcepts(term, kind);

      console.log(`\n## Search: "${term}"${kind ? ` (kind: ${kind})` : ""}\n`);
      if (results.length === 0) {
        console.log("No results found.");
      } else {
        for (const r of results.slice(0, 20)) {
          console.log(`[${r.kind}] ${r.name}`);
          if (r.file_path) console.log(`  ${r.file_path}:${r.line_number || "?"}`);
        }
        if (results.length > 20) console.log(`\n... and ${results.length - 20} more`);
      }

      db.close();
      break;
    }

    case "summarize": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const target = args[1];
      const clustersOnly = args.includes("--clusters");

      if (!target && !clustersOnly) {
        console.log("Usage: omnigraph summarize <node-id> [--clusters]");
        console.log("       omnigraph summarize --clusters  # Summarize all clusters");
        process.exit(1);
      }

      const db = new GraphDB(dbPath);

      if (clustersOnly) {
        const analytics = db.computeAnalytics();
        console.log("\n## Cluster Summaries\n");
        for (const cluster of analytics.clusters) {
          console.log(`### ${cluster.name}/ (${cluster.size} nodes)`);
          console.log(`   Folder containing ${cluster.size} files and related entities\n`);
        }
        db.close();
        break;
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
      break;
    }

    case "analytics": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const asJson = args.includes("--json");
      const db = new GraphDB(dbPath);
      const analytics = db.computeAnalytics();
      db.close();

      if (asJson) {
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
      break;
    }

    case "serve": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const portArg = args.find(a => a.startsWith("--port="));
      const port = portArg ? parseInt(portArg.split("=")[1], 10) : 8080;
      const readOnly = args.includes("--read-only");

      console.log(`\n🚀 OmniGraph HTTP Server`);
      console.log(`   Port: ${port}`);
      console.log(`   Mode: ${readOnly ? "read-only" : "full access"}`);
      console.log(`   DB: ${dbPath}`);
      console.log(`\n   Open http://localhost:${port} in your browser\n`);

      const server = Bun.serve({
        port,
        cors: {
          origin: "*",
          methods: "GET, POST, OPTIONS"
        },
        async fetch(req) {
          const url = new URL(req.url);
          const path = url.pathname;
          const method = req.method;

          if (method === "OPTIONS") {
            return new Response(null, {
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
              }
            });
          }

          try {
            const db = new GraphDB(dbPath);

            // API Routes
            if (path === "/api/nodes") {
              const typeFilter = url.searchParams.get("type");
              const nodes = typeFilter 
                ? db.db.query("SELECT * FROM nodes WHERE type = ?").all(typeFilter)
                : db.getAllNodes();
              return jsonResponse({ nodes });
            }

            if (path.startsWith("/api/nodes/")) {
              const nodeId = decodeURIComponent(path.replace("/api/nodes/", ""));
              const node = db.getNodeById(nodeId);
              if (!node) {
                return jsonResponse({ error: "Node not found" }, 404);
              }
              const backlinks = db.getBacklinks(nodeId, 2);
              const annotations = db.getAnnotationsForNode(nodeId);
              return jsonResponse({ node, backlinks, annotations });
            }

            if (path === "/api/search") {
              const q = url.searchParams.get("q");
              if (!q) {
                return jsonResponse({ error: "Missing 'q' parameter" }, 400);
              }
              const limit = parseInt(url.searchParams.get("limit") || "20", 10);
              const results = db.searchConcepts(q).slice(0, limit);
              return jsonResponse({ query: q, results });
            }

            if (path === "/api/semantic") {
              const q = url.searchParams.get("q");
              if (!q) {
                return jsonResponse({ error: "Missing 'q' parameter" }, 400);
              }
              const top = parseInt(url.searchParams.get("top") || "10", 10);
              const typeFilter = url.searchParams.get("type") || undefined;
              const results = db.semanticSearch(q, top, typeFilter);
              return jsonResponse({ query: q, results });
            }

            if (path === "/api/ask") {
              if (method !== "POST") {
                return jsonResponse({ error: "Method not allowed" }, 405);
              }
              const body = await req.json();
              const question = body.question;
              if (!question) {
                return jsonResponse({ error: "Missing 'question' in body" }, 400);
              }
              const results = db.semanticSearch(question, 5);
              return jsonResponse({
                question,
                context: results.map(r => ({
                  id: r.node_id,
                  label: r.node?.label,
                  type: r.node?.type,
                  file_path: r.node?.file_path,
                  score: r.score
                })),
                suggestions: [
                  "Use /api/nodes/:id for details",
                  "Use /api/nodes/:id/backlinks for reverse deps",
                  "Use /api/impact?id=... for blast radius"
                ]
              });
            }

            if (path === "/api/backlinks") {
              const id = url.searchParams.get("id");
              if (!id) {
                return jsonResponse({ error: "Missing 'id' parameter" }, 400);
              }
              const depth = parseInt(url.searchParams.get("depth") || "1", 10);
              const backlinks = db.getBacklinks(id, depth);
              return jsonResponse({ id, depth, backlinks });
            }

            if (path === "/api/impact") {
              const id = url.searchParams.get("id");
              if (!id) {
                return jsonResponse({ error: "Missing 'id' parameter" }, 400);
              }
              const allEdges = db.getAllEdges();
              const allNodes = db.getAllNodes();
              const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
              
              const visited = new Set<string>();
              const queue = [id];
              visited.add(id);
              const layers: Map<number, string[]> = new Map();
              let depth = 0;

              while (queue.length > 0) {
                const nextQueue: string[] = [];
                const currentLayer: string[] = [];
                for (const current of queue) {
                  currentLayer.push(current);
                  const reverseDeps = allEdges.filter((e: any) =>
                    e.to_id === current && !e.from_id.startsWith("2026-")
                  );
                  for (const edge of reverseDeps) {
                    if (!visited.has(edge.from_id)) {
                      visited.add(edge.from_id);
                      nextQueue.push(edge.from_id);
                    }
                  }
                }
                if (currentLayer.length > 0) {
                  layers.set(depth, currentLayer);
                }
                depth++;
                queue.length = 0;
                queue.push(...nextQueue);
              }

              const result = {
                target: id,
                total_affected: visited.size - 1,
                layers: Array.from(layers.entries()).map(([d, ids]) => ({
                  depth: d,
                  nodes: ids.map(id => ({ id, type: nodeMap.get(id)?.type }))
                }))
              };
              return jsonResponse(result);
            }

            if (path === "/api/export") {
              const format = url.searchParams.get("format") || "json";
              const filterType = url.searchParams.get("filter") || undefined;
              
              if (format === "json") {
                const data = db.exportJSON(filterType);
                return jsonResponse(data);
              }
              if (format === "graphml") {
                const xml = db.exportGraphML();
                return new Response(xml, {
                  headers: { "Content-Type": "application/xml" }
                });
              }
              if (format === "gexf") {
                const xml = db.exportGEXF();
                return new Response(xml, {
                  headers: { "Content-Type": "application/xml" }
                });
              }
              return jsonResponse({ error: "Invalid format" }, 400);
            }

            if (path === "/api/stats") {
              const stats = db.count();
              const nodes = db.getAllNodes();
              const edges = db.getAllEdges();
              const byType = new Map<string, number>();
              for (const n of nodes) {
                byType.set(n.type, (byType.get(n.type) || 0) + 1);
              }
              const byEdgeType = new Map<string, number>();
              for (const e of edges) {
                byEdgeType.set(e.type, (byEdgeType.get(e.type) || 0) + 1);
              }
              return jsonResponse({
                total: stats,
                nodes_by_type: Object.fromEntries(byType),
                edges_by_type: Object.fromEntries(byEdgeType)
              });
            }

            if (path === "/api/analytics") {
              const analytics = db.computeAnalytics();
              return jsonResponse(analytics);
            }

            if (path.startsWith("/api/summarize/")) {
              const nodeId = decodeURIComponent(path.replace("/api/summarize/", ""));
              const result = db.generateSummary(nodeId);
              if (!result) {
                return jsonResponse({ error: "Node not found" }, 404);
              }
              return jsonResponse(result);
            }

            if (path === "/api/webhook/git-push") {
              if (readOnly) {
                return jsonResponse({ error: "Read-only mode" }, 403);
              }
              if (method !== "POST") {
                return jsonResponse({ error: "Method not allowed" }, 405);
              }
              const body = await req.json();
              console.log(`[webhook] Git push received:`, body.ref);
              return jsonResponse({ 
                status: "received", 
                message: "Rebuild triggered (not implemented)"
              });
            }

            if (path === "/") {
              return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>OmniGraph API</title>
                  <style>
                    body { font-family: system-ui; background: #0d1117; color: #c9d1d9; padding: 40px; }
                    h1 { color: #58a6ff; }
                    code { background: #21262d; padding: 2px 8px; border-radius: 4px; }
                    .endpoint { margin: 10px 0; padding: 10px; background: #161b22; border-radius: 6px; }
                    a { color: #58a6ff; }
                  </style>
                </head>
                <body>
                  <h1>🚀 OmniGraph API</h1>
                  <p>Server running on port ${port}</p>
                  
                  <h2>Endpoints</h2>
                  <div class="endpoint"><code>GET /api/nodes</code> — List all nodes</div>
                  <div class="endpoint"><code>GET /api/nodes/:id</code> — Get node details + backlinks</div>
                  <div class="endpoint"><code>GET /api/search?q=auth</code> — Text search</div>
                  <div class="endpoint"><code>GET /api/semantic?q=auth</code> — Semantic search</div>
                  <div class="endpoint"><code>POST /api/ask</code> — Q&A with RAG</div>
                  <div class="endpoint"><code>GET /api/backlinks?id=file.ts</code> — Reverse dependencies</div>
                  <div class="endpoint"><code>GET /api/impact?id=file.ts</code> — Impact analysis</div>
                  <div class="endpoint"><code>GET /api/export?format=json</code> — Export graph</div>
                  <div class="endpoint"><code>GET /api/stats</code> — Graph statistics</div>
                  <div class="endpoint"><code>GET /api/analytics</code> — Advanced analytics (density, hubs, clusters)</div>
                  <div class="endpoint"><code>GET /api/summarize/:id</code> — Auto-summary for a node</div>
                  <div class="endpoint"><code>POST /api/webhook/git-push</code> — Git webhook</div>
                  
                  <h2>Examples</h2>
                  <pre><code>curl http://localhost:${port}/api/nodes
curl http://localhost:${port}/api/semantic?q=auth
curl -X POST http://localhost:${port}/api/ask -d '{"question":"Where is auth?"}'</code></pre>
                </body>
                </html>
              `, {
                headers: { "Content-Type": "text/html" }
              });
            }

            return new Response("Not found", { status: 404 });
          } catch (err) {
            return jsonResponse({ error: (err as Error).message }, 500);
          }
        }
      });

      process.on("SIGINT", () => {
        console.log("\n👋 Shutting down...");
        server.stop();
        process.exit(0);
      });

      break;
    }

    case "git-log": {
      const count = parseInt(args[1] || "10", 10);
      console.log(`\n## Recent ${count} commits (files modified)\n`);
      try {
        const logOutput = execSync(
          `git log --oneline --name-only -n ${count} --pretty=format:"%h %s"`,
          { cwd: projectPath, encoding: "utf-8" }
        );
        const lines = logOutput.split("\n");
        let currentCommit = "";
        let commitFiles: string[] = [];
        for (const line of lines) {
          const commitMatch = line.match(/^([a-f0-9]{7,})\s+(.+)/);
          if (commitMatch) {
            if (currentCommit && commitFiles.length > 0) {
              console.log(`  ${currentCommit}`);
              for (const f of commitFiles) {
                if (f.trim()) console.log(`    - ${f.trim()}`);
              }
            }
            currentCommit = commitMatch[0];
            commitFiles = [];
          } else if (line.trim()) {
            commitFiles.push(line.trim());
          }
        }
        if (currentCommit && commitFiles.length > 0) {
          console.log(`  ${currentCommit}`);
          for (const f of commitFiles) {
            if (f.trim()) console.log(`    - ${f.trim()}`);
          }
        }
      } catch (e) {
        console.error("Failed to run git log:", (e as Error).message);
      }
      break;
    }

    case "session-resume": {
      if (!fs.existsSync(dbPath)) {
        console.log("DB not found. Run 'omnigraph build' first.");
        break;
      }

      const db = new GraphDB(dbPath);
      const allNodes = db.getAllNodes();
      const allEdges = db.getAllEdges();

      const sessions = allNodes.filter((n: any) => n.type === "session")
        .sort((a: any, b: any) => {
          const dateA = a.created_at || "0000";
          const dateB = b.created_at || "0000";
          return dateB.localeCompare(dateA);
        });

      if (sessions.length === 0) {
        console.log("No sessions found. Create a session with 'omnigraph save' first.");
        db.close();
        break;
      }

      const latestSession = sessions[0];
      const summaryPath = `memory/sessions/${latestSession.label}/summary.md`;

      console.log(`\n## Session Resume: ${latestSession.label}`);
      console.log(`Generated: ${latestSession.created_at || "unknown"}\n`);

      const modifiedFiles = allEdges
        .filter(e => e.from_id === latestSession.id && e.type === "session_modified")
        .map(e => e.to_id);

      if (modifiedFiles.length === 0) {
        console.log("No files modified in this session.");
        db.close();
        break;
      }

      console.log(`## Files Modified (${modifiedFiles.length})\n`);
      for (const f of modifiedFiles) {
        console.log(`  - ${f}`);
      }

      console.log("\n## Context Check\n");
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      for (const target of modifiedFiles) {
        const usedBy = allEdges.filter(e => e.to_id === target && e.type !== "indexes").map(e => e.from_id);
        const sessionCount = allEdges.filter(e => e.to_id === target && e.type === "session_modified").length;
        const errors = allEdges.filter(e => e.to_id === target && e.type === "affects")
          .map(e => e.from_id)
          .filter(id => { const n = nodeMap.get(id); return n && n.type === "error"; });

        const risk = usedBy.length > 3 || errors.length > 0 ? "HIGH" : usedBy.length > 0 ? "MEDIUM" : "LOW";
        console.log(`${target}: ${usedBy.length} dependents, ${sessionCount} sessions, ${errors.length} errors [${risk}]`);
      }

      db.close();
      break;
    }

    case "sessions": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allNodes = db.getAllNodes();
      const allEdges = db.getAllEdges();

      const sessions = allNodes.filter((n: any) => n.type === "session");
      const isRecent = args.includes("--recent") || args.includes("-r");
      const dateFilter = args.find(a => a.startsWith("--date="));

      let filtered = sessions;
      if (dateFilter) {
        const date = dateFilter.replace("--date=", "");
        filtered = sessions.filter((n: any) => n.created_at?.startsWith(date));
      }

      if (isRecent) {
        filtered.sort((a: any, b: any) => {
          const dateA = a.created_at || "0000";
          const dateB = b.created_at || "0000";
          return dateB.localeCompare(dateA);
        });
        filtered = filtered.slice(0, 10);
      }

      filtered.sort((a: any, b: any) => {
        const dateA = a.created_at || "0000";
        const dateB = b.created_at || "0000";
        return dateB.localeCompare(dateA);
      });

      console.log(`\n## Sessions (${filtered.length})\n`);
      for (const s of filtered) {
        const modifiedFiles = allEdges.filter(e => e.from_id === s.id && e.type === "session_modified").map(e => e.to_id);
        console.log(`  [${s.created_at || "unknown"}] ${s.label} (${modifiedFiles.length} files)`);
        for (const f of modifiedFiles.slice(0, 5)) {
          console.log(`    - ${f}`);
        }
        if (modifiedFiles.length > 5) {
          console.log(`    ... and ${modifiedFiles.length - 5} more`);
        }
      }

      db.close();
      break;
    }

    case "lessons": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allNodes = db.getAllNodes();
      const allEdges = db.getAllEdges();
      const annotationsByNode = db.getAllAnnotations();

      const lessonItems = allNodes.filter((n: any) => n.type === "lesson_item");
      const moduleFilter = args.find(a => a.startsWith("--module="));
      const isRecent = args.includes("--recent") || args.includes("-r");
      const isAll = args.includes("--all") || args.includes("-a");

      let filtered = lessonItems;
      if (moduleFilter) {
        const modPath = moduleFilter.replace("--module=", "");
        const applicableIds = new Set(
          allEdges.filter(e => e.type === "lesson_applies_to" && e.to_id === modPath).map(e => e.from_id)
        );
        filtered = filtered.filter((n: any) => applicableIds.has(n.id));
      }

      if (isRecent) {
        filtered.sort((a: any, b: any) => {
          const dateA = a.created_at || "0000";
          const dateB = b.created_at || "0000";
          return dateB.localeCompare(dateA);
        });
        filtered = filtered.slice(0, 15);
      }

      console.log(`\n## Lesson Items (${filtered.length}${moduleFilter ? ` for ${moduleFilter.replace("--module=", "")}` : ""})\n`);
      for (const li of filtered) {
        const tags = (annotationsByNode.get(li.id) || [])
          .filter(a => a.key === "tag")
          .map(a => a.value);
        const date = li.created_at || "";
        const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
        const modules = allEdges
          .filter(e => e.from_id === li.id && e.type === "lesson_applies_to")
          .map(e => e.to_id);
        const modStr = modules.length ? ` → ${modules.join(", ")}` : "";
        console.log(`  ${date ? `[${date}] ` : ""}${li.label}${tagStr}${modStr}`);
      }

      db.close();
      break;
    }

    case "hotspots": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
      const annotationsByNode = db.getAllAnnotations();

      const sessionModCount = new Map<string, number>();
      const sessionModSessions = new Map<string, string[]>();
      for (const e of allEdges) {
        if (e.type === "session_modified") {
          sessionModCount.set(e.to_id, (sessionModCount.get(e.to_id) || 0) + 1);
          if (!sessionModSessions.has(e.to_id)) sessionModSessions.set(e.to_id, []);
          sessionModSessions.get(e.to_id)!.push(e.from_id);
        }
      }

      const lessonApplyCount = new Map<string, number>();
      const lessonApplyLessons = new Map<string, string[]>();
      for (const e of allEdges) {
        if (e.type === "lesson_applies_to") {
          lessonApplyCount.set(e.to_id, (lessonApplyCount.get(e.to_id) || 0) + 1);
          if (!lessonApplyLessons.has(e.to_id)) lessonApplyLessons.set(e.to_id, []);
          lessonApplyLessons.get(e.to_id)!.push(e.from_id);
        }
      }

      const allTargets = new Set([...sessionModCount.keys(), ...lessonApplyCount.keys()]);
      const sorted = [...allTargets].sort((a, b) => {
        const scoreA = (sessionModCount.get(a) || 0) * 2 + (lessonApplyCount.get(a) || 0);
        const scoreB = (sessionModCount.get(b) || 0) * 2 + (lessonApplyCount.get(b) || 0);
        return scoreB - scoreA;
      });

      console.log("\n## Hotspots\n");
      const errorPattern = /\b(crash|failure|broken|segfault|panic|OOM|unreachable|fatal)\b/i;

      for (const target of sorted.slice(0, 15)) {
        const sCount = sessionModCount.get(target) || 0;
        const lCount = lessonApplyCount.get(target) || 0;
        if (sCount === 0 && lCount === 0) continue;

        const node = nodeMap.get(target);
        const label = node ? node.label : target;
        console.log(`### ${label} (${target})`);
        console.log(`  Sessions: ${sCount} | Lessons: ${lCount}`);

        if (sCount > 0) {
          const sessions = sessionModSessions.get(target) || [];
          console.log(`  Sessions: ${sessions.slice(-3).join(", ")}`);
        }

        const relatedErrors = allEdges
          .filter(e => e.to_id === target && e.type === "caused")
          .map(e => e.from_id);

        const errorLessons = (lessonApplyLessons.get(target) || [])
          .filter(lId => {
            const items = allEdges.filter(e => e.from_id === lId && e.type === "lesson_contains").map(e => e.to_id);
            return items.some(itemId => {
              const itemNode = nodeMap.get(itemId);
              return itemNode && errorPattern.test(itemNode.label);
            });
          });

        if (errorLessons.length > 0) {
          console.log(`  Error-related lessons: ${errorLessons.join(", ")}`);
        }

        const errorItems = allEdges
          .filter(e => e.to_id === target && e.type === "lesson_applies_to")
          .map(e => e.from_id)
          .flatMap(lessonId =>
            allEdges.filter(e => e.from_id === lessonId && e.type === "lesson_contains").map(e => e.to_id)
          )
          .filter(itemId => {
            const itemNode = nodeMap.get(itemId);
            return itemNode && itemNode.type === "lesson_item" && errorPattern.test(itemNode.label);
          })
          .map(itemId => {
            const itemNode = nodeMap.get(itemId);
            const tags = (annotationsByNode.get(itemId) || []).filter(a => a.key === "tag").map(a => a.value);
            return `${itemNode.label}${tags.length ? ` [${tags.join(", ")}]` : ""}`;
          });

        if (errorItems.length > 0) {
          console.log(`  Recurring issues:`);
          for (const err of [...new Set(errorItems)].slice(0, 5)) {
            console.log(`    - ${err}`);
          }
        }

        console.log("");
      }

      db.close();
      break;
    }

    case "errors": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
      const unresolvedOnly = args.includes("--unresolved") || args.includes("-u");

      let errors = db.db.prepare(`
        SELECT e.id, e.label, e.file_path,
               (SELECT GROUP_CONCAT(f.label || ' [' || f.file_path || ']')
                FROM edges er
                JOIN nodes f ON er.to_id = f.id
                WHERE er.from_id = e.id AND er.type = 'resolved_by') as fixes,
               (SELECT GROUP_CONCAT(w.label || ' [' || w.file_path || ']')
                FROM edges er
                JOIN nodes w ON er.to_id = w.id
                WHERE er.from_id = e.id AND er.type = 'workaround_by') as workarounds,
               (SELECT GROUP_CONCAT(s.id)
                FROM edges de
                JOIN nodes s ON de.from_id = s.id
                WHERE de.to_id = e.id AND de.type = 'detected_error') as sessions
        FROM nodes e
        WHERE e.type = 'error'
        ORDER BY e.id
      `).all() as any[];

      if (fileFilter) {
        const affectedErrorIds = allEdges
          .filter(e => e.to_id === fileFilter && e.type === "affects")
          .map(e => e.from_id);
        errors = errors.filter(e => affectedErrorIds.includes(e.id));
        console.log(`\n## Errors affecting ${fileFilter} (${errors.length})\n`);
      } else {
        console.log(`\n## Errors (${errors.length})\n`);
      }

      if (!errors.length) {
        console.log("No errors found.");
        db.close();
        break;
      }

      for (const err of errors) {
        if (unresolvedOnly && (err.fixes || err.workarounds)) continue;

        console.log(`### ${err.label}`);
        console.log(`  📁 ${err.file_path}`);
        if (err.sessions) {
          console.log(`  📅 Sessions: ${err.sessions}`);
        }
        if (err.fixes) {
          console.log(`  ✅ Fixes: ${err.fixes}`);
        }
        if (err.workarounds) {
          console.log(`  🔄 Workarounds: ${err.workarounds}`);
        }
        if (!err.fixes && !err.workarounds) {
          console.log(`  ⚠️  UNRESOLVED`);
        }

        const affectsEdges = allEdges.filter(e => e.from_id === err.id && e.type === "affects");
        if (affectsEdges.length) {
          const affectedFiles = affectsEdges.map(e => e.to_id);
          console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
        }
        console.log("");
      }

      db.close();
      break;
    }

    case "issues": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));

      const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
      const unresolvedOnly = args.includes("--unresolved") || args.includes("-u");

      let issues = db.db.prepare(`
        SELECT n.id, n.label, n.file_path, n.created_at,
               (SELECT GROUP_CONCAT(s.id)
                FROM edges e
                JOIN nodes s ON e.from_id = s.id
                WHERE e.to_id = n.id AND e.type = 'detected_issue') as sessions,
               (SELECT GROUP_CONCAT(c.label)
                FROM edges e
                JOIN nodes c ON e.to_id = n.id
                WHERE e.from_id = c.id AND e.type = 'resolves') as resolved_by,
               (SELECT GROUP_CONCAT(c.label)
                FROM edges e
                JOIN nodes c ON e.to_id = n.id
                WHERE e.from_id = c.id AND e.type = 'workaround_for') as workaround_by
        FROM nodes n
        WHERE n.type = 'issue'
        ORDER BY n.created_at
      `).all() as any[];

      if (fileFilter) {
        const affectedIssueIds = allEdges
          .filter(e => e.to_id === fileFilter && e.type === "affects")
          .map(e => e.from_id);
        issues = issues.filter(i => affectedIssueIds.includes(i.id));
        console.log(`\n## Issues affecting ${fileFilter} (${issues.length})\n`);
      } else {
        console.log(`\n## Issues (${issues.length})\n`);
      }

      if (!issues.length) {
        console.log("No issues found.");
        db.close();
        break;
      }

      for (const issue of issues) {
        if (unresolvedOnly && (issue.resolved_by || issue.workaround_by)) continue;

        console.log(`### ${issue.label}`);
        console.log(`  📅 Detected: ${issue.created_at || "unknown"}`);
        if (issue.sessions) {
          console.log(`  📝 From session: ${issue.sessions}`);
        }
        if (issue.resolved_by) {
          console.log(`  ✅ Resolved by: ${issue.resolved_by}`);
        }
        if (issue.workaround_by) {
          console.log(`  🔄 Workaround: ${issue.workaround_by}`);
        }
        if (!issue.resolved_by && !issue.workaround_by) {
          console.log(`  ⚠️  UNRESOLVED`);
        }

        const affectsEdges = allEdges.filter(e => e.from_id === issue.id && e.type === "affects");
        if (affectsEdges.length) {
          const affectedFiles = affectsEdges.map(e => e.to_id);
          console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
        }
        console.log("");
      }

      db.close();
      break;
    }

    case "decisions": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
      const annotationsByNode = db.getAllAnnotations();

      const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");

      let decisions = db.db.prepare(`
        SELECT n.id, n.label, n.file_path, n.created_at,
               (SELECT GROUP_CONCAT(s.id)
                FROM edges e
                JOIN nodes s ON e.from_id = s.id
                WHERE e.to_id = n.id AND e.type = 'made_decision') as sessions
        FROM nodes n
        WHERE n.type = 'decision'
        ORDER BY n.created_at
      `).all() as any[];

      if (fileFilter) {
        const affectedDecisionIds = allEdges
          .filter(e => e.to_id === fileFilter && e.type === "applies_to")
          .map(e => e.from_id);
        decisions = decisions.filter(d => affectedDecisionIds.includes(d.id));
        console.log(`\n## Decisions affecting ${fileFilter} (${decisions.length})\n`);
      } else {
        console.log(`\n## Decisions (${decisions.length})\n`);
      }

      if (!decisions.length) {
        console.log("No decisions found.");
        db.close();
        break;
      }

      for (const decision of decisions) {
        console.log(`### ${decision.label}`);
        console.log(`  📅 Date: ${decision.created_at || "unknown"}`);
        if (decision.sessions) {
          console.log(`  📝 From session: ${decision.sessions}`);
        }

        const anns = annotationsByNode.get(decision.id) || [];
        const rationale = anns.find(a => a.key === "rationale");
        if (rationale) {
          console.log(`  📝 Rationale: ${rationale.value}`);
        }
        const alternatives = anns.find(a => a.key === "alternatives");
        if (alternatives) {
          console.log(`  🔄 Alternatives: ${alternatives.value}`);
        }

        const appliesEdges = allEdges.filter(e => e.from_id === decision.id && e.type === "applies_to");
        if (appliesEdges.length) {
          const appliesTo = appliesEdges.map(e => e.to_id);
          console.log(`  📂 Applies to: ${appliesTo.join(", ")}`);
        }
        console.log("");
      }

      db.close();
      break;
    }

    case "changes": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
      const annotationsByNode = db.getAllAnnotations();

      const fileFilter = args.find(a => a.startsWith("--file="))?.replace("--file=", "");
      const typeFilter = args.find(a => a.startsWith("--type="))?.replace("--type=", "");

      let changes = db.db.prepare(`
        SELECT n.id, n.label, n.file_path, n.created_at,
               (SELECT GROUP_CONCAT(s.id)
                FROM edges e
                JOIN nodes s ON e.from_id = s.id
                WHERE e.to_id = n.id AND e.type = 'recorded_change') as recorded_in
        FROM nodes n
        WHERE n.type = 'change'
        ORDER BY n.created_at
      `).all() as any[];

      if (fileFilter) {
        const affectedChangeIds = allEdges
          .filter(e => e.to_id === fileFilter && e.type === "affects")
          .map(e => e.from_id);
        changes = changes.filter(c => affectedChangeIds.includes(c.id));
      }

      if (typeFilter) {
        changes = changes.filter(c => {
          const anns = annotationsByNode.get(c.id) || [];
          const changeType = anns.find(a => a.key === "change_type");
          return changeType && changeType.value === typeFilter;
        });
      }

      if (fileFilter && typeFilter) {
        console.log(`\n## Changes affecting ${fileFilter} (type: ${typeFilter}) (${changes.length})\n`);
      } else if (fileFilter) {
        console.log(`\n## Changes affecting ${fileFilter} (${changes.length})\n`);
      } else if (typeFilter) {
        console.log(`\n## Changes (type: ${typeFilter}) (${changes.length})\n`);
      } else {
        console.log(`\n## Changes (${changes.length})\n`);
      }

      if (!changes.length) {
        console.log("No changes found.");
        db.close();
        break;
      }

      for (const change of changes) {
        const anns = annotationsByNode.get(change.id) || [];
        const changeType = anns.find(a => a.key === "change_type");

        console.log(`### ${change.label}`);
        console.log(`  📅 Date: ${change.created_at || "unknown"}`);
        if (changeType) {
          console.log(`  🏷️ Type: ${changeType.value}`);
        }

        const oldValue = anns.find(a => a.key === "old_value");
        const newValue = anns.find(a => a.key === "new_value");
        if (oldValue && newValue) {
          console.log(`  🔄 ${oldValue.value} → ${newValue.value}`);
        }

        const reason = anns.find(a => a.key === "reason");
        if (reason) {
          console.log(`  📝 Reason: ${reason.value}`);
        }

        const affectsEdges = allEdges.filter(e => e.from_id === change.id && e.type === "affects");
        if (affectsEdges.length) {
          const affectedFiles = affectsEdges.map(e => e.to_id);
          console.log(`  📂 Affects: ${affectedFiles.join(", ")}`);
        }

        const resolvesEdges = allEdges.filter(e => e.from_id === change.id && e.type === "resolves");
        if (resolvesEdges.length) {
          const resolvedIssues = resolvesEdges.map(e => {
            const node = nodeMap.get(e.to_id);
            return node ? node.label.slice(0, 80) : e.to_id;
          });
          console.log(`  ✅ Resolves: ${resolvedIssues.join("; ")}`);
        }

        const implementsEdges = allEdges.filter(e => e.from_id === change.id && e.type === "implements");
        if (implementsEdges.length) {
          const implementedDecisions = implementsEdges.map(e => {
            const node = nodeMap.get(e.to_id);
            return node ? node.label.slice(0, 80) : e.to_id;
          });
          console.log(`  💡 Implements: ${implementedDecisions.join("; ")}`);
        }
        console.log("");
      }

      db.close();
      break;
    }

    case "timeline": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const target = args[1];
      if (!target) {
        console.log("Usage: omnigraph timeline <file-path>");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
      const annotationsByNode = db.getAllAnnotations();

      const events: { date: string; type: string; label: string; nodeId: string; metadata: string }[] = [];

      const changes = allEdges
        .filter(e => e.to_id === target && e.type === "affects")
        .map(e => nodeMap.get(e.from_id))
        .filter(n => n && n.type === "change");

      for (const change of changes) {
        const anns = annotationsByNode.get(change.id) || [];
        const changeType = anns.find(a => a.key === "change_type");
        const date = change.created_at || "unknown";
        const metadata = changeType ? `[${changeType.value}]` : "";
        events.push({ date, type: "CHANGE", label: change.label, nodeId: change.id, metadata });
      }

      const issues = allEdges
        .filter(e => e.to_id === target && e.type === "affects")
        .map(e => nodeMap.get(e.from_id))
        .filter(n => n && n.type === "issue");

      for (const issue of issues) {
        const date = issue.created_at || "unknown";
        events.push({ date, type: "ISSUE", label: issue.label, nodeId: issue.id, metadata: "" });
      }

      const decisions = allEdges
        .filter(e => e.to_id === target && e.type === "applies_to")
        .map(e => nodeMap.get(e.from_id))
        .filter(n => n && n.type === "decision");

      for (const decision of decisions) {
        const date = decision.created_at || "unknown";
        events.push({ date, type: "DECISION", label: decision.label, nodeId: decision.id, metadata: "" });
      }

      const sessions = allEdges
        .filter(e => e.to_id === target && e.type === "session_modified")
        .map(e => nodeMap.get(e.from_id))
        .filter(n => n && n.type === "session");

      for (const session of sessions) {
        const date = session.created_at || "unknown";
        events.push({ date, type: "SESSION", label: session.label, nodeId: session.id, metadata: "" });
      }

      events.sort((a, b) => a.date.localeCompare(b.date));

      console.log(`\n## Timeline: ${target}\n`);
      console.log(`Total events: ${events.length}\n`);

      for (const event of events) {
        const icon = event.type === "CHANGE" ? "📝" : event.type === "ISSUE" ? "⚠️" : event.type === "DECISION" ? "💡" : "📋";
        console.log(`${event.date ? `[${event.date}]` : "[unknown]"} ${icon} ${event.type}: ${event.label.slice(0, 100)}`);
        if (event.metadata) {
          console.log(`    ${event.metadata}`);
        }
      }

      db.close();
      break;
    }

    case "semantic": {
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }

      const searchArgs = args.slice(1);
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
        break;
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
      break;
    }

    default:
      usage();
      break;
  }
}

main().catch(console.error);
