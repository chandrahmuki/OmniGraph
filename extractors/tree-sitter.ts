import { ExtractedNode, ExtractedEdge, ExtractResult } from "./generic.ts";

const fs = require("node:fs");
const path = require("node:path");

const GRAMMARS_DIR = path.join(import.meta.dirname || __dirname, "../grammars");

const EXT_TO_GRAMMAR: Record<string, string> = {
  ".nix": "tree-sitter-nix",
  ".ts": "tree-sitter-typescript",
  ".tsx": "tree-sitter-typescript",
  ".js": "tree-sitter-javascript",
  ".py": "tree-sitter-python",
  ".rs": "tree-sitter-rust",
  ".go": "tree-sitter-go",
  ".c": "tree-sitter-c",
  ".h": "tree-sitter-c",
  ".cpp": "tree-sitter-cpp",
  ".hpp": "tree-sitter-cpp",
};

interface LangCache {
  parser: any;
  lang: any;
  ready: boolean;
}

const langCache: Map<string, LangCache> = new Map();

async function initParser(): Promise<any> {
  const { Parser } = require("web-tree-sitter");
  await Parser.init();
  return Parser;
}

async function getLang(grammarName: string): Promise<any | null> {
  if (langCache.has(grammarName)) {
    const cached = langCache.get(grammarName)!;
    if (cached.ready) return cached.lang;
    return null;
  }

  const wasmPath = path.join(GRAMMARS_DIR, `${grammarName}.wasm`);
  if (!fs.existsSync(wasmPath)) {
    langCache.set(grammarName, { parser: null, lang: null, ready: false });
    return null;
  }

  try {
    const wasm = fs.readFileSync(wasmPath);
    const lang = await LanguageClass.load(new Uint8Array(wasm));
    langCache.set(grammarName, { parser: null, lang, ready: true });
    return lang;
  } catch {
    langCache.set(grammarName, { parser: null, lang: null, ready: false });
    return null;
  }
}

function resolveRelativePath(fromFile: string, importPath: string): string {
  if (importPath.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    const parts = (dir + "/" + importPath).split("/");
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === "..") resolved.pop();
      else if (p !== "." && p !== "") resolved.push(p);
    }
    return resolved.join("/");
  }
  return importPath;
}

interface WalkResult {
  paths: { text: string; row: number }[];
  selects: { text: string; row: number }[];
  applies: { text: string; row: number }[];
  strings: { text: string; row: number }[];
  assigns: { text: string; row: number }[];
  attrPaths: { text: string; row: number }[];
}

function walkTree(node: any, result: WalkResult): void {
  if (node.type === "path_expression" || node.type === "path_fragment") {
    result.paths.push({ text: node.text, row: node.startPosition.row });
  }
  if (node.type === "select_expression") {
    result.selects.push({ text: node.text, row: node.startPosition.row });
  }
  if (node.type === "apply_expression") {
    result.applies.push({ text: node.text, row: node.startPosition.row });
  }
  if (node.type === "string_expression") {
    result.strings.push({ text: node.text, row: node.startPosition.row });
  }
  if (node.type === "assignment_expression" || node.type === "binding") {
    result.assigns.push({ text: node.text, row: node.startPosition.row });
  }
  if (node.type === "attribute_path" || node.type === "attrpath") {
    result.attrPaths.push({ text: node.text, row: node.startPosition.row });
  }
  for (let i = 0; i < node.childCount; i++) {
    walkTree(node.child(i), result);
  }
}

