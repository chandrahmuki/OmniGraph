#!/usr/bin/env bun

import { GraphDB } from "./db.ts";
import { scanAndExtract } from "./extract.ts";
import { buildHtml } from "./web/build.ts";
import { buildIndex } from "./extractors/semantic.ts";
import { CleanupCommand } from "./commands/cleanup-command.ts";
import { OrphansCommand } from "./commands/orphans-command.ts";
import { QueryCommand } from "./commands/query-command.ts";
import { SearchCommand } from "./commands/search-command.ts";
import { SessionResumeCommand } from "./commands/session-resume-command.ts";
import { SessionsCommand } from "./commands/sessions-command.ts";
import { CheckCommand } from "./commands/check-command.ts";
import { ImpactCommand } from "./commands/impact-command.ts";
import { PathCommand } from "./commands/path-command.ts";
import { BacklinksCommand } from "./commands/backlinks-command.ts";
import { SnapshotCommand } from "./commands/snapshot-command.ts";
import { DiffCommand } from "./commands/diff-command.ts";
import { ExportCommand } from "./commands/export-command.ts";
import { AnalyticsCommand } from "./commands/analytics-command.ts";
import { SummarizeCommand } from "./commands/summarize-command.ts";
import { GitLogCommand } from "./commands/git-log-command.ts";
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
    const cleanup = db.cleanupDeadNodes(projectPath);
    if (cleanup.removed > 0 || cleanup.orphans > 0) {
      console.log(`Cleanup: ${cleanup.removed} dead refs, ${cleanup.orphans} orphans removed`);
    }
  }

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
  cleanup        Remove dead nodes, orphans, and stale edges (run after manual file deletions)
                   --vacuum       Also vacuum database to reclaim space

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
      await new QueryCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "search": {
      const kindArg = args.find(a => a.startsWith("--kind="));
      const kind = kindArg ? kindArg.split("=")[1] : undefined;
      await new SearchCommand().run(projectPath, dbPath, args.slice(1), { kind });
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
      await new CheckCommand().run(projectPath, dbPath, args.slice(1));
      break;
    }

    case "impact": {
      await new ImpactCommand().run(projectPath, dbPath, args.slice(1));
      break;
    }

    case "path": {
      await new PathCommand().run(projectPath, dbPath, args.slice(1));
      break;
    }

    case "backlinks": {
      const depthArg = args.find(a => a.startsWith("--depth="));
      const depth = depthArg ? parseInt(depthArg.split("=")[1], 10) : 1;
      const asJson = args.includes("--json");
      await new BacklinksCommand().run(projectPath, dbPath, args.slice(1), { depth, asJson });
      break;
    }

    case "snapshot": {
      const subcommand = args[1];
      const name = args[2];
      await new SnapshotCommand().run(projectPath, dbPath, [subcommand, name].filter(Boolean), {});
      break;
    }

    case "diff": {
      const asJson = args.includes("--json");
      await new DiffCommand().run(projectPath, dbPath, args.slice(1), { asJson });
      break;
    }

    case "export": {
      const filterArg = args.find(a => a.startsWith("--filter="));
      const filter = filterArg ? filterArg.split("=")[1] : undefined;
      await new ExportCommand().run(projectPath, dbPath, args.slice(1), { filter });
      break;
    }

    case "cleanup": {
      const vacuum = args.includes("--vacuum");
      await new CleanupCommand().run(projectPath, dbPath, args.slice(1), { vacuum });
      break;
    }

    case "orphans": {
      await new OrphansCommand().run(projectPath, dbPath);
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
      const clustersOnly = args.includes("--clusters");
      await new SummarizeCommand().run(projectPath, dbPath, args.slice(1), { clustersOnly });
      break;
    }

    case "analytics": {
      const asJson = args.includes("--json");
      await new AnalyticsCommand().run(projectPath, dbPath, args.slice(1), { asJson });
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
      await new GitLogCommand().run(projectPath, dbPath);
      break;
    }

    case "session-resume": {
      await new SessionResumeCommand().run(projectPath, dbPath);
      break;
    }

    case "sessions": {
      const isRecent = args.includes("--recent") || args.includes("-r");
      const dateFilter = args.find(a => a.startsWith("--date="));
      const date = dateFilter ? dateFilter.replace("--date=", "") : undefined;
      await new SessionsCommand().run(projectPath, dbPath, args, { recent: isRecent, date });
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
