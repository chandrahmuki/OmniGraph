import { ExtractedNode, ExtractedEdge } from "./generic.ts";

interface ExtractedAnnotation {
  node_id: string;
  key: string;
  value: string;
}

interface ExtractResultWithAnnotations {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  annotations: ExtractedAnnotation[];
}

interface GitCommit {
  hash: string;
  date: string;
  message: string;
  files: { path: string; status: string }[];
}

function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = output.split("\n");
  let currentCommit: GitCommit | null = null;

  for (const line of lines) {
    const commitMatch = line.match(/^([a-f0-9]+)\|([^|]+)\|(.+)$/);
    if (commitMatch) {
      if (currentCommit) commits.push(currentCommit);
      currentCommit = {
        hash: commitMatch[1],
        date: commitMatch[2],
        message: commitMatch[3],
        files: [],
      };
    } else if (currentCommit && line.trim()) {
      const fileMatch = line.match(/^([AMDRCU])\s+(.+)$/);
      if (fileMatch) {
        currentCommit.files.push({ path: fileMatch[2], status: fileMatch[1] });
      }
    }
  }
  if (currentCommit) commits.push(currentCommit);
  return commits;
}

function inferChangeType(message: string): string {
  const lower = message.toLowerCase();
  if (lower.startsWith("fix:") || lower.includes("fixed") || lower.includes("fixes")) return "fix";
  if (lower.startsWith("feat:") || lower.includes("added") || lower.includes("new")) return "add";
  if (lower.startsWith("refactor:") || lower.includes("refactored")) return "refactor";
  if (lower.startsWith("remove:") || lower.includes("removed") || lower.includes("deleted")) return "remove";
  if (lower.includes("replaced") || lower.includes("switched") || lower.includes("swapped")) return "replace";
  if (lower.includes("renamed")) return "rename";
  if (lower.includes("updated") || lower.includes("changed")) return "update";
  return "other";
}

export function extractGitChanges(projectPath: string): ExtractResultWithAnnotations {
  const { execSync } = require("node:child_process");
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const annotations: ExtractedAnnotation[] = [];

  function addNode(id: string, type: string, label: string, filePath?: string, lineNumber?: number, createdAt?: string) {
    if (!nodes.find(n => n.id === id)) {
      nodes.push({ id, type, label, file_path: filePath || id, line_number: lineNumber || 0, created_at: createdAt });
    }
  }

  function addEdge(from: string, to: string, type: string, confidence = "extracted") {
    if (!edges.find(e => e.from_id === from && e.to_id === to && e.type === type)) {
      edges.push({ from_id: from, to_id: to, type, confidence });
    }
  }

  function addAnnotation(nodeId: string, key: string, value: string) {
    if (!annotations.find(a => a.node_id === nodeId && a.key === key && a.value === value)) {
      annotations.push({ node_id: nodeId, key, value });
    }
  }

  try {
    const logOutput = execSync(
      `git log --format="%H|%aI|%s" --name-status -n 100`,
      { cwd: projectPath, encoding: "utf-8" }
    );

    const commits = parseGitLog(logOutput);

    for (const commit of commits) {
      const commitNodeId = `commit:${commit.hash.slice(0, 8)}`;
      addNode(commitNodeId, "commit", commit.message.slice(0, 120), undefined, 0, commit.date);

      const changeType = inferChangeType(commit.message);

      for (const file of commit.files) {
        const slug = file.path.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const changeId = `change:${commit.hash.slice(0, 8)}:${slug}`;
        const label = `${changeType}: ${file.path} (${commit.message.slice(0, 60)})`;

        addNode(changeId, "change", label, file.path, 0, commit.date);
        addEdge(commitNodeId, changeId, "recorded_change");
        addEdge(changeId, file.path, "affects");

        addAnnotation(changeId, "change_type", changeType);
        addAnnotation(changeId, "commit", commit.hash.slice(0, 8));
        addAnnotation(changeId, "reason", commit.message);
        addAnnotation(changeId, "date", commit.date);

        if (file.status === "D") {
          addAnnotation(changeId, "change_type", "remove");
        } else if (file.status === "A") {
          addAnnotation(changeId, "change_type", "add");
        } else if (file.status === "R") {
          addAnnotation(changeId, "change_type", "rename");
        }
      }
    }
  } catch (e) {
    console.error("Git extractor failed:", (e as Error).message);
  }

  return { nodes, edges, annotations };
}
