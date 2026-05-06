import { GraphDB } from "./db.ts";
import { extract } from "./extractors/generic.ts";
import { extractMemory } from "./extractors/memory.ts";
import { initTreeSitter, extractWithTreeSitter, isTreeSitterReady, buildFunctionRegistry, FunctionRegistry } from "./extractors/tree-sitter.ts";
import * as fs from "node:fs";
import * as path from "node:path";

export interface Config {
  scan_dirs: string[];
  ignore_dirs: string[];
  ignore_files?: string[];
  extensions: string[];
  memory?: {
    sessions_dir: string;
    lessons_dir: string;
    skills_dir: string;
  };
  mappings?: {
    concepts?: Record<string, string>;
    programs?: Record<string, string>;
    auto_discover?: {
      dirs?: string[];
      extensions?: string[];
    };
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

function shouldIgnoreFile(filePath: string, ignoreFiles: string[]): boolean {
  const base = filePath.split("/").pop() || "";
  return ignoreFiles.some(pattern => {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(base);
    }
    return base === pattern;
  });
}

export function loadConfig(projectPath: string): Config {
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

function walkDir(dir: string, ignoreDirs: string[], baseDir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    if (shouldIgnore(relativePath, ignoreDirs)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, ignoreDirs, baseDir));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export async function scanAndExtract(projectPath: string, db: GraphDB, incremental = false): Promise<void> {
  const config = loadConfig(projectPath);

  try {
    await initTreeSitter();
  } catch (e) {
    console.log("Tree-sitter not available, using regex fallback");
  }

  let knownFunctions: FunctionRegistry | undefined;
  if (isTreeSitterReady()) {
    knownFunctions = await buildFunctionRegistry(projectPath);
  }

  let skippedCount = 0;
  let scannedCount = 0;

  for (const scanDir of config.scan_dirs) {
    const fullDir = path.resolve(projectPath, scanDir);
    if (!fs.existsSync(fullDir)) continue;

    const files = walkDir(fullDir, config.ignore_dirs, projectPath);
    for (const filePath of files) {
      const relativePath = path.relative(projectPath, filePath);

      if (shouldIgnoreFile(relativePath, config.ignore_files || [])) continue;
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
          const tsResult = await extractWithTreeSitter(content, relativePath, knownFunctions);
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
        if (result.concepts) {
          for (const concept of result.concepts) {
            db.insertConcept(concept);
          }
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

  const allNodes = db.getAllNodes();
  const allEdges = db.getAllEdges();
  const fileToInputs = new Map<string, string[]>();
  for (const e of allEdges) {
    if (e.type === "uses_input" && (e.from_id.endsWith(".ts") || e.from_id.endsWith(".js") || e.from_id.endsWith(".py") || e.from_id.endsWith(".rs") || e.from_id.endsWith(".go") || e.from_id.endsWith(".nix"))) {
      if (!fileToInputs.has(e.from_id)) fileToInputs.set(e.from_id, []);
      fileToInputs.get(e.from_id)!.push(e.to_id);
    }
  }

  const sharedDeps = new Map<string, string[]>();
  for (const [file, inputs] of fileToInputs) {
    for (const input of inputs) {
      if (!sharedDeps.has(input)) sharedDeps.set(input, []);
      sharedDeps.get(input)!.push(file);
    }
  }

  for (const [input, files] of sharedDeps) {
    if (files.length >= 2) {
      const hubId = `_shared_dep:${input}`;
      db.insertNode({ id: hubId, type: "shared_dependency", label: input });
      for (const file of files) {
        db.insertEdge({ from_id: file, to_id: hubId, type: "shares_dep", confidence: "inferred" });
      }
    }
  }

  if (config.memory) {
    const memResult = extractMemory(projectPath, config.memory, config.mappings);
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
