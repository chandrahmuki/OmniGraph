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

interface TsWalkResult {
  functions: { name: string; row: number; text: string; parent?: string }[];
  classes: { name: string; row: number; methods: string[] }[];
  interfaces: { name: string; row: number }[];
  typeAliases: { name: string; row: number }[];
  imports: { source: string; names: string[]; row: number; isRelative: boolean }[];
  exports: { names: string[]; row: number }[];
  calls: { callee: string; row: number }[];
}

function walkTsTree(node: any, result: TsWalkResult, parentClass?: string): void {
  if (node.type === "function_declaration" || node.type === "function") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, text: node.text.slice(0, 80), parent: parentClass });
    }
  }

  if (node.type === "method_definition" || node.type === "method") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, text: node.text.slice(0, 80), parent: parentClass });
    }
  }

  if (node.type === "class_declaration" || node.type === "class") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const methods: string[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === "method_definition" || child.type === "method" || child.type === "class_body") {
          for (let j = 0; j < child.childCount; j++) {
            const grandchild = child.child(j);
            if (grandchild.type === "method_definition" || grandchild.type === "method") {
              const mName = grandchild.childForFieldName("name");
              if (mName) methods.push(mName.text);
            }
          }
        }
      }
      result.classes.push({ name: nameNode.text, row: node.startPosition.row, methods });
    }
  }

  if (node.type === "interface_declaration") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.interfaces.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "type_alias_declaration" || node.type === "type_alias") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.typeAliases.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "import_statement" || node.type === "import_declaration") {
    const sourceNode = node.childForFieldName("source");
    if (sourceNode) {
      const source = sourceNode.text.replace(/['"]/g, "");
      const names: string[] = [];
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === "import_clause" || child.type === "named_imports") {
          for (let j = 0; j < child.childCount; j++) {
            const gc = child.child(j);
            if (gc.type === "identifier" || gc.type === "import_specifier") {
              const idName = gc.childForFieldName("name") || gc;
              if (idName && idName.text) names.push(idName.text);
            }
          }
        }
        if (child.type === "identifier") {
          names.push(child.text);
        }
      }
      result.imports.push({ source, names, row: node.startPosition.row, isRelative: source.startsWith(".") });
    }
  }

  if (node.type === "export_statement" || node.type === "export_declaration") {
    const names: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === "export_clause") {
        for (let j = 0; j < child.childCount; j++) {
          const gc = child.child(j);
          if (gc.type === "export_specifier") {
            const nameNode = gc.childForFieldName("name") || gc;
            if (nameNode && nameNode.text) names.push(nameNode.text);
          }
        }
      }
      if (child.type === "function_declaration" || child.type === "class_declaration") {
        const nameNode = child.childForFieldName("name");
        if (nameNode) names.push(nameNode.text);
      }
    }
    if (names.length > 0) {
      result.exports.push({ names, row: node.startPosition.row });
    }
  }

  if (node.type === "call_expression") {
    const funcNode = node.childForFieldName("function") || node.child(0);
    if (funcNode && funcNode.type === "identifier") {
      result.calls.push({ callee: funcNode.text, row: node.startPosition.row });
    }
    if (funcNode && funcNode.type === "member_expression") {
      result.calls.push({ callee: funcNode.text, row: node.startPosition.row });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const childParent = (node.type === "class_declaration" || node.type === "class") && child.type === "class_body"
      ? parentClass || (node.childForFieldName("name")?.text)
      : parentClass;
    walkTsTree(child, result, childParent);
  }
}

