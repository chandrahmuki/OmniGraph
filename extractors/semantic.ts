import { GraphDB } from "../db.ts";

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "ought",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few",
  "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just",
  "and", "but", "if", "or", "because", "until", "while", "about",
  "against", "this", "that", "these", "those", "it", "its",
  "i", "me", "my", "myself", "we", "our", "ours", "you", "your",
  "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "whom",
]);

const STEM_MAP: Record<string, string> = {
  "crash": "crash", "crashes": "crash", "crashed": "crash", "crashing": "crash",
  "fail": "fail", "fails": "fail", "failed": "fail", "failure": "fail", "failing": "fail",
  "fix": "fix", "fixes": "fix", "fixed": "fix", "fixing": "fix",
  "error": "error", "errors": "error",
  "build": "build", "builds": "build", "built": "build", "building": "build",
  "run": "run", "runs": "run", "running": "run",
  "use": "use", "uses": "use", "used": "use", "using": "use",
  "config": "config", "configs": "config", "configuration": "config", "configure": "config",
  "depend": "depend", "depends": "depend", "dependency": "depend", "dependencies": "depend",
  "import": "import", "imports": "import", "imported": "import", "importing": "import",
  "call": "call", "calls": "call", "called": "call", "calling": "call",
  "function": "function", "functions": "function",
  "module": "module", "modules": "module",
  "service": "service", "services": "service",
  "program": "program", "programs": "program",
  "package": "package", "packages": "package",
  "option": "option", "options": "option",
  "secret": "secret", "secrets": "secret",
  "session": "session", "sessions": "session",
  "lesson": "lesson", "lessons": "lesson",
  "file": "file", "files": "file",
  "type": "type", "types": "type",
  "class": "class", "classes": "class",
  "interface": "interface", "interfaces": "interface",
  "struct": "struct", "structs": "struct",
  "method": "method", "methods": "method",
  "variable": "variable", "variables": "variable",
  "parameter": "parameter", "parameters": "parameter",
  "argument": "argument", "arguments": "argument",
  "return": "return", "returns": "return", "returned": "return",
  "create": "create", "creates": "create", "created": "create", "creating": "create",
  "add": "add", "adds": "add", "added": "add", "adding": "add",
  "remove": "remove", "removes": "remove", "removed": "remove", "removing": "remove",
  "delete": "delete", "deletes": "delete", "deleted": "delete", "deleting": "delete",
  "update": "update", "updates": "update", "updated": "update", "updating": "update",
  "change": "change", "changes": "change", "changed": "change", "changing": "change",
  "set": "set", "sets": "set", "setting": "set",
  "get": "get", "gets": "get", "getting": "get", "got": "get",
  "make": "make", "makes": "make", "making": "make", "made": "make",
  "take": "take", "takes": "take", "taking": "take", "took": "take",
  "give": "give", "gives": "give", "giving": "give", "gave": "give",
  "show": "show", "shows": "show", "showing": "show", "showed": "show",
  "display": "display", "displays": "display", "displayed": "display",
  "handle": "handle", "handles": "handle", "handled": "handle", "handling": "handle",
  "process": "process", "processes": "process", "processed": "process",
  "manage": "manage", "manages": "manage", "managed": "manage", "managing": "manage",
  "check": "check", "checks": "check", "checked": "check", "checking": "check",
  "test": "test", "tests": "test", "tested": "test", "testing": "test",
  "parse": "parse", "parses": "parse", "parsed": "parse", "parsing": "parse",
  "extract": "extract", "extracts": "extract", "extracted": "extract", "extracting": "extract",
  "scan": "scan", "scans": "scan", "scanned": "scan", "scanning": "scan",
  "load": "load", "loads": "load", "loaded": "load", "loading": "load",
  "save": "save", "saves": "save", "saved": "save", "saving": "save",
  "write": "write", "writes": "write", "writing": "write", "wrote": "write",
  "read": "read", "reads": "read", "reading": "read",
  "open": "open", "opens": "open", "opened": "open", "opening": "open",
  "close": "close", "closes": "close", "closed": "close", "closing": "close",
  "connect": "connect", "connects": "connect", "connected": "connect", "connecting": "connect",
  "send": "send", "sends": "send", "sending": "send", "sent": "send",
  "receive": "receive", "receives": "receive", "received": "receive", "receiving": "receive",
  "request": "request", "requests": "request", "requested": "request",
  "response": "response", "responses": "response",
  "query": "query", "queries": "query", "queried": "query", "querying": "query",
  "search": "search", "searches": "search", "searched": "search", "searching": "search",
  "find": "find", "finds": "find", "finding": "find", "found": "find",
  "match": "match", "matches": "match", "matched": "match", "matching": "match",
  "filter": "filter", "filters": "filter", "filtered": "filter", "filtering": "filter",
  "sort": "sort", "sorts": "sort", "sorted": "sort", "sorting": "sort",
  "group": "group", "groups": "group", "grouped": "group", "grouping": "group",
  "count": "count", "counts": "count", "counted": "count", "counting": "count",
  "list": "list", "lists": "list", "listed": "list", "listing": "list",
  "tree": "tree", "trees": "tree",
  "graph": "graph", "graphs": "graph",
  "node": "node", "nodes": "node",
  "edge": "edge", "edges": "edge",
  "path": "path", "paths": "path",
  "link": "link", "links": "link", "linked": "link", "linking": "link",
  "reference": "reference", "references": "reference",
  "resolve": "resolve", "resolves": "resolve", "resolved": "resolve", "resolving": "resolve",
  "resolve": "resolve", "resolves": "resolve", "resolved": "resolve", "resolving": "resolve",
  "resolve": "resolve", "resolves": "resolve", "resolved": "resolve", "resolving": "resolve",
  "symlink": "symlink", "symlinks": "symlink",
  "nix": "nix",
  "flake": "flake", "flakes": "flake",
  "overlay": "overlay", "overlays": "overlay",
  "derivation": "derivation", "derivations": "derivation",
  "cache": "cache", "caches": "cache", "cached": "cache", "caching": "cache",
  "store": "store", "stores": "store", "stored": "store", "storing": "store",
  "database": "database", "databases": "database", "db": "database",
  "memory": "memory", "memories": "memory",
  "index": "index", "indexes": "index", "indices": "index", "indexed": "index", "indexing": "index",
  "embed": "embed", "embeds": "embed", "embedded": "embed", "embedding": "embed", "embeddings": "embed",
  "vector": "vector", "vectors": "vector",
  "semantic": "semantic",
  "search": "search", "searches": "search", "searched": "search", "searching": "search",
  "panic": "panic", "panics": "panic",
  "segfault": "segfault", "segfaults": "segfault",
  "freeze": "freeze", "freezes": "freeze", "froze": "freeze", "freezing": "freeze",
  "hang": "hang", "hangs": "hang", "hung": "hang", "hanging": "hang",
  "loop": "loop", "loops": "loop", "looping": "loop",
  "infinite": "infinite",
  "broken": "break", "break": "break", "breaks": "break", "breaking": "break", "broke": "break",
  "issue": "issue", "issues": "issue",
  "problem": "problem", "problems": "problem",
  "bug": "bug", "bugs": "bug",
  "decision": "decision", "decisions": "decision",
  "rationale": "rationale", "rationales": "rationale",
  "reason": "reason", "reasons": "reason",
  "why": "why",
  "because": "because",
  "since": "since",
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => STEM_MAP[t] || t);
}

