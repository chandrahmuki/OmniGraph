#!/usr/bin/env bun

import { GraphDB } from "./db.ts";
import { scanAndExtract } from "./extract.ts";
import { buildHtml } from "./web/build.ts";
import { buildIndex } from "./extractors/semantic.ts";

const LIB_DIR = import.meta.dirname;

const args = process.argv.slice(2);
const command = args[0];
const projectPath = process.cwd();
const dbPath = `${projectPath}/.omnigraph/graph.db`;
const htmlPath = `${projectPath}/.omnigraph/index.html`;
const incremental = args.includes("--incremental") || args.includes("-i");

function ensureDir(path: string) {
  const fs = require("node:fs");
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });
}

function usage() {
  console.log(`
Usage: omnigraph <command>

Commands:
  build      Scan project, build DB and generate HTML
  query      Search the DB (nodes, annotations, lesson items)
  search     Search concepts (functions, classes, structs, types)
  check      Pre-edit check for a file (dependencies, sessions, lessons)
  impact     Show full blast radius of changing a file (transitive reverse deps)
  path       Find shortest dependency path between two nodes
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

Examples:
  omnigraph build
  omnigraph build --incremental
  omnigraph query flake
  omnigraph search handleAuth
  omnigraph search --kind function
  omnigraph check modules/niri.nix
  omnigraph impact modules/niri.nix
  omnigraph path modules/niri.nix modules/terminal.nix
  omnigraph orphans
  omnigraph git-log
  omnigraph lessons
  omnigraph lessons --recent
  omnigraph lessons --module modules/dbus.nix
  omnigraph issues --unresolved
  omnigraph decisions --file=modules/niri.nix
  omnigraph changes --type=replace
  omnigraph timeline modules/niri.nix
`);
}

