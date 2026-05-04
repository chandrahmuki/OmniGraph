export interface ExtractedNode {
  id: string;
  type: string;
  label: string;
  file_path: string;
  line_number: number;
}

export interface ExtractedEdge {
  from_id: string;
  to_id: string;
  type: string;
  confidence: string;
}

export interface ExtractResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
}

const IMPORT_PATTERNS = [
  // JS/TS: import X from './path' or import('./path')
  /import\s+(?:.*?\s+from\s+)?['"](\.\/[^'"]+)['"]/g,
  /import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g,
  // JS require
  /require\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g,
  // Python: from .module import
  /from\s+(\.[^\s]+)\s+import/g,
  // C/C++: #include "local.h"
  /#include\s+['"]([^'"]+)['"]/g,
  // Nix: import ./path or inputs.something
  /import\s+['"](\.\/[^'"]+)['"]/g,
  /import\s+(\.\/[^\s;]+)/g,
  // Rust: mod path; use crate::path;
  /mod\s+(\w+)/g,
  /use\s+crate::([\w:]+)/g,
  // Go: import "./path"
  /import\s+['"]([^'"]+)['"]/g,
  // Generic: include, require, load
  /(?:include|require|load)\s+['"](\.\/[^'"]+)['"]/g,
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

export function extract(content: string, filePath: string): ExtractResult {
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const lines = content.split("\n");

  // Nœud pour le fichier lui-même
  nodes.push({
    id: filePath,
    type: "file",
    label: filePath.split("/").pop() || filePath,
    file_path: filePath,
    line_number: 0,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Regex imports
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        const rawPath = match[1];
        const resolvedPath = resolveRelativePath(filePath, rawPath);

        // Ajouter le nœud importé (s'il n'existe pas encore)
        const importedNode: ExtractedNode = {
          id: resolvedPath,
          type: "file",
          label: resolvedPath.split("/").pop() || resolvedPath,
          file_path: resolvedPath,
          line_number: lineNum,
        };
        if (!nodes.find(n => n.id === importedNode.id)) {
          nodes.push(importedNode);
        }

        edges.push({
          from_id: filePath,
          to_id: resolvedPath,
          type: "imports",
          confidence: "auto",
        });
      }
    }

    // Tags @omnigraph
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