function extractTsJs(
  content: string,
  filePath: string,
  lang: any,
  parser: any,
): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(id: string, type: string, label: string, fp?: string, line?: number) {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label, file_path: fp || filePath, line_number: line || 0 });
    }
  }

  addNode(filePath, "file", filePath.split("/").pop() || filePath, filePath);

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const result: TsWalkResult = {
    functions: [], classes: [], interfaces: [], typeAliases: [],
    imports: [], exports: [], calls: [],
  };
  walkTsTree(tree.rootNode, result);

  for (const fn of result.functions) {
    const nodeId = fn.parent ? `${filePath}:${fn.parent}.${fn.name}` : `${filePath}:${fn.name}`;
    addNode(nodeId, "function", fn.name, filePath, fn.row + 1);
    edges.push({ from_id: filePath, to_id: nodeId, type: "defines", confidence: "auto" });
    if (fn.parent) {
      const classId = `${filePath}:${fn.parent}`;
      addNode(classId, "class", fn.parent, filePath, 0);
      edges.push({ from_id: classId, to_id: nodeId, type: "defines", confidence: "auto" });
    }
  }

  for (const cls of result.classes) {
    const classId = `${filePath}:${cls.name}`;
    addNode(classId, "class", cls.name, filePath, cls.row + 1);
    edges.push({ from_id: filePath, to_id: classId, type: "defines", confidence: "auto" });
    for (const method of cls.methods) {
      const methodId = `${filePath}:${cls.name}.${method}`;
      addNode(methodId, "function", method, filePath, 0);
      edges.push({ from_id: classId, to_id: methodId, type: "defines", confidence: "auto" });
    }
  }

  for (const iface of result.interfaces) {
    const ifaceId = `${filePath}:${iface.name}`;
    addNode(ifaceId, "interface", iface.name, filePath, iface.row + 1);
    edges.push({ from_id: filePath, to_id: ifaceId, type: "defines", confidence: "auto" });
  }

  for (const ta of result.typeAliases) {
    const taId = `${filePath}:${ta.name}`;
    addNode(taId, "concept", ta.name, filePath, ta.row + 1);
    edges.push({ from_id: filePath, to_id: taId, type: "defines", confidence: "auto" });
  }

  for (const imp of result.imports) {
    if (imp.isRelative) {
      const resolved = resolveRelativePath(filePath, imp.source);
      const resolvedWithExt = resolved.endsWith(".ts") ? resolved : resolved + ".ts";
      addNode(resolvedWithExt, "file", resolvedWithExt.split("/").pop() || resolvedWithExt, resolvedWithExt);
      edges.push({ from_id: filePath, to_id: resolvedWithExt, type: "imports", confidence: "auto" });
      for (const name of imp.names) {
        const nameId = `${resolvedWithExt}:${name}`;
        addNode(nameId, "function", name, resolvedWithExt);
        edges.push({ from_id: filePath, to_id: nameId, type: "uses_input", confidence: "auto" });
      }
    } else {
      const pkgName = imp.source.startsWith("@") ? imp.source.split("/").slice(0, 2).join("/") : imp.source.split("/")[0];
      const pkgId = `pkg.${pkgName}`;
      addNode(pkgId, "input", pkgName);
      edges.push({ from_id: filePath, to_id: pkgId, type: "uses_input", confidence: "auto" });
    }
  }

  for (const call of result.calls) {
    const callId = `${filePath}:call:${call.callee}:${call.row}`;
    addNode(callId, "function", `call:${call.callee}`, filePath, call.row + 1);
    edges.push({ from_id: filePath, to_id: callId, type: "calls", confidence: "auto" });
  }

  const concepts: ExtractedConcept[] = [];
  for (const fn of result.functions) {
    const nodeId = fn.parent ? `${filePath}:${fn.parent}.${fn.name}` : `${filePath}:${fn.name}`;
    concepts.push({ node_id: nodeId, kind: "function", name: fn.name, file_path: filePath, line_number: fn.row + 1, snippet: fn.text });
  }
  for (const cls of result.classes) {
    const classId = `${filePath}:${cls.name}`;
    concepts.push({ node_id: classId, kind: "class", name: cls.name, file_path: filePath, line_number: cls.row + 1 });
  }
  for (const iface of result.interfaces) {
    const ifaceId = `${filePath}:${iface.name}`;
    concepts.push({ node_id: ifaceId, kind: "interface", name: iface.name, file_path: filePath, line_number: iface.row + 1 });
  }
  for (const ta of result.typeAliases) {
    const taId = `${filePath}:${ta.name}`;
    concepts.push({ node_id: taId, kind: "type", name: ta.name, file_path: filePath, line_number: ta.row + 1 });
  }

  tree.delete();
  return { nodes, edges, concepts };
}

interface PyWalkResult {
  functions: { name: string; row: number; text: string; parent?: string }[];
  classes: { name: string; row: number; methods: string[] }[];
  imports: { module: string; names: string[]; row: number; isRelative: boolean }[];
  calls: { callee: string; row: number }[];
}

