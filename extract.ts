import { GraphDB } from "./db.ts";
import { extract } from "./extractors/generic.ts";
import { extractMemory } from "./extractors/memory.ts";
import { extractGitChanges } from "./extractors/git.ts";
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

  const pendingNodes: any[] = [];
  const pendingEdges: any[] = [];
  const pendingConcepts: any[] = [];
  const BATCH_SIZE = 500;

  const flushBatch = () => {
    if (pendingNodes.length > 0) {
      db.insertNodesBatch(pendingNodes);
      pendingNodes.length = 0;
    }
    if (pendingEdges.length > 0) {
      db.insertEdgesBatch(pendingEdges);
      pendingEdges.length = 0;
    }
    if (pendingConcepts.length > 0) {
      db.insertConceptsBatch(pendingConcepts);
      pendingConcepts.length = 0;
    }
  };

  const existingHashCache = new Map<string, string>();

  if (incremental) {
    const allNodes = db.getAllNodesMinimal();
    for (const n of allNodes) {
      if (n.content_hash) existingHashCache.set(n.id, n.content_hash);
    }
  }

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
          const existingHash = existingHashCache.get(relativePath);
          if (existingHash && existingHash === contentHash) {
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
          pendingNodes.push(node);
        }
        for (const edge of result.edges) {
          pendingEdges.push(edge);
        }
        if (result.concepts) {
          for (const concept of result.concepts) {
            pendingConcepts.push(concept);
          }
        }

        if (pendingNodes.length >= BATCH_SIZE) {
          flushBatch();
        }
      } catch {
      }
    }
  }

  flushBatch();

  if (incremental) {
    console.log(`Incremental: scanned ${scannedCount}, skipped ${skippedCount} unchanged`);
  } else {
    console.log(`Scanned ${scannedCount} files`);
  }

  const usesInputEdges = db.getUsesInputEdges();
  const fileToInputs = new Map<string, string[]>();
  for (const e of usesInputEdges) {
    if (e.from_id.endsWith(".ts") || e.from_id.endsWith(".js") || e.from_id.endsWith(".py") || e.from_id.endsWith(".rs") || e.from_id.endsWith(".go") || e.from_id.endsWith(".nix")) {
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

  const sharedDepNodes: any[] = [];
  const sharedDepEdges: any[] = [];
  for (const [input, files] of sharedDeps) {
    if (files.length >= 2) {
      const hubId = `_shared_dep:${input}`;
      sharedDepNodes.push({ id: hubId, type: "shared_dependency", label: input });
      for (const file of files) {
        sharedDepEdges.push({ from_id: file, to_id: hubId, type: "shares_dep", confidence: "inferred" });
      }
    }
  }

  if (sharedDepNodes.length > 0) {
    db.insertNodesBatch(sharedDepNodes);
    db.insertEdgesBatch(sharedDepEdges);
  }

  if (config.memory) {
    const memResult = extractMemory(projectPath, config.memory, config.mappings);
    if (memResult.nodes.length > 0 || memResult.edges.length > 0 || memResult.annotations?.length) {
      db.insertNodesBatch(memResult.nodes);
      db.insertEdgesBatch(memResult.edges);
      if (memResult.annotations) {
        for (const ann of memResult.annotations) {
          db.insertAnnotation(ann);
        }
      }
    }
  }

  const gitResult = extractGitChanges(projectPath);
  if (gitResult.nodes.length > 0 || gitResult.edges.length > 0 || gitResult.annotations?.length) {
    db.insertNodesBatch(gitResult.nodes);
    db.insertEdgesBatch(gitResult.edges);
    if (gitResult.annotations) {
      for (const ann of gitResult.annotations) {
        db.insertAnnotation(ann);
      }
    }
  }

  const previousEdges = db.getEdgesWithValidFrom();
  const now = new Date().toISOString();

  const allCurrentEdges = db.getAllEdges();
  const currentEdgeKeys = new Set(
    allCurrentEdges.map((e: any) => `${e.from_id}|${e.to_id}|${e.type}`)
  );

  for (const prev of previousEdges) {
    const key = `${prev.from_id}|${prev.to_id}|${prev.type}`;
    if (!currentEdgeKeys.has(key)) {
      db.stmtCache.get('updateEdgeValidUntil').run(now, prev.id);
    }
  }

  for (const edge of allCurrentEdges) {
    if (!edge.valid_from) {
      db.stmtCache.get('setEdgeValidFrom').run(now, edge.id);
    }
  }
}
