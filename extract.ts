import { GraphDB } from "/home/david/.local/share/omnigraph/db.ts";
import { extract } from "/home/david/.local/share/omnigraph/extractors/generic.ts";

export interface Config {
  scan_dirs: string[];
  ignore_dirs: string[];
  extensions: string[];
}

function shouldIgnore(filePath: string, ignoreDirs: string[]): boolean {
  const parts = filePath.split("/");
  return parts.some(p => ignoreDirs.includes(p));
}

function hasExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some(ext => filePath.endsWith(ext));
}

export function loadConfig(projectPath: string): Config {
  const fs = require("node:fs");
  const path = require("node:path");
  const configPath = path.join(projectPath, "omnigraph.jsonc");
  const defaultPath = "/home/david/.local/share/omnigraph/config.default.jsonc";

  let config: Config;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const cleaned = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    config = JSON.parse(cleaned);
  } catch {
    const content = fs.readFileSync(defaultPath, "utf-8");
    const cleaned = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    config = JSON.parse(cleaned);
  }
  return config;
}

export function scanAndExtract(projectPath: string, db: GraphDB): void {
  const fs = require("node:fs");
  const path = require("node:path");
  const config = loadConfig(projectPath);

  for (const scanDir of config.scan_dirs) {
    const fullDir = path.resolve(projectPath, scanDir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir, { recursive: true }) as string[];
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const relativePath = path.relative(projectPath, filePath);

      if (fs.statSync(filePath).isDirectory()) continue;
      if (shouldIgnore(relativePath, config.ignore_dirs)) continue;
      if (!hasExtension(filePath, config.extensions)) continue;

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const result = extract(content, relativePath);

        for (const node of result.nodes) {
          db.insertNode(node);
        }
        for (const edge of result.edges) {
          db.insertEdge(edge);
        }
      } catch (e) {
        // Skip fichiers binaires ou illisibles
      }
    }
  }
}