function walkPyTree(node: any, result: PyWalkResult, parentClass?: string): void {
  if (node.type === "function_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, text: node.text.slice(0, 80), parent: parentClass });
    }
  }

  if (node.type === "class_definition") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      const methods: string[] = [];
      const body = node.childForFieldName("body");
      if (body) {
        for (let i = 0; i < body.childCount; i++) {
          const child = body.child(i);
          if (child.type === "function_definition") {
            const mName = child.childForFieldName("name");
            if (mName) methods.push(mName.text);
          }
        }
      }
      result.classes.push({ name: nameNode.text, row: node.startPosition.row, methods });
    }
  }

  if (node.type === "import_statement") {
    const names: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === "dotted_name" || child.type === "aliased_import") {
        const nameNode = child.childForFieldName("name") || child.child(0);
        if (nameNode) names.push(nameNode.text);
      }
      if (child.type === "identifier") {
        names.push(child.text);
      }
    }
    if (names.length > 0) {
      result.imports.push({ module: names.join("."), names, row: node.startPosition.row, isRelative: false });
    }
  }

  if (node.type === "import_from_statement") {
    const moduleNode = node.childForFieldName("module_name") || node.child(1);
    const module = moduleNode ? moduleNode.text : "";
    const names: string[] = [];
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === "dotted_name" || child.type === "aliased_import" || child.type === "wildcard_import") {
        const nameNode = child.childForFieldName("name") || child.child(0);
        if (nameNode) names.push(nameNode.text);
        if (child.type === "wildcard_import") names.push("*");
      }
      if (child.type === "identifier" && !module) {
        names.push(child.text);
      }
    }
    result.imports.push({ module, names, row: node.startPosition.row, isRelative: module.startsWith(".") });
  }

  if (node.type === "call") {
    const funcNode = node.childForFieldName("function") || node.child(0);
    if (funcNode) {
      result.calls.push({ callee: funcNode.text, row: node.startPosition.row });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const childParent = (node.type === "class_definition") && child.type === "block"
      ? parentClass || (node.childForFieldName("name")?.text)
      : parentClass;
    walkPyTree(child, result, childParent);
  }
}

function extractPython(
  content: string,
  filePath: string,
  lang: any,
  parser: any,
): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(id: string, type: string, label: string, fp?: string, line?: number) {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label, file_path: fp || filePath, line_number: line || 0 });
    }
  }

  addNode(filePath, "file", filePath.split("/").pop() || filePath, filePath);

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const result: PyWalkResult = { functions: [], classes: [], imports: [], calls: [] };
  walkPyTree(tree.rootNode, result);

  for (const fn of result.functions) {
    const nodeId = fn.parent ? `${filePath}:${fn.parent}.${fn.name}` : `${filePath}:${fn.name}`;
    addNode(nodeId, "function", fn.name, filePath, fn.row + 1);
    edges.push({ from_id: filePath, to_id: nodeId, type: "defines", confidence: "auto" });
    if (fn.parent) {
      const classId = `${filePath}:${fn.parent}`;
      addNode(classId, "class", fn.parent, filePath, 0);
      edges.push({ from_id: classId, to_id: nodeId, type: "defines", confidence: "auto" });
    }
  }

  for (const cls of result.classes) {
    const classId = `${filePath}:${cls.name}`;
    addNode(classId, "class", cls.name, filePath, cls.row + 1);
    edges.push({ from_id: filePath, to_id: classId, type: "defines", confidence: "auto" });
    for (const method of cls.methods) {
      const methodId = `${filePath}:${cls.name}.${method}`;
      addNode(methodId, "function", method, filePath, 0);
      edges.push({ from_id: classId, to_id: methodId, type: "defines", confidence: "auto" });
    }
  }

  for (const imp of result.imports) {
    if (imp.isRelative) {
      const resolved = resolveRelativePath(filePath, imp.module);
      const resolvedWithExt = resolved.endsWith(".py") ? resolved : resolved + ".py";
      addNode(resolvedWithExt, "file", resolvedWithExt.split("/").pop() || resolvedWithExt, resolvedWithExt);
      edges.push({ from_id: filePath, to_id: resolvedWithExt, type: "imports", confidence: "auto" });
    } else {
      const pkgName = imp.module.split(".")[0] || imp.names[0];
      if (pkgName && pkgName !== "*") {
        const pkgId = `pkg.${pkgName}`;
        addNode(pkgId, "input", pkgName);
        edges.push({ from_id: filePath, to_id: pkgId, type: "uses_input", confidence: "auto" });
      }
    }
    for (const name of imp.names) {
      if (name === "*") continue;
      const nameId = `${filePath}:import:${name}`;
      addNode(nameId, "function", name, filePath, imp.row + 1);
      edges.push({ from_id: filePath, to_id: nameId, type: "uses_input", confidence: "auto" });
    }
  }

  for (const call of result.calls) {
    const callId = `${filePath}:call:${call.callee}:${call.row}`;
    addNode(callId, "function", `call:${call.callee}`, filePath, call.row + 1);
    edges.push({ from_id: filePath, to_id: callId, type: "calls", confidence: "auto" });
  }

  const concepts: ExtractedConcept[] = [];
  for (const fn of result.functions) {
    const nodeId = fn.parent ? `${filePath}:${fn.parent}.${fn.name}` : `${filePath}:${fn.name}`;
    concepts.push({ node_id: nodeId, kind: "function", name: fn.name, file_path: filePath, line_number: fn.row + 1 });
  }
  for (const cls of result.classes) {
    const classId = `${filePath}:${cls.name}`;
    concepts.push({ node_id: classId, kind: "class", name: cls.name, file_path: filePath, line_number: cls.row + 1 });
  }

  tree.delete();
  return { nodes, edges, concepts };
}

