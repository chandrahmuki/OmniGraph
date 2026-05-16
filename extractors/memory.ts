import { ExtractedNode, ExtractedEdge, ExtractResult } from "./generic.ts";

interface MemoryConfig {
  sessions_dir: string;
  lessons_dir: string;
  skills_dir: string;
}

interface MappingsConfig {
  concepts?: Record<string, string>;
  programs?: Record<string, string>;
  auto_discover?: {
    dirs?: string[];
    extensions?: string[];
  };
}

interface ExtractedAnnotation {
  node_id: string;
  key: string;
  value: string;
}

interface ExtractResultWithAnnotations extends ExtractResult {
  annotations: ExtractedAnnotation[];
}

interface LessonItem {
  lineNum: number;
  text: string;
  createdAt: string;
}

const TRANSVERSE_PATTERNS = [
  /\b(build|cache|overlay|config|crash|fix|migration|install|override|rollback|update|error|block)\b/gi,
];

// Patterns for snapshot-style error/fix extraction
const ERROR_EXPLICIT = /^(?:Error|FATAL|CRITICAL|PANIC|BUG|FAILURE|TypeError|ReferenceError|SyntaxError|RangeError|Promise|Exception):\s+/i;

// Semantic error detection: words that describe a problem/failure state
const ERROR_SIGNALS = /\b(failed|fails|failure|broken|crash|crashed|segfault|panic|fatal|hang|hanged|froze|freeze|exception|bug|issue|problem|couldn't|couldn.t|unable to|unable|unexpected|broke|regression|error|doesn.t work|don.t work|not working|ne marche pas|plante|planté|cassé|bug|problème|souci|erreur|impossible de|impossible|undefined|null reference|stack trace|traceback)\b/i;

// Reject: lines that mention error words but describe plans, features, or improvements
const ERROR_REJECT = /\b(plan to|will fix|should fix|going to fix|feat:|feature:|add error|added error|implement error|error handling|error messages|error page|error boundary|error tracking)\b/i;

// Fix: explicit fix/resolve statements
const FIX_PATTERN = /\b(Fixed|Resolved|Patched|Solved|Fix|Réparé|Corrigé|Fixé)\b/i;

// Workaround: replacement, removal, or bypass without fixing root cause
const WORKAROUND_PATTERN = /\b(Replaced|Switched|Swapped|Removed|Workaround|Bypass|Disabled|Avoid|Fallback|Remplacé|Supprimé|Désactivé|Évité|Contourné)\b/i;

// Detect if a line describes an error/problem (semantic detection)
function detectErrorIntent(line: string): "error" | "fix" | "workaround" | null {
  const trimmed = line.trim();

  // Explicit error prefix (Error:, TypeError:, etc.)
  if (ERROR_EXPLICIT.test(trimmed)) return "error";

  // Reject lines that mention error words but aren't actual errors
  if (ERROR_REJECT.test(trimmed)) return null;

  // Check for error signals — something is broken/failing
  if (ERROR_SIGNALS.test(trimmed)) {
    // But if it's clearly a fix statement, classify as fix instead
    if (FIX_PATTERN.test(trimmed)) return "fix";
    if (WORKAROUND_PATTERN.test(trimmed)) return "workaround";
    return "error";
  }

  return null;
}

const ISSUE_PATTERNS = [
  /\b(has a bug|crashes|broken|incompatible|doesn.t work|fails to|regression|error when|issue with|problem with)\b/i,
];

const DECISION_PATTERNS = [
  /\b(chose|selected|picked|went with|decided on|opted for|using|switched to)\b/i,
  /\b(over|instead of|rather than|replacing)\b/i,
];

const CHANGE_PATTERNS = [
  /\b(replaced|switched|swapped|changed)\b\s+(\w+)\s+(?:with|to|for)\s+(\w+)/i,
  /\b(added|created|introduced|new)\b\s+(.+)/i,
  /\b(removed|deleted|dropped|eliminated|uninstalled)\b\s+(.+)/i,
  /\b(refactored|rewrote|restructured|renamed)\b\s+(.+)/i,
];

const INPUT_PATTERN = /inputs\.(\w[\w-]*)/g;
const LESSON_PATTERN = /lessons\/([\w-]+)\.md/g;
const SKILL_PATTERN = /skills\/([\w-]+)/g;

const ITEM_DATE_PATTERN = /^-\s+(\d{4}-\d{2}-\d{2}):\s+(.+)$/;
const ITEM_ALWAYS_PATTERN = /^-\s+Toujours\s*:\s+(.+)$/;
const ITEM_BARE_PATTERN = /^-\s+(.+)$/;

function buildAllMappings(projectPath: string, mappingsConfig?: MappingsConfig): Record<string, string> {
  const fs = require("node:fs");
  const path = require("node:path");
  const mappings: Record<string, string> = {};

  if (mappingsConfig?.concepts) {
    Object.assign(mappings, mappingsConfig.concepts);
  }
  if (mappingsConfig?.programs) {
    Object.assign(mappings, mappingsConfig.programs);
  }

  const autoDirs = mappingsConfig?.auto_discover?.dirs || ["modules", "src", "lib"];
  const autoExts = mappingsConfig?.auto_discover?.extensions || [".nix", ".ts", ".py", ".rs", ".go"];

  for (const dir of autoDirs) {
    const fullDir = path.join(projectPath, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of fs.readdirSync(fullDir)) {
      const ext = "." + file.split(".").pop();
      if (autoExts.includes(ext)) {
        const name = file.replace(/\.[^.]+$/, "");
        if (!mappings[name]) {
          mappings[name] = `${dir}/${file}`;
        }
      }
    }
  }

  return mappings;
}

function matchTextToConcepts(
  text: string,
  allMappings: Record<string, string>,
): { targets: Set<string>; tags: Set<string> } {
  const targets = new Set<string>();
  const tags = new Set<string>();

  for (const [term, modPath] of Object.entries(allMappings)) {
    const regex = new RegExp(`\\b${term.replace(/[-]/g, "[-\\s]")}\\b`, "i");
    if (regex.test(text)) {
      targets.add(modPath);
      tags.add(term.toLowerCase());
    }
  }

  for (const pattern of TRANSVERSE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      tags.add(m[1].toLowerCase());
    }
  }

  return { targets, tags };
}

