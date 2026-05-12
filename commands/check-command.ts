import { GraphDB } from "../db.ts";
import fs from "node:fs";

interface Options {
  depth?: number;
  asJson?: boolean;
}

export class CheckCommand {
  name = "check";
  description = "Pre-edit check for a file (dependencies, sessions, lessons)";

  async run(projectPath: string, dbPath: string, args: string[], options: Options = {}): Promise<void> {
    if (!fs.existsSync(dbPath)) {
      console.error("DB not found. Run 'omnigraph build' first.");
      process.exit(1);
    }

    const target = args[0];
    if (!target) {
      console.log("Usage: omnigraph check <file-path> [--depth=N] [--json]");
      process.exit(1);
    }

    const depth = options.depth || 1;
    const asJson = options.asJson || false;

    const db = new GraphDB(dbPath);
    const context = db.getFileContext(target, depth);

    if (!context) {
      console.log(`Node not found: ${target}`);
      db.close();
      process.exit(1);
    }

    if (asJson) {
      console.log(JSON.stringify({
        file: context.node.id,
        type: context.node.type,
        label: context.node.label,
        file_path: context.node.file_path,
        risk: context.risk,
        dependents: context.dependent_count,
        deps: context.deps.map(d => ({ id: d.to_id, type: d.edge_type, node_type: d.node_type })),
        backlinks: context.backlinks.map(b => ({ id: b.id, type: b.type, edge_type: b.edge_type, distance: b.distance })),
        sessions: context.sessions.map(s => ({ id: s.session_id, type: s.edge_type })),
        errors: context.errors.map(e => ({ id: e.error_id, label: e.label })),
        issues: context.issues.map(i => ({ id: i.issue_id, label: i.label })),
        lessons: context.lessons.map(l => ({ id: l.lesson_id, label: l.label }))
      }, null, 2));
      db.close();
      return;
    }

    console.log(`\n## Pre-edit Check: ${context.node.id}\n`);

    if (context.deps.length > 0) {
      console.log(`### Uses (${context.deps.length}):`);
      for (const d of context.deps.slice(0, 10)) {
        console.log(`  → ${d.to_id} [${d.edge_type}]${d.node_type ? ` (${d.node_type})` : ""}`);
      }
      if (context.deps.length > 10) console.log(`  ... and ${context.deps.length - 10} more`);
      console.log();
    }

    const directDeps = context.backlinks.filter(b => b.distance === 1);
    if (directDeps.length > 0) {
      console.log(`### Used by (${directDeps.length}):`);
      for (const b of directDeps.slice(0, 10)) {
        console.log(`  ← ${b.id} [${b.edge_type}]${b.type ? ` (${b.type})` : ""}`);
      }
      if (directDeps.length > 10) console.log(`  ... and ${directDeps.length - 10} more`);
      console.log();
    }

    if (depth > 1) {
      const transitive = context.backlinks.filter(b => b.distance > 1);
      if (transitive.length > 0) {
        console.log(`### Transitive impact (${transitive.length} at depth ${depth}):`);
        for (const b of transitive.slice(0, 10)) {
          console.log(`  ← ${b.id} [${b.edge_type}] (depth ${b.distance})`);
        }
        if (transitive.length > 10) console.log(`  ... and ${transitive.length - 10} more`);
        console.log();
      }
    }

    if (context.sessions.length > 0) {
      console.log(`### Related sessions (${context.sessions.length}):`);
      for (const s of context.sessions.slice(0, 5)) {
        console.log(`  - ${s.session_id} [${s.edge_type}]`);
      }
      if (context.sessions.length > 5) console.log(`  ... and ${context.sessions.length - 5} more`);
      console.log();
    }

    if (context.errors.length > 0) {
      console.log(`### Errors affecting this file (${context.errors.length}):`);
      for (const e of context.errors.slice(0, 5)) {
        console.log(`  ⚠️  ${e.label}`);
      }
      console.log();
    }

    if (context.issues.length > 0) {
      console.log(`### Issues affecting this file (${context.issues.length}):`);
      for (const i of context.issues.slice(0, 5)) {
        console.log(`  ⚠️  ${i.label}`);
      }
      console.log();
    }

    if (context.lessons.length > 0) {
      console.log(`### Related lessons (${context.lessons.length}):`);
      for (const l of context.lessons.slice(0, 5)) {
        console.log(`  📚 ${l.label}`);
      }
      if (context.lessons.length > 5) console.log(`  ... and ${context.lessons.length - 5} more`);
      console.log();
    }

    console.log(`⚠️  Risk: ${context.risk} (${context.dependent_count} direct dependents)`);

    db.close();
  }
}