interface RsWalkResult {
  functions: { name: string; row: number; parent?: string }[];
  structs: { name: string; row: number }[];
  enums: { name: string; row: number }[];
  traits: { name: string; row: number }[];
  impls: { target: string; row: number; methods: string[] }[];
  uses: { path: string; row: number }[];
  mods: { name: string; row: number }[];
  calls: { callee: string; row: number }[];
}

function walkRsTree(node: any, result: RsWalkResult, currentImpl?: string): void {
  if (node.type === "function_item") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, parent: currentImpl });
    }
  }

  if (node.type === "struct_item") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.structs.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "enum_item") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.enums.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "trait_item") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.traits.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "impl_item") {
    const typeNode = node.childForFieldName("type");
    const implTarget = typeNode ? typeNode.text : "unknown";
    const methods: string[] = [];
    const body = node.childForFieldName("body");
    if (body) {
      for (let i = 0; i < body.childCount; i++) {
        const child = body.child(i);
        if (child.type === "function_item") {
          const mName = child.childForFieldName("name");
          if (mName) methods.push(mName.text);
        }
      }
    }
    result.impls.push({ target: implTarget, row: node.startPosition.row, methods });
  }

  if (node.type === "use_declaration") {
    const argNode = node.childForFieldName("argument");
    if (argNode) {
      result.uses.push({ path: argNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "mod_item") {
    const nameNode = node.childForFieldName("name");
    if (nameNode) {
      result.mods.push({ name: nameNode.text, row: node.startPosition.row });
    }
  }

  if (node.type === "call_expression") {
    const funcNode = node.childForFieldName("function") || node.child(0);
    if (funcNode) {
      result.calls.push({ callee: funcNode.text, row: node.startPosition.row });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    const childImpl = node.type === "impl_item"
      ? (node.childForFieldName("type")?.text || currentImpl)
      : currentImpl;
    walkRsTree(child, result, childImpl);
  }
}

function extractRust(
  content: string,
  filePath: string,
  lang: any,
  parser: any,
): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(id: string, type: string, label: string, fp?: string, line?: number) {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label, file_path: fp || filePath, line_number: line || 0 });
    }
  }

  addNode(filePath, "file", filePath.split("/").pop() || filePath, filePath);

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const result: RsWalkResult = { functions: [], structs: [], enums: [], traits: [], impls: [], uses: [], mods: [], calls: [] };
  walkRsTree(tree.rootNode, result);

  for (const fn of result.functions) {
    const nodeId = fn.parent ? `${filePath}:${fn.parent}::${fn.name}` : `${filePath}:${fn.name}`;
    addNode(nodeId, "function", fn.name, filePath, fn.row + 1);
    edges.push({ from_id: filePath, to_id: nodeId, type: "defines", confidence: "auto" });
    if (fn.parent) {
      const implId = `${filePath}:${fn.parent}`;
      addNode(implId, "struct", fn.parent, filePath, 0);
      edges.push({ from_id: implId, to_id: nodeId, type: "defines", confidence: "auto" });
    }
  }

  for (const s of result.structs) {
    const structId = `${filePath}:${s.name}`;
    addNode(structId, "struct", s.name, filePath, s.row + 1);
    edges.push({ from_id: filePath, to_id: structId, type: "defines", confidence: "auto" });
  }

  for (const e of result.enums) {
    const enumId = `${filePath}:${e.name}`;
    addNode(enumId, "concept", e.name, filePath, e.row + 1);
    edges.push({ from_id: filePath, to_id: enumId, type: "defines", confidence: "auto" });
  }

  for (const t of result.traits) {
    const traitId = `${filePath}:${t.name}`;
    addNode(traitId, "interface", t.name, filePath, t.row + 1);
    edges.push({ from_id: filePath, to_id: traitId, type: "defines", confidence: "auto" });
  }

  for (const imp of result.impls) {
    const implId = `${filePath}:${imp.target}`;
    addNode(implId, "struct", imp.target, filePath, imp.row + 1);
    edges.push({ from_id: filePath, to_id: implId, type: "defines", confidence: "auto" });
    for (const method of imp.methods) {
      const methodId = `${filePath}:${imp.target}::${method}`;
      addNode(methodId, "function", method, filePath, 0);
      edges.push({ from_id: implId, to_id: methodId, type: "defines", confidence: "auto" });
    }
  }

  for (const u of result.uses) {
    const path = u.path;
    if (path.startsWith("crate::") || path.startsWith("super::") || path.startsWith("self::")) {
      const resolved = path.replace(/^crate::/, "").replace(/^super::/, "").replace(/^self::/, "");
      const resolvedPath = resolved.replace(/::/g, "/");
      const possibleFile = resolvedPath + ".rs";
      addNode(possibleFile, "file", possibleFile.split("/").pop() || possibleFile, possibleFile);
      edges.push({ from_id: filePath, to_id: possibleFile, type: "imports", confidence: "auto" });
    } else {
      const crateName = path.split("::")[0];
      if (crateName && crateName !== "{" && crateName !== "*") {
        const pkgId = `pkg.${crateName}`;
        addNode(pkgId, "input", crateName);
        edges.push({ from_id: filePath, to_id: pkgId, type: "uses_input", confidence: "auto" });
      }
    }
  }

  for (const m of result.mods) {
    const modFile = m.name + ".rs";
    addNode(modFile, "file", modFile, modFile);
    edges.push({ from_id: filePath, to_id: modFile, type: "imports", confidence: "auto" });
  }

  for (const call of result.calls) {
    const callId = `${filePath}:call:${call.callee}:${call.row}`;
    addNode(callId, "function", `call:${call.callee}`, filePath, call.row + 1);
    edges.push({ from_id: filePath, to_id: callId, type: "calls", confidence: "auto" });
  }

  tree.delete();
  return { nodes, edges };
}

