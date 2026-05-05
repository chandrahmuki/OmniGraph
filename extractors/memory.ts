import { ExtractedNode, ExtractedEdge, ExtractResult } from "./generic.ts";

interface MemoryConfig {
  sessions_dir: string;
  lessons_dir: string;
  skills_dir: string;
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

const MODULE_NAMES: Record<string, string> = {
  "ai\\.nix": "modules/ai.nix",
  "backup\\.nix": "modules/backup.nix",
  "bluetooth\\.nix": "modules/bluetooth.nix",
  "btop\\.nix": "modules/btop.nix",
  "dbus\\.nix": "modules/dbus.nix",
  "direnv\\.nix": "modules/direnv.nix",
  "discord\\.nix": "modules/discord.nix",
  "font\\.nix": "modules/font.nix",
  "gaming\\.nix": "modules/gaming.nix",
  "git\\.nix": "modules/git.nix",
  "irc\\.nix": "modules/irc.nix",
  "lutris\\.nix": "modules/lutris.nix",
  "media\\.nix": "modules/media.nix",
  "microfetch\\.nix": "modules/microfetch.nix",
  "nautilus\\.nix": "modules/nautilus.nix",
  "neovim\\.nix": "modules/neovim.nix",
  "nh\\.nix": "modules/nh.nix",
  "niri\\.nix": "modules/niri.nix",
  "noctalia\\.nix": "modules/noctalia.nix",
  "notifications\\.nix": "modules/notifications.nix",
  "obsidian\\.nix": "modules/obsidian.nix",
  "parsec\\.nix": "modules/parsec.nix",
  "pdf\\.nix": "modules/pdf.nix",
  "performance-tuning\\.nix": "modules/performance-tuning.nix",
  "secrets\\.nix": "modules/secrets.nix",
  "tealdeer\\.nix": "modules/tealdeer.nix",
  "terminal\\.nix": "modules/terminal.nix",
  "theme\\.nix": "modules/theme.nix",
  "utils\\.nix": "modules/utils.nix",
  "vscode\\.nix": "modules/vscode.nix",
  "walker\\.nix": "modules/walker.nix",
  "xdg\\.nix": "modules/xdg.nix",
  "yazi\\.nix": "modules/yazi.nix",
  "zellij\\.nix": "modules/zellij.nix",
  "zen-browser\\.nix": "modules/zen-browser.nix",
};

const CONCEPT_TO_MODULE: Record<string, string> = {
  "flake.nix": "flake.nix",
  "home.nix": "home.nix",
  "overlays.nix": "overlays.nix",
  "hardware-configuration": "hosts/system/hardware-configuration.nix",
  "lib/colors": "lib/colors.nix",
  "colors.nix": "lib/colors.nix",
  overlay: "overlays.nix",
  registry: "flake.nix",
  cache: "modules/nh.nix",
  bun: "modules/ai.nix",
  deno: "modules/ai.nix",
  omnigraph: "modules/ai.nix",
};

const PROGRAM_TO_MODULE: Record<string, string> = {
  zellij: "modules/zellij.nix",
  niri: "modules/niri.nix",
  neovim: "modules/neovim.nix",
  nvim: "modules/neovim.nix",
  noctalia: "modules/noctalia.nix",
  walker: "modules/walker.nix",
  "zen-browser": "modules/zen-browser.nix",
  sops: "modules/secrets.nix",
  btrbk: "modules/backup.nix",
  mpv: "modules/media.nix",
  "yt-dlp": "modules/media.nix",
  discord: "modules/discord.nix",
  opencode: "modules/ai.nix",
  "claude-code": "modules/ai.nix",
  "gemini-cli": "modules/ai.nix",
  gaming: "modules/gaming.nix",
  steam: "modules/gaming.nix",
  lutris: "modules/gaming.nix",
  btop: "modules/btop.nix",
  git: "modules/git.nix",
  fish: "modules/terminal.nix",
  foot: "modules/terminal.nix",
  starship: "modules/terminal.nix",
  yazi: "modules/yazi.nix",
  zathura: "modules/pdf.nix",
  thunar: "modules/nautilus.nix",
  nautilus: "modules/nautilus.nix",
  tealdeer: "modules/tealdeer.nix",
  "gpu-screen-recorder": "modules/gaming.nix",
  lact: "modules/gaming.nix",
  dbus: "modules/dbus.nix",
  "dbus-broker": "modules/dbus.nix",
  font: "modules/font.nix",
  obsidian: "modules/obsidian.nix",
  vscode: "modules/vscode.nix",
  nh: "modules/nh.nix",
  direnv: "modules/direnv.nix",
  bluetooth: "modules/bluetooth.nix",
  notifications: "modules/notifications.nix",
  theme: "modules/theme.nix",
  xdg: "modules/xdg.nix",
  backup: "modules/backup.nix",
  utils: "modules/utils.nix",
  irc: "modules/irc.nix",
  parsec: "modules/parsec.nix",
  microfetch: "modules/microfetch.nix",
};

const TRANSVERSE_PATTERNS = [
  /\b(build|cache|overlay|config|crash|fix|migration|install|override|rollback|update|error|block)\b/gi,
];

const INPUT_PATTERN = /inputs\.(\w[\w-]*)/g;
const LESSON_PATTERN = /lessons\/([\w-]+)\.md/g;
const SKILL_PATTERN = /skills\/([\w-]+)/g;

const ITEM_DATE_PATTERN = /^-\s+(\d{4}-\d{2}-\d{2}):\s+(.+)$/;
const ITEM_ALWAYS_PATTERN = /^-\s+Toujours\s*:\s+(.+)$/;
const ITEM_BARE_PATTERN = /^-\s+(.+)$/;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildAllMappings(projectPath: string): Record<string, string> {
  const fs = require("node:fs");
  const path = require("node:path");
  const mappings: Record<string, string> = { ...PROGRAM_TO_MODULE, ...CONCEPT_TO_MODULE };

  const modulesDir = path.join(projectPath, "modules");
  if (fs.existsSync(modulesDir)) {
    for (const file of fs.readdirSync(modulesDir)) {
      if (file.endsWith(".nix")) {
        const name = file.replace(".nix", "");
        if (!mappings[name]) {
          mappings[name] = `modules/${file}`;
        }
      }
    }
  }

  return mappings;
}

function matchTextToModules(
  text: string,
  allMappings: Record<string, string>,
): { modules: Set<string>; tags: Set<string> } {
  const modules = new Set<string>();
  const tags = new Set<string>();

  for (const [term, modPath] of Object.entries(allMappings)) {
    const regex = new RegExp(`\\b${term.replace(/[-]/g, "[-\\s]")}\\b`, "i");
    if (regex.test(text)) {
      modules.add(modPath);
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

  return { modules, tags };
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

function parseSummary(content: string, sessionId: string): {
  modulesModified: string[];
  lessonsProduced: string[];
  skillsProduced: string[];
  inputsReferenced: string[];
  timestamp: string | null;
} {
  const modulesModified = new Set<string>();
  const lessonsProduced = new Set<string>();
  const skillsProduced = new Set<string>();
  const inputsReferenced = new Set<string>();
  let timestamp: string | null = null;

  const genMatch = content.match(/^Generated:\s*(.+)$/m);
  if (genMatch) {
    timestamp = genMatch[1].trim();
  }

  const text = content;

  const explicitPathPattern = /(?:modules\/[\w-]+\.nix|(?:hosts\/system\/)?(?:default|hardware-configuration)\.nix|flake\.nix|home\.nix|overlays\.nix|lib\/colors\.nix)/g;
  for (const m of text.matchAll(explicitPathPattern)) {
    modulesModified.add(m[0]);
  }

  for (const [pattern, modPath] of Object.entries(MODULE_NAMES)) {
    const regex = new RegExp(pattern, "g");
    if (regex.test(text)) {
      modulesModified.add(modPath);
    }
  }

  for (const [name, modPath] of Object.entries(PROGRAM_TO_MODULE)) {
    const regex = new RegExp(`\\b${name.replace(/[-]/g, "[-\\s]")}\\b`, "i");
    if (regex.test(text)) {
      modulesModified.add(modPath);
    }
  }

  for (const [concept, modPath] of Object.entries(CONCEPT_TO_MODULE)) {
    if (concept.length < 4) continue;
    const regex = new RegExp(`\\b${concept.replace(/[-]/g, "[-\\s]")}\\b`, "i");
    if (regex.test(text)) {
      modulesModified.add(modPath);
    }
  }

  for (const m of text.matchAll(INPUT_PATTERN)) {
    inputsReferenced.add(m[1]);
  }

  for (const m of text.matchAll(LESSON_PATTERN)) {
    lessonsProduced.add(m[1]);
  }
  if (text.match(/lessons?\s*(?:learned|system|categorized|created|updated)/i)) {
    for (const l of ["neovim", "nix-flakes", "nix-build", "nix-modules", "git-workflow", "nixos-store", "dev-tools"]) {
      if (text.toLowerCase().includes(l.split("-").pop()!)) {
        lessonsProduced.add(l);
      }
    }
  }

  for (const m of text.matchAll(SKILL_PATTERN)) {
    skillsProduced.add(m[1]);
  }
  if (text.match(/skill/i) && !skillsProduced.size) {
    if (text.match(/snapshot/i)) skillsProduced.add("snapshot");
    if (text.match(/project-map/i)) skillsProduced.add("project-map");
  }

  const commitPattern = /`[a-f0-9]{6,}`\s+\w+(?:\([\w-]+\))?:\s+(.+)/g;
  for (const m of text.matchAll(commitPattern)) {
    const msg = m[1];
    for (const [name, modPath] of Object.entries(PROGRAM_TO_MODULE)) {
      if (msg.toLowerCase().includes(name.toLowerCase())) {
        modulesModified.add(modPath);
      }
    }
    for (const [concept, modPath] of Object.entries(CONCEPT_TO_MODULE)) {
      if (concept.length >= 4 && msg.toLowerCase().includes(concept.toLowerCase())) {
        modulesModified.add(modPath);
      }
    }
  }

  return {
    modulesModified: [...modulesModified],
    lessonsProduced: [...lessonsProduced],
    skillsProduced: [...skillsProduced],
    inputsReferenced: [...inputsReferenced],
    timestamp,
  };
}

export function extractMemory(
  projectPath: string,
  config: MemoryConfig,
): ExtractResultWithAnnotations {
  const fs = require("node:fs");
  const path = require("node:path");
  const nodes: ExtractedNode[] = [];
  const edges: ExtractedEdge[] = [];
  const annotations: ExtractedAnnotation[] = [];

  const allMappings = buildAllMappings(projectPath);

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
        const parsed = parseSummary(content, sessionId);

        addNode(sessionId, "session", sessionId, `memory/sessions/${entry}/summary.md`, 0, parsed.timestamp || dateFromId);

        for (const mod of parsed.modulesModified) {
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

        const { modules: catModules, tags: catTags } = matchTextToModules(content, allMappings);
        for (const mod of catModules) {
          addNode(mod, "file", mod.split("/").pop() || mod, mod);
          addEdge(lessonId, mod, "lesson_applies_to");
        }
        for (const tag of catTags) {
          addAnnotation(lessonId, "tag", tag);
        }

        const items = parseLessonItems(content);
        for (const item of items) {
          const itemId = `lesson-item:${lessonId}:${item.lineNum}`;
          addNode(itemId, "lesson_item", item.text.slice(0, 200), `memory/lessons/${entry}`, item.lineNum, item.createdAt);

          addEdge(lessonId, itemId, "lesson_contains");

          const { modules: itemModules, tags: itemTags } = matchTextToModules(item.text, allMappings);
          for (const mod of itemModules) {
            addNode(mod, "file", mod.split("/").pop() || mod, mod);
            addEdge(itemId, mod, "lesson_applies_to");
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