interface IndexEntry {
  docFreq: Map<string, number>;
  docLengths: Map<string, number>;
  postings: Map<string, Map<string, number>>;
  totalDocs: number;
  avgDocLength: number;
}

export class BM25Index {
  private k1 = 1.5;
  private b = 0.75;
  private index: IndexEntry = {
    docFreq: new Map(),
    docLengths: new Map(),
    postings: new Map(),
    totalDocs: 0,
    avgDocLength: 0,
  };

  addDocument(docId: string, text: string): void {
    const tokens = tokenize(text);
    const docLen = tokens.length;

    this.index.docLengths.set(docId, docLen);

    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }

    for (const [term, freq] of termFreq) {
      if (!this.index.postings.has(term)) {
        this.index.postings.set(term, new Map());
      }
      this.index.postings.get(term)!.set(docId, freq);

      this.index.docFreq.set(term, (this.index.docFreq.get(term) || 0) + 1);
    }

    this.index.totalDocs++;
    const totalLen = [...this.index.docLengths.values()].reduce((a, b) => a + b, 0);
    this.index.avgDocLength = totalLen / this.index.totalDocs;
  }

  search(query: string, topK = 10): { docId: string; score: number }[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = new Map<string, number>();

    for (const term of queryTokens) {
      const postings = this.index.postings.get(term);
      if (!postings) continue;

      const df = this.index.docFreq.get(term) || 0;
      const idf = Math.log(1 + (this.index.totalDocs - df + 0.5) / (df + 0.5));

      for (const [docId, freq] of postings) {
        const docLen = this.index.docLengths.get(docId) || 0;
        const norm = 1 - this.b + this.b * (docLen / this.index.avgDocLength);
        const tf = (freq * (this.k1 + 1)) / (freq + this.k1 * norm);

        scores.set(docId, (scores.get(docId) || 0) + idf * tf);
      }
    }

    const results = [...scores.entries()]
      .map(([docId, score]) => ({ docId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const maxScore = results.length > 0 ? results[0].score : 1;
    return results.map(r => ({ docId: r.docId, score: r.score / maxScore }));
  }
}

const EMBEDDABLE_TYPES = new Set([
  "function", "class", "interface", "lesson_item",
  "error", "fix", "decision", "issue", "change",
  "rationale", "lesson", "session", "file",
]);

function buildNodeText(node: any): string {
  const parts: string[] = [];
  if (node.type) parts.push(node.type);
  if (node.label) parts.push(node.label);
  if (node.file_path) parts.push(node.file_path);
  return parts.join(" ");
}

export function buildIndex(db: GraphDB): BM25Index {
  const index = new BM25Index();
  const nodes = db.getAllNodes().filter(n => EMBEDDABLE_TYPES.has(n.type));

  for (const node of nodes) {
    index.addDocument(node.id, buildNodeText(node));
  }

  return index;
}
