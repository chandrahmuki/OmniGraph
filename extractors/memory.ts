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

  function addEdge(from: string, to: string, type: string, confidence = "auto") {
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

  return { nodes, edges, annotations };
}
