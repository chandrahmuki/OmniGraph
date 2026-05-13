import path from "node:path";
import fs from "node:fs";

export class SessionResumeCommand {
  name = "session-resume";
  description = "Show last session summary";

  async run(): Promise<void> {
    const projectPath = process.cwd();
    const sessionsDir = path.join(projectPath, "memory/sessions");
    
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
      console.log("No sessions found.");
      return;
    }
    
    const summaryPath = path.join(sessionsDir, latestSessionDir, "summary.md");
    const summaryContent = fs.readFileSync(summaryPath, "utf-8");
    
    console.log(`\n## Session: ${latestSessionDir}`);
    
    const generatedMatch = summaryContent.match(/Generated:\s*(.+)/);
    if (generatedMatch) {
      console.log(`Generated: ${generatedMatch[1].trim()}`);
    }
    console.log();
    
    const filesSection = summaryContent.match(/## Files Modified[\s\S]*?(?=^## )/m);
    let modifiedFiles: string[] = [];
    if (filesSection) {
      const fileLines = filesSection[0].split('\n')
        .filter(line => line.trim().startsWith('-'));
      modifiedFiles = fileLines.map(line => {
        const m = line.match(/-\s*\[.*?\]\s*(.+)/) || line.match(/-\s*([^\s(]+)/);
        return m ? m[1].trim() : null;
      }).filter(Boolean) as string[];
      console.log(`## Files Modified (${modifiedFiles.length})\n`);
      for (const f of modifiedFiles) {
        console.log(`  - ${f}`);
      }
      console.log();
    }
  }
}