function extractNix(
  content: string,
  filePath: string,
  lang: any,
  parser: any,
): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(id: string, type: string, label: string, fp?: string) {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label, file_path: fp || id, line_number: 0 });
    }
  }

  addNode(filePath, "file", filePath.split("/").pop() || filePath, filePath);

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const result: WalkResult = { paths: [], selects: [], applies: [], strings: [], assigns: [], attrPaths: [] };
  walkTree(tree.rootNode, result);

  for (const p of result.paths) {
    if (p.text.startsWith(".")) {
      let resolved = resolveRelativePath(filePath, p.text);
      if (resolved === "modules" || resolved.endsWith("/modules")) {
        resolved = resolved.replace(/\/?modules$/, "/modules/default.nix").replace(/^\//, "");
      }
      addNode(resolved, "file", resolved.split("/").pop() || resolved, resolved);
      edges.push({ from_id: filePath, to_id: resolved, type: "imports", confidence: "auto" });
    }
  }

  for (const a of result.applies) {
    const importMatch = a.text.match(/^import\s+(\S+)/);
    if (importMatch) {
      const rawPath = importMatch[1];
      if (rawPath.startsWith(".")) {
        const resolved = resolveRelativePath(filePath, rawPath);
        addNode(resolved, "file", resolved.split("/").pop() || resolved, resolved);
        edges.push({ from_id: filePath, to_id: resolved, type: "imports", confidence: "auto" });
      }
    }
  }

  for (const s of result.selects) {
    const text = s.text;

    if (text.startsWith("inputs.")) {
      const inputName = text.split(".")[1];
      if (inputName) {
        const inputId = `inputs.${inputName}`;
        addNode(inputId, "input", inputName);
        edges.push({ from_id: filePath, to_id: inputId, type: "uses_input", confidence: "auto" });
      }
    }

    if (text.includes("sops.secrets.")) {
      const secretMatch = text.match(/sops\.secrets\.(\w+)/);
      if (secretMatch) {
        const secretId = `secrets/secrets.yaml`;
        addNode(secretId, "file", "secrets.yaml", secretId);
        edges.push({ from_id: filePath, to_id: secretId, type: "references_secrets", confidence: "auto" });
      }
    }

    if (text.match(/\b(lib|colors)\./) || text.includes("colors.nix")) {
      if (text.includes("colors")) {
        addNode("lib/colors.nix", "file", "colors.nix", "lib/colors.nix");
        edges.push({ from_id: filePath, to_id: "lib/colors.nix", type: "uses_colors", confidence: "auto" });
      }
    }
  }

  for (const s of result.strings) {
    const text = s.text;

    const secretsMatch = text.match(/(secrets\/[\w.-]+\.yaml)/);
    if (secretsMatch) {
      addNode(secretsMatch[1], "file", secretsMatch[1].split("/").pop() || secretsMatch[1], secretsMatch[1]);
      edges.push({ from_id: filePath, to_id: secretsMatch[1], type: "references_secrets", confidence: "auto" });
    }

    const genMatch = text.match(/(generated\/[\w.-]+\.(json|toml|yaml|conf))/);
    if (genMatch) {
      addNode(genMatch[1], "file", genMatch[1].split("/").pop() || genMatch[1], genMatch[1]);
      edges.push({ from_id: filePath, to_id: genMatch[1], type: "references_generated", confidence: "auto" });
    }

    const sopsMatch = text.match(/sops[\/\\]([\w_-]+)/);
    if (sopsMatch) {
      addNode("secrets/secrets.yaml", "file", "secrets.yaml", "secrets/secrets.yaml");
      edges.push({ from_id: filePath, to_id: "secrets/secrets.yaml", type: "references_secrets", confidence: "auto" });
    }

    const nvimMatch = text.match(/nixos-config\/(nvim\/)/);
    if (nvimMatch) {
      addNode(nvimMatch[1], "file", nvimMatch[1], nvimMatch[1]);
      edges.push({ from_id: filePath, to_id: nvimMatch[1], type: "references_config", confidence: "auto" });
    }

    const agentMatch = text.match(/(\.agent\/[\w.-]+\.json)/);
    if (agentMatch) {
      addNode(agentMatch[1], "file", agentMatch[1].split("/").pop() || agentMatch[1], agentMatch[1]);
      edges.push({ from_id: filePath, to_id: agentMatch[1], type: "references_config", confidence: "auto" });
    }
  }

  const PROVISION_PATTERN = /^(?:programs|services|boot|hardware|networking|security|virtualisation|systemd)\.(\w[\w-]*)/;
  const CONSUME_PATTERN = /^config\.(?!lib\b)(\w[\w-]*)/;

  for (const sel of result.selects) {
    const provMatch = sel.text.match(PROVISION_PATTERN);
    if (provMatch) {
      const optionId = `option.${sel.text.split(".").slice(0, 2).join(".")}`;
      addNode(optionId, "option", sel.text.split(".").slice(0, 2).join("."), undefined as any);
      edges.push({ from_id: filePath, to_id: optionId, type: "provides_option", confidence: "auto" });
    }

    const consumeMatch = sel.text.match(CONSUME_PATTERN);
    if (consumeMatch) {
      const optionId = `option.${consumeMatch[1]}`;
      addNode(optionId, "option", consumeMatch[1], undefined as any);
      edges.push({ from_id: filePath, to_id: optionId, type: "consumes_option", confidence: "auto" });
    }
  }

  for (const ap of result.attrPaths) {
    const text = ap.text;
    const provMatch = text.match(PROVISION_PATTERN);
    if (provMatch) {
      const optionId = `option.${text.split(".").slice(0, 2).join(".")}`;
      addNode(optionId, "option", text.split(".").slice(0, 2).join("."), undefined as any);
      edges.push({ from_id: filePath, to_id: optionId, type: "provides_option", confidence: "auto" });
    }
  }

  const PKG_PATTERN = /\$\{pkgs\.(\w[\w-]*)\}/g;
  for (const s of result.strings) {
    let pkgMatch: RegExpExecArray | null;
    while ((pkgMatch = PKG_PATTERN.exec(s.text)) !== null) {
      const pkgId = `pkg.${pkgMatch[1]}`;
      addNode(pkgId, "option", pkgMatch[1], undefined as any);
      edges.push({ from_id: filePath, to_id: pkgId, type: "provides_option", confidence: "auto" });
    }
  }

  const HOME_PKGS_PATTERN = /home\.packages\s*=\s*.*?(\w[\w-]*)/g;
  for (const line of content.split("\n")) {
    let hpMatch: RegExpExecArray | null;
    while ((hpMatch = HOME_PKGS_PATTERN.exec(line)) !== null) {
      const word = hpMatch[1];
      if (word !== "with" && word !== "pkgs") {
        const pkgId = `pkg.${word}`;
        addNode(pkgId, "option", word, undefined as any);
        edges.push({ from_id: filePath, to_id: pkgId, type: "provides_option", confidence: "auto" });
      }
    }
  }

  tree.delete();
  return { nodes, edges };
}

let ParserClass: any = null;
let LanguageClass: any = null;
let parserReady = false;

export async function initTreeSitter(): Promise<void> {
  if (parserReady) return;
  const mod = require("web-tree-sitter");
  await mod.Parser.init();
  ParserClass = mod.Parser;
  LanguageClass = mod.Language;
  parserReady = true;
}

export function isTreeSitterReady(): boolean {
  return parserReady;
}

export async function extractWithTreeSitter(
  content: string,
  filePath: string,
): Promise<ExtractResult | null> {
  if (!parserReady) return null;

  const ext = "." + filePath.split(".").pop();
  const grammarName = EXT_TO_GRAMMAR[ext];
  if (!grammarName) return null;

  const lang = await getLang(grammarName);
  if (!lang) return null;

  if (ext === ".nix") {
    const parser = new ParserClass();
    return extractNix(content, filePath, lang, parser);
  }

  return null;
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXT_TO_GRAMMAR).filter(ext => {
    const grammarName = EXT_TO_GRAMMAR[ext];
    return fs.existsSync(path.join(GRAMMARS_DIR, `${grammarName}.wasm`));
  });
}