function parseLessonItems(content: string): LessonItem[] {
  const items: LessonItem[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let dateMatch = line.match(ITEM_DATE_PATTERN);
    if (dateMatch) {
      items.push({ lineNum: i + 1, text: dateMatch[2], createdAt: dateMatch[1] });
      continue;
    }
    let alwaysMatch = line.match(ITEM_ALWAYS_PATTERN);
    if (alwaysMatch) {
      items.push({ lineNum: i + 1, text: alwaysMatch[1], createdAt: "always" });
      continue;
    }
    if (line.startsWith("- ") && !line.match(ITEM_DATE_PATTERN) && !line.match(ITEM_ALWAYS_PATTERN) && !line.startsWith("#")) {
      let bareMatch = line.match(ITEM_BARE_PATTERN);
      if (bareMatch && !bareMatch[1].match(/^\d{4}-\d{2}/)) {
        items.push({ lineNum: i + 1, text: bareMatch[1], createdAt: "unknown" });
      }
    }
  }

  return items;
}

function normalizeErrorText(text: string): string {
  return text
    .replace(/^(?:Error|FATAL|CRITICAL|PANIC|BUG|FAILURE|Implicit:\s*|Prose:\s*):\s*/i, "")
    .replace(/\b(Fixed|Resolved|Patched|Workaround|Mitigated|Solved|Fix)\b/gi, "")
    .replace(/\b\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}\b/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function parseSummary(content: string, sessionId: string, allMappings: Record<string, string>): {
  targetsModified: string[];
  lessonsProduced: string[];
  skillsProduced: string[];
  inputsReferenced: string[];
  timestamp: string | null;
} {
  const targetsModified = new Set<string>();
  const lessonsProduced = new Set<string>();
  const skillsProduced = new Set<string>();
  const inputsReferenced = new Set<string>();
  let timestamp: string | null = null;

  const genMatch = content.match(/^Generated:\s*(.+)$/m);
  if (genMatch) {
    timestamp = genMatch[1].trim();
  }

  const text = content;

  const explicitPathPattern = /(?:modules\/[\w-]+\.\w+|(?:hosts\/system\/)?(?:default|hardware-configuration)\.\w+|flake\.\w+|home\.\w+|overlays\.\w+|lib\/colors\.\w+|src\/[\w/-]+\.\w+)/g;
  for (const m of text.matchAll(explicitPathPattern)) {
    targetsModified.add(m[0]);
  }

  for (const [name, modPath] of Object.entries(allMappings)) {
    if (name.length < 3) continue;
    const regex = new RegExp(`\\b${name.replace(/[-]/g, "[-\\s]")}\\b`, "i");
    if (regex.test(text)) {
      targetsModified.add(modPath);
    }
  }

  for (const m of text.matchAll(INPUT_PATTERN)) {
    inputsReferenced.add(m[1]);
  }

  for (const m of text.matchAll(LESSON_PATTERN)) {
    lessonsProduced.add(m[1]);
  }

  for (const m of text.matchAll(SKILL_PATTERN)) {
    skillsProduced.add(m[1]);
  }

  const commitPattern = /`[a-f0-9]{6,}`\s+\w+(?:\([\w-]+\))?:\s+(.+)/g;
  for (const m of text.matchAll(commitPattern)) {
    const msg = m[1];
    for (const [name, modPath] of Object.entries(allMappings)) {
      if (name.length >= 3 && msg.toLowerCase().includes(name.toLowerCase())) {
        targetsModified.add(modPath);
      }
    }
  }

  return {
    targetsModified: [...targetsModified],
    lessonsProduced: [...lessonsProduced],
    skillsProduced: [...skillsProduced],
    inputsReferenced: [...inputsReferenced],
    timestamp,
  };
}

export function extractMemory(
  projectPath: string,
  config: MemoryConfig,
  mappingsConfig?: MappingsConfig,
): ExtractResultWithAnnotations {
  const fs = require("node:fs");
  const path = require("node:path");
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const annotations: ExtractedAnnotation[] = [];

  const allMappings = buildAllMappings(projectPath, mappingsConfig);

  function addNode(id: string, type: string, label: string, filePath?: string, lineNumber?: number, createdAt?: string) {
    if (!nodes.find(n => n.id === id)) {
      nodes.push({
        id,
        type,
        label,
        file_path: filePath || id,
        line_number: lineNumber || 0,
        created_at: createdAt,
      });
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

  const sessionDateIndex = new Map<string, string[]>();
  const sessionsDir = path.join(projectPath, config.sessions_dir);
  if (fs.existsSync(sessionsDir)) {
    for (const entry of fs.readdirSync(sessionsDir)) {
      const datePart = entry.split("_")[0];
      if (!sessionDateIndex.has(datePart)) {
        sessionDateIndex.set(datePart, []);
      }
      sessionDateIndex.get(datePart)!.push(entry);

      const summaryPath = path.join(sessionsDir, entry, "summary.md");
      if (!fs.existsSync(summaryPath)) continue;

      const sessionId = entry;
      const dateFromId = entry.split("_")[0];

      try {
        const content = fs.readFileSync(summaryPath, "utf-8");
        const parsed = parseSummary(content, sessionId, allMappings);

        addNode(sessionId, "session", sessionId, `memory/sessions/${entry}/summary.md`, 0, parsed.timestamp || dateFromId);

        for (const mod of parsed.targetsModified) {
          addNode(mod, "file", mod.split("/").pop() || mod, mod);
          addEdge(sessionId, mod, "session_modified");
        }
        for (const lesson of parsed.lessonsProduced) {
          addNode(lesson, "lesson", lesson, `memory/lessons/${lesson}.md`);
          addEdge(sessionId, lesson, "session_produced");
        }
        for (const skill of parsed.skillsProduced) {
          addNode(skill, "skill", skill, `memory/skills/${skill}/SKILL.md`);
          addEdge(sessionId, skill, "session_produced");
        }
        for (const input of parsed.inputsReferenced) {
          const inputId = `inputs.${input}`;
          addNode(inputId, "input", input);
          addEdge(sessionId, inputId, "uses_input");
        }
      } catch {}
    }
  }

  const sessionsForErrors = new Map<string, string[]>();
  const errorToFileMap = new Map<string, string[]>();
  const fixToFileMap = new Map<string, string[]>();
  const workaroundToFileMap = new Map<string, string[]>();
  const errorCanonicalMap = new Map<string, string>();

  const sessionsDir2 = path.join(projectPath, config.sessions_dir);
  if (fs.existsSync(sessionsDir2)) {
    for (const entry of fs.readdirSync(sessionsDir2)) {
      const summaryPath = path.join(sessionsDir2, entry, "summary.md");
      if (!fs.existsSync(summaryPath)) continue;

      const sessionId = entry;
      const sessionErrors: string[] = [];
      const sessionFixes: string[] = [];
      const sessionWorkarounds: string[] = [];

      try {
        const content = fs.readFileSync(summaryPath, "utf-8");
        const lines = content.split("\n");

        // Extract files mentioned in this session (from Files Modified section and explicit paths)
        const sessionFiles = new Set<string>();
        let inFilesSection = false;
        for (const line of lines) {
          if (/^## Files Modified$/i.test(line)) {
            inFilesSection = true;
            continue;
          }
          if (/^## /i.test(line) && inFilesSection) {
            inFilesSection = false;
          }
          if (inFilesSection) {
            const pathMatch = line.match(/(?:`([^`]+)`|([\w/.-]+\.\w+))/);
            if (pathMatch) {
              const p = (pathMatch[1] || pathMatch[2]).trim();
              if (p && (p.includes("/") || p.endsWith(".ts") || p.endsWith(".nix") || p.endsWith(".py") || p.endsWith(".rs") || p.endsWith(".go") || p.endsWith(".js") || p.endsWith(".md"))) {
                sessionFiles.add(p);
              }
            }
          }
        }

        // Also extract file paths from any line in the session
        const pathPattern = /(?:modules\/[\w-]+\.\w+|extractors\/[\w-]+\.\w+|web\/[\w-]+\.\w+|memory\/[\w/.-]+\.\w+|\.?[\w-]+\.ts|\.?[\w-]+\.nix|\.?[\w-]+\.py)/g;
        for (const m of content.matchAll(pathPattern)) {
          sessionFiles.add(m[0]);
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const intent = detectErrorIntent(line);

          // FIX or WORKAROUND line
          if (intent === "fix" || intent === "workaround") {
            const isWorkaround = intent === "workaround" || WORKAROUND_PATTERN.test(line);
            const resolutionType = isWorkaround ? "workaround" : "fix";
            const nodeId = isWorkaround
              ? `workaround:${sessionId}:${line.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`
              : `fix:${sessionId}:${line.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_")}`;
            const nodeType = isWorkaround ? "workaround" : "fix";
            const nodeLabel = line.trim().slice(0, 120);
            addNode(nodeId, nodeType, nodeLabel, `memory/sessions/${entry}/summary.md`, 0, sessionId.split("_")[0]);
            addEdge(sessionId, nodeId, isWorkaround ? "applied_workaround" : "applied_fix");
            if (isWorkaround) {
              sessionWorkarounds.push(nodeId);
            } else {
              sessionFixes.push(nodeId);
            }

            // Associate fix/workaround with session files
            const relatedFiles = [...sessionFiles].filter(f => {
              const fileName = f.split("/").pop() || "";
              const baseName = fileName.replace(/\.\w+$/, "");
              return line.toLowerCase().includes(fileName.toLowerCase()) ||
                     line.toLowerCase().includes(baseName.toLowerCase()) ||
                     line.toLowerCase().includes(f.toLowerCase());
            });
            if (relatedFiles.length > 0) {
              if (isWorkaround) {
                workaroundToFileMap.set(nodeId, relatedFiles);
              } else {
                fixToFileMap.set(nodeId, relatedFiles);
              }
              for (const rf of relatedFiles) {
                addNode(rf, "file", rf.split("/").pop() || rf, rf);
                addEdge(nodeId, rf, "affects");
              }
            }

            // Extract implicit error from fix/workaround line
            const errorWords = line.match(/(?:crash|failure|broken|segfault|panic|fatal|hang|freeze|bug|issue|problem)/i);
            if (errorWords) {
              const normalized = normalizeErrorText(line);
              const canonicalId = `error:dedup_${normalized.replace(/[^a-zA-Z0-9]/g, "_")}`;

              if (!errorCanonicalMap.has(canonicalId)) {
                errorCanonicalMap.set(canonicalId, canonicalId);
                const errorLabel = `Dedup: ${line.trim().slice(0, 120)}`;
                addNode(canonicalId, "error", errorLabel, `memory/sessions/${entry}/summary.md`, 0, sessionId.split("_")[0]);
                addAnnotation(canonicalId, "recurrence_count", "1");
              } else {
                const existing = nodes.find(n => n.id === canonicalId);
                if (existing) {
                  const countAnn = annotations.find(a => a.node_id === canonicalId && a.key === "recurrence_count");
                  if (countAnn) {
                    const newCount = parseInt(countAnn.value) + 1;
                    countAnn.value = String(newCount);
                  }
                }
              }

              addEdge(sessionId, canonicalId, "detected_error");
              addEdge(canonicalId, nodeId, isWorkaround ? "workaround_by" : "resolved_by");
              addAnnotation(canonicalId, "resolution_type", resolutionType);
              if (!sessionsForErrors.has(canonicalId)) sessionsForErrors.set(canonicalId, []);
              sessionsForErrors.get(canonicalId)!.push(sessionId);
              sessionErrors.push(canonicalId);

              // Associate error with same files as the fix/workaround
              if (relatedFiles.length > 0) {
                errorToFileMap.set(canonicalId, relatedFiles);
                for (const rf of relatedFiles) {
                  addEdge(canonicalId, rf, "affects");
                }
              }
            }
          }
          // ERROR line (explicit or semantic)
          else if (intent === "error") {
            const trimmed = line.trim();
            const normalized = normalizeErrorText(trimmed);
            const canonicalId = `error:dedup_${normalized.replace(/[^a-zA-Z0-9]/g, "_")}`;

            if (!errorCanonicalMap.has(canonicalId)) {
              errorCanonicalMap.set(canonicalId, canonicalId);
              const errorLabel = ERROR_EXPLICIT.test(trimmed) ? trimmed.slice(0, 120) : `Prose: ${trimmed.slice(0, 120)}`;
              addNode(canonicalId, "error", errorLabel, `memory/sessions/${entry}/summary.md`, 0, sessionId.split("_")[0]);
              addAnnotation(canonicalId, "recurrence_count", "1");
            } else {
              const existing = nodes.find(n => n.id === canonicalId);
              if (existing) {
                const countAnn = annotations.find(a => a.node_id === canonicalId && a.key === "recurrence_count");
                if (countAnn) {
                  const newCount = parseInt(countAnn.value) + 1;
                  countAnn.value = String(newCount);
                }
              }
            }

            addEdge(sessionId, canonicalId, "detected_error");
            if (!sessionsForErrors.has(canonicalId)) sessionsForErrors.set(canonicalId, []);
            sessionsForErrors.get(canonicalId)!.push(sessionId);
            sessionErrors.push(canonicalId);

            // Associate error with session files mentioned near this line
            const nearbyLines = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join(" ");
            const relatedFiles = [...sessionFiles].filter(f => {
              const fileName = f.split("/").pop() || "";
              const baseName = fileName.replace(/\.\w+$/, "");
              return nearbyLines.toLowerCase().includes(fileName.toLowerCase()) ||
                     nearbyLines.toLowerCase().includes(baseName.toLowerCase()) ||
                     nearbyLines.toLowerCase().includes(f.toLowerCase());
            });
            if (relatedFiles.length > 0) {
              errorToFileMap.set(canonicalId, relatedFiles);
              for (const rf of relatedFiles) {
                addNode(rf, "file", rf.split("/").pop() || rf, rf);
                addEdge(canonicalId, rf, "affects");
              }
            }
          }
        }

        // Link errors to fixes/workarounds within same session
        for (const errId of sessionErrors) {
          const errFiles = errorToFileMap.get(errId) || [];
          for (const fixId of sessionFixes) {
            const fixFiles = fixToFileMap.get(fixId) || [];
            const shareFiles = errFiles.some(f => fixFiles.includes(f));
            if (shareFiles || errFiles.length === 0 || fixFiles.length === 0) {
              addEdge(errId, fixId, "resolved_by");
              addAnnotation(errId, "resolution_type", "fix");
            }
          }
          for (const waId of sessionWorkarounds) {
            const waFiles = workaroundToFileMap.get(waId) || [];
            const shareFiles = errFiles.some(f => waFiles.includes(f));
            if (shareFiles || errFiles.length === 0 || waFiles.length === 0) {
              addEdge(errId, waId, "workaround_by");
              addAnnotation(errId, "resolution_type", "workaround");
            }
          }
        }
      } catch {}
    }
  }

  const lessonsDir = path.join(projectPath, config.lessons_dir);
  if (fs.existsSync(lessonsDir)) {
    for (const entry of fs.readdirSync(lessonsDir)) {
      if (!entry.endsWith(".md")) continue;
      const lessonId = entry.replace(".md", "");
      const lessonPath = path.join(lessonsDir, entry);

      addNode(lessonId, "lesson", lessonId, `memory/lessons/${entry}`);

      try {
        const content = fs.readFileSync(lessonPath, "utf-8");

        const { targets: catTargets, tags: catTags } = matchTextToConcepts(content, allMappings);
        for (const target of catTargets) {
          addNode(target, "file", target.split("/").pop() || target, target);
          addEdge(lessonId, target, "lesson_applies_to");
        }
        for (const tag of catTags) {
          addAnnotation(lessonId, "tag", tag);
        }

        const items = parseLessonItems(content);
        for (const item of items) {
          const itemId = `lesson-item:${lessonId}:${item.lineNum}`;
          addNode(itemId, "lesson_item", item.text.slice(0, 200), `memory/lessons/${entry}`, item.lineNum, item.createdAt);

          addEdge(lessonId, itemId, "lesson_contains");

          const { targets: itemTargets, tags: itemTags } = matchTextToConcepts(item.text, allMappings);
          for (const target of itemTargets) {
            addNode(target, "file", target.split("/").pop() || target, target);
            addEdge(itemId, target, "lesson_applies_to");
          }
          for (const tag of itemTags) {
            addAnnotation(itemId, "tag", tag);
          }

          if (item.createdAt && item.createdAt !== "always" && item.createdAt !== "unknown") {
            const matchingSessions = sessionDateIndex.get(item.createdAt) || [];
            for (const sId of matchingSessions) {
              addEdge(itemId, sId, "lesson_learned_in");
            }
          }

          const itemErrorMatch = item.text.match(ERROR_PATTERN);
          if (itemErrorMatch) {
            for (const [errorId, sessionList] of sessionsForErrors) {
              if (sessionList.some(s => item.createdAt && s.startsWith(item.createdAt))) {
                addEdge(itemId, errorId, "learned_from");
              }
            }
          }
        }
      } catch {}
    }
  }

  const skillsDir = path.join(projectPath, config.skills_dir);
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      const skillPath = path.join(skillsDir, entry, "SKILL.md");
      if (!fs.existsSync(skillPath)) continue;
      addNode(entry, "skill", entry, `memory/skills/${entry}/SKILL.md`);
    }
  }

  const sessionIssueMap = new Map<string, string[]>();
  const sessionDecisionMap = new Map<string, string[]>();
  const sessionChangeMap = new Map<string, string[]>();

  const sessionsDir3 = path.join(projectPath, config.sessions_dir);
  if (fs.existsSync(sessionsDir3)) {
    for (const entry of fs.readdirSync(sessionsDir3)) {
      const summaryPath = path.join(sessionsDir3, entry, "summary.md");
      if (!fs.existsSync(summaryPath)) continue;

      const sessionId = entry;
      const dateFromId = entry.split("_")[0];

      try {
        const content = fs.readFileSync(summaryPath, "utf-8");
        const lines = content.split("\n");

        const sessionFiles = new Set<string>();
        let inFilesSection = false;
        for (const line of lines) {
          if (/^## Files Modified$/i.test(line)) {
            inFilesSection = true;
            continue;
          }
          if (/^## /i.test(line) && inFilesSection) {
            inFilesSection = false;
          }
          if (inFilesSection) {
            const pathMatch = line.match(/(?:`([^`]+)`|([\w/.-]+\.\w+))/);
            if (pathMatch) {
              const p = (pathMatch[1] || pathMatch[2]).trim();
              if (p && (p.includes("/") || p.endsWith(".ts") || p.endsWith(".nix") || p.endsWith(".py") || p.endsWith(".rs") || p.endsWith(".go") || p.endsWith(".js") || p.endsWith(".md"))) {
                sessionFiles.add(p);
              }
            }
          }
        }

        const pathPattern = /(?:modules\/[\w-]+\.\w+|extractors\/[\w-]+\.\w+|web\/[\w-]+\.\w+|memory\/[\w/.-]+\.\w+|\.?[\w-]+\.ts|\.?[\w-]+\.nix|\.?[\w-]+\.py)/g;
        for (const m of content.matchAll(pathPattern)) {
          sessionFiles.add(m[0]);
        }

        const sessionIssues: string[] = [];
        const sessionDecisions: string[] = [];
        const sessionChanges: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("#") || line.startsWith("|") || line.startsWith("- `") || line.trim().length < 20) continue;

          for (const pattern of ISSUE_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              const slug = line.trim().slice(0, 60).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
              const issueId = `issue:${sessionId}:${slug}`;
              const label = line.trim().slice(0, 120);
              addNode(issueId, "issue", label, `memory/sessions/${entry}/summary.md`, 0, dateFromId);
              addEdge(sessionId, issueId, "detected_issue");
              sessionIssues.push(issueId);

              const relatedFiles = [...sessionFiles].filter(f => {
                const fileName = f.split("/").pop() || "";
                const baseName = fileName.replace(/\.\w+$/, "");
                return line.toLowerCase().includes(fileName.toLowerCase()) ||
                       line.toLowerCase().includes(baseName.toLowerCase());
              });
              for (const rf of relatedFiles) {
                addNode(rf, "file", rf.split("/").pop() || rf, rf);
                addEdge(issueId, rf, "affects");
              }
              break;
            }
          }

          for (const pattern of DECISION_PATTERNS) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
              const slug = line.trim().slice(0, 60).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
              const decisionId = `decision:${sessionId}:${slug}`;
              const label = line.trim().slice(0, 120);
              addNode(decisionId, "decision", label, `memory/sessions/${entry}/summary.md`, 0, dateFromId);
              addEdge(sessionId, decisionId, "made_decision");
              sessionDecisions.push(decisionId);

              const rationaleMatch = line.match(/\b(because|since|due to|reason|why)\b\s+(.+)/i);
              if (rationaleMatch) {
                addAnnotation(decisionId, "rationale", rationaleMatch[2].trim().slice(0, 200));
              }

              const alternativesMatch = line.match(/\b(over|instead of|rather than)\b\s+(.+)/i);
              if (alternativesMatch) {
                addAnnotation(decisionId, "alternatives", alternativesMatch[2].trim().slice(0, 200));
              }

              const relatedFiles = [...sessionFiles].filter(f => {
                const fileName = f.split("/").pop() || "";
                const baseName = fileName.replace(/\.\w+$/, "");
                return line.toLowerCase().includes(fileName.toLowerCase()) ||
                       line.toLowerCase().includes(baseName.toLowerCase());
              });
              for (const rf of relatedFiles) {
                addNode(rf, "file", rf.split("/").pop() || rf, rf);
                addEdge(decisionId, rf, "applies_to");
              }
              break;
            }
          }

          for (const pattern of CHANGE_PATTERNS) {
            pattern.lastIndex = 0;
            const changeMatch = line.match(pattern);
            if (changeMatch) {
              const slug = line.trim().slice(0, 60).replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
              const changeId = `change:${sessionId}:${slug}`;
              const label = line.trim().slice(0, 120);
              addNode(changeId, "change", label, `memory/sessions/${entry}/summary.md`, 0, dateFromId);
              addEdge(sessionId, changeId, "recorded_change");
              sessionChanges.push(changeId);

              if (changeMatch[0].toLowerCase().includes("replace") || changeMatch[0].toLowerCase().includes("switch")) {
                addAnnotation(changeId, "change_type", "replace");
                if (changeMatch[2]) addAnnotation(changeId, "old_value", changeMatch[2].trim());
                if (changeMatch[3]) addAnnotation(changeId, "new_value", changeMatch[3].trim());
              } else if (changeMatch[0].toLowerCase().includes("add") || changeMatch[0].toLowerCase().includes("create") || changeMatch[0].toLowerCase().includes("new")) {
                addAnnotation(changeId, "change_type", "add");
              } else if (changeMatch[0].toLowerCase().includes("remove") || changeMatch[0].toLowerCase().includes("delete") || changeMatch[0].toLowerCase().includes("drop")) {
                addAnnotation(changeId, "change_type", "remove");
              } else if (changeMatch[0].toLowerCase().includes("refactor") || changeMatch[0].toLowerCase().includes("rewrite")) {
                addAnnotation(changeId, "change_type", "refactor");
              }

              const relatedFiles = [...sessionFiles].filter(f => {
                const fileName = f.split("/").pop() || "";
                const baseName = fileName.replace(/\.\w+$/, "");
                return line.toLowerCase().includes(fileName.toLowerCase()) ||
                       line.toLowerCase().includes(baseName.toLowerCase());
              });
              for (const rf of relatedFiles) {
                addNode(rf, "file", rf.split("/").pop() || rf, rf);
                addEdge(changeId, rf, "affects");
              }
              break;
            }
          }
        }

        for (const issueId of sessionIssues) {
          for (const changeId of sessionChanges) {
            const issueFiles = [...sessionFiles].filter(f => {
              const matchingEdges = edges.filter(e => e.from_id === issueId && e.to_id === f && e.type === "affects");
              return matchingEdges.length > 0;
            });
            const changeFiles = [...sessionFiles].filter(f => {
              const matchingEdges = edges.filter(e => e.from_id === changeId && e.to_id === f && e.type === "affects");
              return matchingEdges.length > 0;
            });
            const shareFiles = issueFiles.some(f => changeFiles.includes(f));
            if (shareFiles || issueFiles.length === 0 || changeFiles.length === 0) {
              const changeTypeAnn = annotations.find(a => a.node_id === changeId && a.key === "change_type");
              const isWorkaround = changeTypeAnn && (changeTypeAnn.value === "replace" || changeTypeAnn.value === "remove");
              addEdge(changeId, issueId, isWorkaround ? "workaround_for" : "resolves");
            }
          }
        }

        for (const decisionId of sessionDecisions) {
          for (const changeId of sessionChanges) {
            const decisionFiles = [...sessionFiles].filter(f => {
              const matchingEdges = edges.filter(e => e.from_id === decisionId && e.to_id === f && e.type === "applies_to");
              return matchingEdges.length > 0;
            });
            const changeFiles = [...sessionFiles].filter(f => {
              const matchingEdges = edges.filter(e => e.from_id === changeId && e.to_id === f && e.type === "affects");
              return matchingEdges.length > 0;
            });
            if (decisionFiles.some(f => changeFiles.includes(f))) {
              addEdge(changeId, decisionId, "implements");
            }
          }
        }

        sessionIssueMap.set(sessionId, sessionIssues);
        sessionDecisionMap.set(sessionId, sessionDecisions);
        sessionChangeMap.set(sessionId, sessionChanges);
      } catch {}
    }
  }

  return { nodes, edges, annotations };
}
