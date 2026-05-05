import { GraphDB } from "./db.ts";
import { extract } from "./extractors/generic.ts";
import { extractMemory } from "./extractors/memory.ts";
import { initTreeSitter, extractWithTreeSitter, isTreeSitterReady } from "./extractors/tree-sitter.ts";

export interface Config {
  scan_dirs: string[];
  ignore_dirs: string[];
  extensions: string[];
  memory?: {
    sessions_dir: string;
    lessons_dir: string;
    skills_dir: string;
  };
}

export function computeHash(content: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(content);
  return hasher.digest("hex").slice(0, 16);
}

function shouldIgnore(filePath: string, ignoreDirs: string[]): boolean {
  const parts = filePath.split("/");
  return ignoreDirs.some(dir => {
    const dirParts = dir.split("/");
    for (let i = 0; i <= parts.length - dirParts.length; i++) {
      if (dirParts.every((dp, j) => parts[i + j] === dp)) return true;
    }
    return false;
  });
}

function hasExtension(filePath: string, extensions: string[]): boolean {
  return extensions.some(ext => filePath.endsWith(ext));
}

export function loadConfig(projectPath: string): Config {
  const fs = require("node:fs");
  const path = require("node:path");
  const configPath = path.join(projectPath, "omnigraph.jsonc");
  const defaultPath = path.join(import.meta.dirname || __dirname, "config.default.jsonc");

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

export async function scanAndExtract(projectPath: string, db: GraphDB, incremental = false): Promise<void> {
  const fs = require("node:fs");
  const path = require("node:path");
  const config = loadConfig(projectPath);

  try {
    await initTreeSitter();
    console.log("Tree-sitter initialized (Nix grammar loaded)");
  } catch (e) {
    console.log("Tree-sitter not available, using regex fallback");
  }

  let skippedCount = 0;
  let scannedCount = 0;

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
        const contentHash = computeHash(content);

        if (incremental) {
          const existingNode = db.getNodeById(relativePath);
          if (existingNode && existingNode.content_hash === contentHash) {
            skippedCount++;
            continue;
          }
        }

        scannedCount++;

        let result;
        if (isTreeSitterReady()) {
          const tsResult = await extractWithTreeSitter(content, relativePath);
          if (tsResult) {
            result = tsResult;
          } else {
            result = extract(content, relativePath);
          }
        } else {
          result = extract(content, relativePath);
        }

        result.nodes = result.nodes.map(n => {
          if (n.id === relativePath) {
            return { ...n, content_hash: contentHash };
          }
          return n;
        });

        if (incremental) {
          db.deleteEdgesFromNode(relativePath);
          db.deleteNode(relativePath);
        }

        for (const node of result.nodes) {
          db.insertNode(node);
        }
        for (const edge of result.edges) {
          db.insertEdge(edge);
        }
      } catch {
      }
    }
  }

  if (incremental) {
    console.log(`Incremental: scanned ${scannedCount}, skipped ${skippedCount} unchanged`);
  } else {
    console.log(`Scanned ${scannedCount} files`);
  }

  if (config.memory) {
    const memResult = extractMemory(projectPath, config.memory);
    for (const node of memResult.nodes) {
      db.insertNode(node);
    }
    for (const edge of memResult.edges) {
      db.insertEdge(edge);
    }
    if (memResult.annotations) {
      for (const ann of memResult.annotations) {
        db.insertAnnotation(ann);
      }
    }
  }
}
