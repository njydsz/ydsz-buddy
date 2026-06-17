// FILE: localSkills.ts
// Purpose: Scans well-known home directories (Claude, Codex, agents) for SKILL.md files and
//          surfaces them as a normalized list. The Skills view defaults to this source so
//          the user always sees their locally installed skills, even when no provider
//          session is active.
// Layer: Logic
// Exports: listLocalUserSkills

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  type LocalUserSkillDescriptor,
  type LocalUserSkillSource,
  type ListLocalUserSkillsResult,
} from "@remi-code/contracts";

type SkillSearchDir = {
  readonly source: LocalUserSkillSource;
  readonly path: string;
};

const SKILL_FILENAME = "SKILL.md";

const SEARCH_DIRS: ReadonlyArray<SkillSearchDir> = (() => {
  const home = os.homedir();
  return [
    { source: "claude", path: path.join(home, ".claude", "skills") },
    { source: "codex", path: path.join(home, ".codex", "skills") },
    { source: "agents", path: path.join(home, ".agents", "skills") },
    { source: "openclaw", path: path.join(home, ".openclaw", "skills") },
  ];
})();

function normalizeFrontmatterValue(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function stripYamlBlockScalar(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s?/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFrontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const body = match[1] ?? "";
  const lines = body.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  const commitList = () => {
    if (currentKey && currentList) {
      result[currentKey] = stripYamlBlockScalar(currentList.join("\n"));
    }
    currentKey = null;
    currentList = null;
  };

  for (const rawLine of lines) {
    if (rawLine.trim().length === 0) continue;
    const listItem = rawLine.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(listItem[1] ?? "");
      continue;
    }
    commitList();
    const kv = rawLine.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] ?? "";
    const value = kv[2] ?? "";
    if (value.trim().length === 0) {
      currentKey = key;
      currentList = [];
      continue;
    }
    result[key] = value.trim();
    currentKey = null;
    currentList = null;
  }
  commitList();
  return result;
}

function resolveHomepage(frontmatter: Record<string, unknown>): string | undefined {
  const direct = normalizeFrontmatterValue(frontmatter.homepage);
  if (direct) return direct;
  const metadata = frontmatter.metadata;
  if (metadata && typeof metadata === "object") {
    const openclaw = (metadata as Record<string, unknown>).openclaw;
    if (openclaw && typeof openclaw === "object") {
      const homepage = (openclaw as Record<string, unknown>).homepage;
      return normalizeFrontmatterValue(homepage);
    }
  }
  return undefined;
}

async function readSkillDescriptor(
  dir: SkillSearchDir,
  skillDir: string,
): Promise<LocalUserSkillDescriptor | null> {
  const skillPath = path.join(skillDir, SKILL_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
  const frontmatter = parseFrontmatter(raw);
  const name = normalizeFrontmatterValue(frontmatter.name) ?? path.basename(skillDir);
  const description = normalizeFrontmatterValue(frontmatter.description);
  const version = normalizeFrontmatterValue(frontmatter.version);
  const homepage = resolveHomepage(frontmatter);

  return {
    name,
    ...(description ? { description } : {}),
    ...(version ? { version } : {}),
    ...(homepage ? { homepage } : {}),
    path: skillPath,
    source: dir.source,
    sourceDir: skillDir,
    enabled: true,
  };
}

async function listSkillsInDir(dir: SkillSearchDir): Promise<LocalUserSkillDescriptor[]> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await fs.readdir(dir.path, { withFileTypes: true });
  } catch {
    return [];
  }
  const directories = entries.filter((entry) => entry.isDirectory());
  const descriptors = await Promise.all(
    directories.map((entry) => readSkillDescriptor(dir, path.join(dir.path, entry.name))),
  );
  return descriptors.filter(
    (descriptor): descriptor is LocalUserSkillDescriptor => descriptor !== null,
  );
}

export async function listLocalUserSkills(): Promise<ListLocalUserSkillsResult> {
  const lists = await Promise.all(SEARCH_DIRS.map(listSkillsInDir));
  const seen = new Set<string>();
  const skills: LocalUserSkillDescriptor[] = [];
  for (const list of lists) {
    for (const skill of list) {
      const key = `${skill.source}::${skill.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push(skill);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return {
    skills,
    searchedDirs: SEARCH_DIRS.map((dir) => dir.path),
  };
}
