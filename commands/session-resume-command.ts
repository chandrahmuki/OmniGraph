import { GraphDB } from "../db.ts";
import path from "node:path";
import fs from "node:fs";

export class SessionResumeCommand {
  name = "session-resume";
  description = "Show last session summary and context check";

  async run(projectPath: string, dbPath: string): Promise<void> {
    const sessionsDir = path.join(projectPath, "memory/sessions");
    
    // First check filesystem for latest session (more reliable than DB)
    let latestSessionDir: string | null = null;
    let latestMtimeMs = 0;
    
    if (fs.existsSync(sessionsDir)) {
      const dirs = fs.readdirSync(sessionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .filter(d => /^\d{4}-\d{2}-\d{2}_/.test(d.name));
      
      for (const dir of dirs) {
        const summaryPath = path.join(sessionsDir, dir.name, "summary.md");
        try {
          const stat = fs.statSync(summaryPath);
          if (stat.mtimeMs > latestMtimeMs) {
            latestMtimeMs = stat.mtimeMs;
            latestSessionDir = dir.name;
          }
        } catch {}
      }
    }
    
    if (!latestSessionDir) {
      console.log("No sessions found. Create a session with 'omnigraph save' first.");
      return;
    }
    
    const summaryPath = path.join(sessionsDir, latestSessionDir, "summary.md");
    const summaryContent = fs.readFileSync(summaryPath, "utf-8");
    
    console.log(`\n## Session Resume: ${latestSessionDir}`);
    
    // Parse generated time from summary
    const generatedMatch = summaryContent.match(/Generated:\s*(.+)/);
    if (generatedMatch) {
      console.log(`Generated: ${generatedMatch[1].trim()}`);
    }
    console.log();
    
    // Parse files modified from summary
    const filesSection = summaryContent.match(/## Files Modified[\s\S]*?(?=^## )/m);
    let modifiedFiles: string[] = [];
    if (filesSection) {
      const fileLines = filesSection[0].split('\n')
        .filter(line => line.trim().startsWith('-'));
      modifiedFiles = fileLines.map(line => {
        const m = line.match(/-\s*\[.*?\]\s*(.+)/);
        return m ? m[1].trim() : null;
      }).filter(Boolean) as string[];
      console.log(`## Files Modified (${modifiedFiles.length})\n`);
      for (const f of modifiedFiles) {
        console.log(`  - ${f}`);
      }
      console.log();
    } else {
      console.log("No files modified in this session.\n");
    }
    
    // Context check using DB if available
    if (fs.existsSync(dbPath)) {
      const db = new GraphDB(dbPath);
      const allEdges = db.getAllEdges();
      const allNodes = db.getAllNodes();
      const nodeMap = new Map(allNodes.map((n: any) => [n.id, n]));
      
      console.log("## Context Check\n");
      
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
    }
  }
}