async function main() {
  switch (command) {
    case "build": {
      ensureDir(`${projectPath}/.omnigraph`);
      const db = new GraphDB(dbPath);

      if (!incremental) {
        db.clear();
      }

      console.log(incremental ? "Incremental scan..." : "Scanning project...");
      await scanAndExtract(projectPath, db, incremental);

      const fs = require("node:fs");
      const path = require("node:path");

      if (!incremental) {
        db.db.exec(`
          DELETE FROM nodes WHERE id NOT IN (
            SELECT from_id FROM edges UNION SELECT to_id FROM edges
          ) AND type NOT IN ('lesson', 'lesson_item');
        `);
      }

      const allNodes = db.getAllNodes();
      const deadIds: string[] = [];
      for (const n of allNodes) {
        if (n.type === "file" && n.file_path && !n.file_path.startsWith("inputs.")) {
          const fullPath = path.join(projectPath, n.file_path);
          if (!fs.existsSync(fullPath)) {
            deadIds.push(n.id);
          }
        }
      }
      if (deadIds.length > 0) {
        const deadList = deadIds.map(id => `'${id}'`).join(",");
        db.db.exec(`DELETE FROM edges WHERE from_id IN (${deadList}) OR to_id IN (${deadList})`);
        db.db.exec(`DELETE FROM nodes WHERE id IN (${deadList})`);
        db.db.exec(`DELETE FROM nodes WHERE id NOT IN (SELECT from_id FROM edges UNION SELECT to_id FROM edges)`);
        console.log(`Removed ${deadIds.length} dead references: ${deadIds.join(", ")}`);
      }

      const stats = db.count();
      console.log(`${stats.nodes} nodes, ${stats.edges} edges extracted`);

      console.log("Generating visualization...");
      buildHtml(dbPath, htmlPath, projectPath);

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

    case "search": {
      const fs = require("node:fs");
      if (!fs.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const searchArgs = args.slice(1);
      const term = searchArgs.find(a => !a.startsWith("--"));
      const kindFilter = searchArgs.find(a => a.startsWith("--kind="))?.replace("--kind=", "");
      if (!term) {
        console.log("Usage: omnigraph search <term> [--kind=function|class|struct|interface|type]");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const results = db.searchConcepts(term, kindFilter);

      console.log(`\n## Search: "${term}"${kindFilter ? ` (kind: ${kindFilter})` : ""}\n`);
      console.log(`Found ${results.length} concept(s):\n`);

      const grouped: Record<string, any[]> = {};
      for (const r of results) {
        if (!grouped[r.kind]) grouped[r.kind] = [];
        grouped[r.kind].push(r);
      }

      for (const [kind, items] of Object.entries(grouped)) {
        console.log(`### ${kind} (${items.length})`);
        for (const item of items.slice(0, 20)) {
          const loc = item.file_path ? `${item.file_path}` : "";
          const line = item.line_number ? `:${item.line_number}` : "";
          const snippet = item.snippet ? ` — ${item.snippet.slice(0, 80)}` : "";
          console.log(`  ${item.name} → ${loc}${line}${snippet}`);
        }
        if (items.length > 20) console.log(`  ... and ${items.length - 20} more`);
        console.log("");
      }

      db.close();
      break;
    }

    case "check": {
      const fs = require("node:fs");
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
      const annotationsByNode = db.getAllAnnotations();

      const down = allEdges.filter(e => e.from_id === target);
      const up = allEdges.filter(e => e.to_id === target);

      const imports = down.filter(e => e.type === "imports").map(e => e.to_id);
      const usesInput = down.filter(e => e.type === "uses_input").map(e => e.to_id);
      const sharesDep = down.filter(e => e.type === "shares_dep").map(e => {
        const hubNode = nodeMap.get(e.to_id);
        return hubNode ? hubNode.label : e.to_id;
      });
      const usesColors = down.filter(e => e.type === "uses_colors").map(e => e.to_id);
      const refsSecrets = down.filter(e => e.type === "references_secrets").map(e => e.to_id);
      const refsGenerated = down.filter(e => e.type === "references_generated").map(e => e.to_id);
      const provides = down.filter(e => e.type === "provides_option").map(e => e.to_id);
      const consumes = down.filter(e => e.type === "consumes_option").map(e => e.to_id);
      const usedBy = up.filter(e => e.type !== "indexes").map(e => e.from_id);
      const sessions = up.filter(e => e.type === "session_modified").map(e => e.from_id);
      const lessons = up.filter(e => e.type === "lesson_applies_to").map(e => e.from_id);

      const errorsAffecting = allEdges
        .filter(e => e.to_id === target && e.type === "affects")
        .map(e => e.from_id)
        .filter(nodeId => {
          const node = nodeMap.get(nodeId);
          return node && (node.type === "error" || node.type === "fix");
        });

      const errorNodes = errorsAffecting.filter(id => {
        const node = nodeMap.get(id);
        return node && node.type === "error";
      });

      const fixNodes = errorsAffecting.filter(id => {
        const node = nodeMap.get(id);
        return node && node.type === "fix";
      });

      const lessonItems = up
        .filter(e => e.type === "lesson_applies_to")
        .map(e => nodeMap.get(e.from_id))
        .filter((n: any) => n && n.type === "lesson_item");

      const issuesAffecting = allEdges
        .filter(e => e.to_id === target && e.type === "affects")
        .map(e => e.from_id)
        .filter(nodeId => {
          const node = nodeMap.get(nodeId);
          return node && node.type === "issue";
        });

      const decisionsAffecting = allEdges
        .filter(e => e.to_id === target && e.type === "applies_to")
        .map(e => e.from_id)
        .filter(nodeId => {
          const node = nodeMap.get(nodeId);
          return node && node.type === "decision";
        });

      const changesAffecting = allEdges
        .filter(e => e.to_id === target && e.type === "affects")
        .map(e => e.from_id)
        .filter(nodeId => {
          const node = nodeMap.get(nodeId);
          return node && node.type === "change";
        });

      const risk = (usedBy.length > 3 || errorNodes.length > 0 || issuesAffecting.length > 0) ? "HIGH" : usedBy.length > 0 ? "MEDIUM" : "LOW";

      console.log(`\n## ${target}`);
      if (imports.length) console.log(`↓ imports: ${imports.join(", ")}`);
      if (usesInput.length) console.log(`↓ uses_input: ${usesInput.join(", ")}`);
      if (sharesDep.length) console.log(`🔗 shares_dep: ${sharesDep.join(", ")}`);
      if (usesColors.length) console.log(`↓ uses_colors: ${usesColors.join(", ")}`);
      if (refsSecrets.length) console.log(`↓ refs_secrets: ${refsSecrets.join(", ")}`);
      if (refsGenerated.length) console.log(`↓ refs_generated: ${refsGenerated.join(", ")}`);
      if (usedBy.length) console.log(`↑ used_by: ${usedBy.join(", ")}`);
      else console.log(`↑ used_by: (none)`);
      if (sessions.length) console.log(`📝 sessions: ${sessions.slice(-5).join(", ")}`);
      if (lessons.length) console.log(`📖 lessons: ${lessons.join(", ")}`);
      if (errorNodes.length) {
        console.log(`🚨 PAST ERRORS (${errorNodes.length}):`);
        for (const errId of errorNodes) {
          const errNode = nodeMap.get(errId);
          if (errNode) {
            const fixEdges = allEdges.filter(e => e.from_id === errId && e.type === "resolved_by");
            const fixLabels = fixEdges.map(e => {
              const fixNode = nodeMap.get(e.to_id);
              return fixNode ? fixNode.label.slice(0, 80) : e.to_id;
            });
            const sessionEdges = allEdges.filter(e => e.to_id === errId && e.type === "detected_error");
            const sessionIds = sessionEdges.map(e => e.from_id);
            console.log(`  ⚠️  ${errNode.label.slice(0, 100)}`);
            if (fixLabels.length) console.log(`    ✅ Resolved by: ${fixLabels.join("; ")}`);
            if (sessionIds.length) console.log(`    📅 From session: ${sessionIds.join(", ")}`);
          }
        }
      }
      if (fixNodes.length && !errorNodes.length) {
        console.log(`🔧 FIXES APPLIED (${fixNodes.length}):`);
        for (const fixId of fixNodes) {
          const fixNode = nodeMap.get(fixId);
          if (fixNode) {
            console.log(`  ✅ ${fixNode.label.slice(0, 100)}`);
          }
        }
      }
      if (lessonItems.length) {
        console.log(`💡 lesson items:`);
        for (const li of lessonItems) {
          const tags = (annotationsByNode.get(li.id) || [])
            .filter(a => a.key === "tag")
            .map(a => a.value);
          const date = li.created_at ? ` (${li.created_at})` : "";
          const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
          console.log(`  - ${li.label}${date}${tagStr}`);
        }
      }
      if (issuesAffecting.length) {
        console.log(`📋 ISSUES (${issuesAffecting.length}):`);
        for (const issueId of issuesAffecting) {
          const issueNode = nodeMap.get(issueId);
          if (issueNode) {
            const resolvedBy = allEdges.filter(e => e.from_id === issueId && e.type === "resolved_by");
            const resolvedLabels = resolvedBy.map(e => {
              const node = nodeMap.get(e.to_id);
              return node ? node.label.slice(0, 80) : e.to_id;
            });
            console.log(`  ⚠️  ${issueNode.label.slice(0, 100)}`);
            if (resolvedLabels.length) console.log(`    ✅ Resolved by: ${resolvedLabels.join("; ")}`);
          }
        }
      }
      if (decisionsAffecting.length) {
        console.log(`💡 DECISIONS (${decisionsAffecting.length}):`);
        for (const decisionId of decisionsAffecting) {
          const decisionNode = nodeMap.get(decisionId);
          if (decisionNode) {
            const anns = annotationsByNode.get(decisionId) || [];
            const rationale = anns.find(a => a.key === "rationale");
            console.log(`  💡 ${decisionNode.label.slice(0, 100)}`);
            if (rationale) console.log(`    📝 ${rationale.value}`);
          }
        }
      }
      if (changesAffecting.length) {
        console.log(`📜 CHANGES (${changesAffecting.length}):`);
        for (const changeId of changesAffecting) {
          const changeNode = nodeMap.get(changeId);
          if (changeNode) {
            const anns = annotationsByNode.get(changeId) || [];
            const changeType = anns.find(a => a.key === "change_type");
            const oldValue = anns.find(a => a.key === "old_value");
            const newValue = anns.find(a => a.key === "new_value");
            let changeDesc = changeNode.label.slice(0, 100);
            if (oldValue && newValue) {
              changeDesc = `${changeType?.value || "change"}: ${oldValue.value} → ${newValue.value}`;
            }
            console.log(`  📝 ${changeDesc}`);
          }
        }
      }
      if (provides.length) console.log(`⚙️ provides: ${provides.join(", ")}`);
      if (consumes.length) console.log(`⚙️ consumes: ${consumes.join(", ")}`);

      const allRelated = [...down, ...up];
      const confCounts: Record<string, number> = {};
      for (const e of allRelated) {
        const c = e.confidence || "unknown";
        confCounts[c] = (confCounts[c] || 0) + 1;
      }
      const confParts = Object.entries(confCounts).map(([k, v]) => `${v} ${k}`);
      if (confParts.length) console.log(`🏷️ confidence: ${confParts.join(", ")}`);

      console.log(`⚠️ risk: ${risk} (${usedBy.length} reverse deps)`);

      db.close();
      break;
    }

    case "orphans": {
      const fsOrphans = require("node:fs");
      if (!fsOrphans.existsSync(dbPath)) {
        console.error("DB not found. Run 'omnigraph build' first.");
        process.exit(1);
      }
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();

      const nodeIds = new Set(allNodes.map((n: any) => n.id));
      const fromIds = new Set(allEdges.map((e: any) => e.from_id));
      const toIds = new Set(allEdges.map((e: any) => e.to_id));

      const inputs = allNodes.filter((n: any) => n.type === "input");
      const orphanInputs = inputs.filter((n: any) => {
        const codeRefs = allEdges.filter((e: any) =>
          e.to_id === n.id && e.type === "uses_input" && !e.from_id.startsWith("2026-")
        );
        return codeRefs.length === 0;
      });

      const isolatedFiles = allNodes.filter((n: any) =>
        n.type === "file" && !fromIds.has(n.id) && !toIds.has(n.id)
      );

      const path = require("node:path");
      const deadRefs = allNodes.filter((n: any) => {
        if (n.type !== "file" || !n.file_path) return false;
        const fullPath = path.join(projectPath, n.file_path);
        return !fsOrphans.existsSync(fullPath);
      });

      console.log("\n## Orphan Analysis\n");

      if (orphanInputs.length) {
        console.log(`### Unused Inputs (${orphanInputs.length})`);
        for (const n of orphanInputs) console.log(`  ${n.id} (${n.label})`);
      } else {
        console.log("### Unused Inputs: none");
      }

      if (isolatedFiles.length) {
        console.log(`\n### Isolated Files (${isolatedFiles.length})`);
        for (const n of isolatedFiles.slice(0, 20))
          console.log(`  ${n.id}`);
        if (isolatedFiles.length > 20) console.log(`  ... and ${isolatedFiles.length - 20} more`);
      } else {
        console.log("\n### Isolated Files: none");
      }

      if (deadRefs.length) {
        console.log(`\n### Dead References (file not on disk) (${deadRefs.length})`);
        for (const n of deadRefs) console.log(`  ${n.id} -> ${n.file_path}`);
      } else {
        console.log("\n### Dead References: none");
      }

      db.close();
      break;
    }

    case "impact": {
      const fsImpact = require("node:fs");
      if (!fsImpact.existsSync(dbPath)) {
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

      const sessions = allEdges.filter((e: any) =>
        e.from_id.startsWith("2026-") && e.to_id === target
      );
      if (sessions.length) {
        console.log(`\n### Related sessions:`);
        for (const e of sessions.slice(0, 5)) {
          console.log(`  ${e.from_id} [${e.type}]`);
        }
      }

      db.close();
      break;
    }

    case "path": {
      const fsPath = require("node:fs");
      if (!fsPath.existsSync(dbPath)) {
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

    case "git-log": {
      const { execSync } = require("node:child_process");
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

    case "lessons": {
      const fsLessons = require("node:fs");
      if (!fsLessons.existsSync(dbPath)) {
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
      const fs = require("node:fs");
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
