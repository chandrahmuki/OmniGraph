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
import { LessonsCommand } from "./commands/lessons-command.ts";
import { HotspotsCommand } from "./commands/hotspots-command.ts";
import { ErrorsCommand } from "./commands/errors-command.ts";
import { IssuesCommand } from "./commands/issues-command.ts";
import { DecisionsCommand } from "./commands/decisions-command.ts";
import { ChangesCommand } from "./commands/changes-command.ts";
import { TimelineCommand } from "./commands/timeline-command.ts";
import { SemanticCommand } from "./commands/semantic-command.ts";
import { ServeCommand } from "./commands/serve-command.ts";
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

      fs.mkdirSync(snapshotDir, { recursive: true });

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
      console.log("⚠️  Embeddings not yet implemented");
      console.log("This feature will use SQLite FTS5 for semantic search");
      console.log("Track progress in memory/sessions/ or issues/");
      break;
    }

    case "ask": {
      console.log("⚠️  Ask not yet implemented");
      console.log("This feature will use embeddings + semantic search");
      console.log("Track progress in memory/sessions/ or issues/");
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
      await new ServeCommand().run(projectPath, dbPath, args.slice(1), {});
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
      await new LessonsCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "hotspots": {
      await new HotspotsCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "errors": {
      await new ErrorsCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "issues": {
      await new IssuesCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "decisions": {
      await new DecisionsCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "changes": {
      await new ChangesCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "timeline": {
      await new TimelineCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    case "semantic": {
      await new SemanticCommand().run(projectPath, dbPath, args.slice(1), {});
      break;
    }

    default:
      usage();
      break;
  }
}

main().catch(console.error);