interface GoWalkResult {
  functions: { name: string; row: number; receiver?: string }[];
  structs: { name: string; row: number }[];
  interfaces: { name: string; row: number }[];
  imports: { path: string; row: number }[];
  calls: { callee: string; row: number }[];
}

function walkGoTree(node: any, result: GoWalkResult): void {
  if (node.type === "function_declaration") {
    const nameNode = node.childForFieldName("name");
    const receiver = node.childForFieldName("receiver");
    const receiverName = receiver ? receiver.text.replace(/[()]/g, "").trim() : undefined;
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, receiver: receiverName });
    }
  }

  if (node.type === "method_declaration") {
    const nameNode = node.childForFieldName("name");
    const receiver = node.childForFieldName("receiver");
    const receiverName = receiver ? receiver.text.replace(/[()]/g, "").trim() : undefined;
    if (nameNode) {
      result.functions.push({ name: nameNode.text, row: node.startPosition.row, receiver: receiverName });
    }
  }

  if (node.type === "type_declaration") {
    const spec = node.childForFieldName("type") || node.child(1);
    if (spec) {
      const nameNode = spec.childForFieldName("name");
      const typeSpec = spec.childForFieldName("type");
      if (nameNode) {
        if (typeSpec && typeSpec.type === "struct_type") {
          result.structs.push({ name: nameNode.text, row: node.startPosition.row });
        } else if (typeSpec && typeSpec.type === "interface_type") {
          result.interfaces.push({ name: nameNode.text, row: node.startPosition.row });
        }
      }
    }
  }

  if (node.type === "import_declaration") {
    const spec = node.childForFieldName("path") || node.child(0);
    if (spec && spec.type === "import_spec") {
      const pathNode = spec.childForFieldName("path");
      if (pathNode) {
        result.imports.push({ path: pathNode.text.replace(/['"]/g, ""), row: node.startPosition.row });
      }
    }
  }

  if (node.type === "import_spec_list") {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === "import_spec") {
        const pathNode = child.childForFieldName("path");
        if (pathNode) {
          result.imports.push({ path: pathNode.text.replace(/['"]/g, ""), row: child.startPosition.row });
        }
      }
    }
  }

  if (node.type === "call_expression") {
    const funcNode = node.childForFieldName("function") || node.child(0);
    if (funcNode) {
      result.calls.push({ callee: funcNode.text, row: node.startPosition.row });
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    walkGoTree(node.child(i), result);
  }
}

function extractGo(
  content: string,
  filePath: string,
  lang: any,
  parser: any,
): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const seenNodes = new Set<string>();

  function addNode(id: string, type: string, label: string, fp?: string, line?: number) {
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      nodes.push({ id, type, label, file_path: fp || filePath, line_number: line || 0 });
    }
  }

  addNode(filePath, "file", filePath.split("/").pop() || filePath, filePath);

  parser.setLanguage(lang);
  const tree = parser.parse(content);
  const result: GoWalkResult = { functions: [], structs: [], interfaces: [], imports: [], calls: [] };
  walkGoTree(tree.rootNode, result);

  for (const fn of result.functions) {
    const nodeId = fn.receiver ? `${filePath}:${fn.receiver}.${fn.name}` : `${filePath}:${fn.name}`;
    addNode(nodeId, "function", fn.name, filePath, fn.row + 1);
    edges.push({ from_id: filePath, to_id: nodeId, type: "defines", confidence: "auto" });
    if (fn.receiver) {
      const recvId = `${filePath}:${fn.receiver}`;
      addNode(recvId, "struct", fn.receiver, filePath, 0);
      edges.push({ from_id: recvId, to_id: nodeId, type: "defines", confidence: "auto" });
    }
  }

  for (const s of result.structs) {
    const structId = `${filePath}:${s.name}`;
    addNode(structId, "struct", s.name, filePath, s.row + 1);
    edges.push({ from_id: filePath, to_id: structId, type: "defines", confidence: "auto" });
  }

  for (const iface of result.interfaces) {
    const ifaceId = `${filePath}:${iface.name}`;
    addNode(ifaceId, "interface", iface.name, filePath, iface.row + 1);
    edges.push({ from_id: filePath, to_id: ifaceId, type: "defines", confidence: "auto" });
  }

  for (const imp of result.imports) {
    const pkgName = imp.path.split("/").pop() || imp.path;
    if (pkgName) {
      const pkgId = `pkg.${pkgName}`;
      addNode(pkgId, "input", pkgName);
      edges.push({ from_id: filePath, to_id: pkgId, type: "uses_input", confidence: "auto" });
    }
  }

  for (const call of result.calls) {
    const callId = `${filePath}:call:${call.callee}:${call.row}`;
    addNode(callId, "function", `call:${call.callee}`, filePath, call.row + 1);
    edges.push({ from_id: filePath, to_id: callId, type: "calls", confidence: "auto" });
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

  if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
    const parser = new ParserClass();
    return extractTsJs(content, filePath, lang, parser);
  }

  if (ext === ".py") {
    const parser = new ParserClass();
    return extractPython(content, filePath, lang, parser);
  }

  if (ext === ".rs") {
    const parser = new ParserClass();
    return extractRust(content, filePath, lang, parser);
  }

  if (ext === ".go") {
    const parser = new ParserClass();
    return extractGo(content, filePath, lang, parser);
  }

  return null;
}

export function getSupportedExtensions(): string[] {
  return Object.keys(EXT_TO_GRAMMAR).filter(ext => {
    const grammarName = EXT_TO_GRAMMAR[ext];
    return fs.existsSync(path.join(GRAMMARS_DIR, `${grammarName}.wasm`));
  });
}
