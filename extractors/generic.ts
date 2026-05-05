export interface ExtractedNode {
  id: string;
  type: string;
  label: string;
  file_path: string;
  line_number: number;
  created_at?: string;
}

export interface ExtractedEdge {
  from_id: string;
  to_id: string;
  type: string;
  confidence: string;
}

export interface ExtractedConcept {
  node_id: string;
  kind: string;
  name: string;
  file_path?: string;
  line_number?: number;
  snippet?: string;
}

export interface ExtractResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  concepts?: ExtractedConcept[];
}

interface PatternDef {
  regex: RegExp;
  group: number;
  edgeType: string;
  resolve: boolean;
  multi?: boolean;
}

interface LanguagePatterns {
  extensions: string[];
  imports: PatternDef[];
  externalDeps: PatternDef[];
  resourceRefs: PatternDef[];
}

const LANGUAGES: LanguagePatterns[] = [
  {
    extensions: [".nix"],
    imports: [
      { regex: /import\s+\.\/([^\s;"]+)/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /imports\s*=\s*\[([^\]]+)\]/g, group: 1, edgeType: "imports", resolve: true, multi: true },
      { regex: /\.\/([^\s;"]+\.nix)/g, group: 1, edgeType: "imports", resolve: true },
    ],
    externalDeps: [
      { regex: /inputs\.(\w[\w-]*)/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    resourceRefs: [
      { regex: /(\.\.\/|\.?\/)?(secrets\/[\w.-]+\.yaml)/g, group: 2, edgeType: "references_secrets", resolve: false },
      { regex: /(\.\.\/|\.?\/)?(generated\/[\w.-]+\.(json|toml|yaml|conf))/g, group: 2, edgeType: "references_generated", resolve: false },
      { regex: /(\.\.\/|\.?\/)?(lib\/colors\.nix)/g, group: 2, edgeType: "uses_colors", resolve: false },
      { regex: /(\.\.\/|\.?\/)?(nvim\/)/g, group: 2, edgeType: "references_config", resolve: false },
      { regex: /(\.agent\/[\w.-]+\.json)/g, group: 1, edgeType: "references_config", resolve: false },
    ],
  },
  {
    extensions: [".ts", ".js", ".tsx", ".jsx"],
    imports: [
      { regex: /import\s+(?:.*?\s+from\s+)?['"](\.\/[^'"]+)['"]/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /require\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g, group: 1, edgeType: "imports", resolve: true },
    ],
    externalDeps: [
      { regex: /import\s+.*?\s+from\s+['"]([@.\w/-]+)['"]/g, group: 1, edgeType: "uses_input", resolve: false },
      { regex: /require\s*\(\s*['"]([@.\w/-]+)['"]\s*\)/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    resourceRefs: [],
  },
  {
    extensions: [".py"],
    imports: [
      { regex: /from\s+(\.[^\s]+)\s+import/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /import\s+(\.[^\s]+)/g, group: 1, edgeType: "imports", resolve: true },
    ],
    externalDeps: [
      { regex: /import\s+([a-zA-Z_]\w*)/g, group: 1, edgeType: "uses_input", resolve: false },
      { regex: /from\s+([a-zA-Z_]\w*)\s+import/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    resourceRefs: [],
  },
  {
    extensions: [".rs"],
    imports: [
      { regex: /mod\s+(\w+)/g, group: 1, edgeType: "imports", resolve: false },
      { regex: /use\s+crate::([\w:]+)/g, group: 1, edgeType: "imports", resolve: false },
      { regex: /use\s+super::([\w:]+)/g, group: 1, edgeType: "imports", resolve: false },
    ],
    externalDeps: [
      { regex: /use\s+([a-z_]\w*)::/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    resourceRefs: [],
  },
  {
    extensions: [".go"],
    imports: [
      { regex: /import\s+['"](\.\/[^'"]+)['"]/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /\.\s*([\w]+)\s*\(/g, group: 1, edgeType: "imports", resolve: false },
    ],
    externalDeps: [
      { regex: /import\s+['"]([^'"]+)['"]/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    resourceRefs: [],
  },
  {
    extensions: [".c", ".h", ".cpp", ".hpp"],
    imports: [
      { regex: /#include\s+['"]([^'"]+)['"]/g, group: 1, edgeType: "imports", resolve: true },
      { regex: /#include\s+<([^>]+)>/g, group: 1, edgeType: "uses_input", resolve: false },
    ],
    externalDeps: [],
    resourceRefs: [],
  },
];

const GENERIC_PATTERNS: PatternDef[] = [
  { regex: /(?:include|require|load)\s+['"](\.\/[^'"]+)['"]/g, group: 1, edgeType: "imports", resolve: true },
];

const OMNIGRAPH_TAG_PATTERN = /#\s*@omnigraph:\s*(\w+)\s+(.+)/g;

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

function getExt(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return "";
  return filePath.slice(dot);
}

function detectLanguage(filePath: string): LanguagePatterns | null {
  const ext = getExt(filePath);
  return LANGUAGES.find(l => l.extensions.includes(ext)) || null;
}

function matchPatterns(
  line: string,
  patterns: PatternDef[],
  filePath: string,
  lineNum: number,
  nodes: ExtractedNode[],
  edges: ExtractedEdge[],
): void {
  for (const pat of patterns) {
    pat.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pat.regex.exec(line)) !== null) {
      const rawMatch = match[pat.group];
      if (!rawMatch) continue;

      const rawPaths = pat.multi
        ? rawMatch.split(/\s+/).filter(s => s.startsWith("."))
        : [rawMatch];

      for (const rawPath of rawPaths) {
        const targetId = pat.resolve
          ? resolveRelativePath(filePath, rawPath)
          : rawPath;

        if (pat.resolve || pat.edgeType === "uses_input") {
          const targetType = pat.edgeType === "uses_input" ? "input" : "file";
          if (!nodes.find(n => n.id === targetId)) {
            nodes.push({
              id: targetId,
              type: targetType,
              label: targetId.split("/").pop() || targetId,
              file_path: pat.resolve ? targetId : undefined as any,
              line_number: lineNum,
            });
          }
        }

        edges.push({
          from_id: filePath,
          to_id: targetId,
          type: pat.edgeType,
          confidence: "auto",
        });
      }
    }
  }
}

export function extract(content: string, filePath: string): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const lines = content.split("\n");

  nodes.push({
    id: filePath,
    type: "file",
    label: filePath.split("/").pop() || filePath,
    file_path: filePath,
    line_number: 0,
  });

  const lang = detectLanguage(filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (lang) {
      matchPatterns(line, lang.imports, filePath, lineNum, nodes, edges);
      matchPatterns(line, lang.externalDeps, filePath, lineNum, nodes, edges);
      matchPatterns(line, lang.resourceRefs, filePath, lineNum, nodes, edges);
    }

    matchPatterns(line, GENERIC_PATTERNS, filePath, lineNum, nodes, edges);

    OMNIGRAPH_TAG_PATTERN.lastIndex = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = OMNIGRAPH_TAG_PATTERN.exec(line)) !== null) {
      const tagType = tagMatch[1];
      const tagValue = tagMatch[2].trim();

      if (tagType === "link-to") {
        const targetPath = resolveRelativePath(filePath, tagValue);
        if (!nodes.find(n => n.id === targetPath)) {
          nodes.push({
            id: targetPath,
            type: "file",
            label: targetPath.split("/").pop() || targetPath,
            file_path: targetPath,
            line_number: lineNum,
          });
        }
        edges.push({
          from_id: filePath,
          to_id: targetPath,
          type: "links_to",
          confidence: "manual",
        });
      } else if (tagType === "lesson" || tagType === "error") {
        const annotationId = `${filePath}:${lineNum}:${tagType}`;
        nodes.push({
          id: annotationId,
          type: tagType === "error" ? "error" : "lesson",
          label: tagValue,
          file_path: filePath,
          line_number: lineNum,
        });
        edges.push({
          from_id: filePath,
          to_id: annotationId,
          type: tagType === "error" ? "caused" : "learned_from",
          confidence: "manual",
        });
      }
    }
  }

  return { nodes, edges };
}
