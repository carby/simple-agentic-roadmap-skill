/** `init` and `update`: set up a roadmap, and copy the skill into each AI
 * tool's skills directory from this package, the way OpenSpec installs its
 * own. Nothing is vendored: every command runs through the package's bin, so
 * the version is pinned once, in the repo's package.json. */

import { cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join as joinPath, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type Args, cmdCheck, err, out } from "./commands.ts";
import { load, type Roadmap, UsageError, VERSION } from "./model.ts";
import { exists, isDir, isFile } from "./pathlib.ts";
import { readText, repr } from "./py.ts";
import { writeGenerated } from "./render.ts";
import { validate } from "./rules.ts";

/** The package's root: `src/..` in tests, `dist/..` once built. */
export const PACKAGE_ROOT = joinPath(dirname(fileURLToPath(import.meta.url)), "..");

/** Where each tool loads skills from, relative to the repo root. Adding a
 * tool is one row. `agents` is the shared directory OpenSpec writes for
 * Codex, Amp, Antigravity and GSD. */
export const TOOLS: Record<string, string> = {
  claude: ".claude/skills/roadmap",
  agents: ".agents/skills/roadmap",
};

/** What a tool's copy of the skill holds. No scripts: commands go through the bin. */
const PAYLOAD = ["SKILL.md", "references", "assets"];

/** How the generated files and the template name the CLI. */
export const COMMAND = "npx --no -- roadmap";

/** Where SKILL.md's frontmatter keeps the version: the index of its
 * `metadata:` line, and of the `version:` line in that block, if any. Scanned
 * line by line rather than with one regex, which backtracks badly on runs of
 * indented whitespace. */
function stampLines(lines: string[]): { metadata: number; version: number | null } | null {
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const metadata = lines.indexOf("metadata:", 1);
  if (metadata < 0 || metadata > end) return null;
  for (let i = metadata + 1; i < end; i++) {
    const line = lines[i] as string;
    if (!(line.startsWith(" ") || line.startsWith("\t"))) break;
    if (line.trimStart().startsWith("version:")) return { metadata, version: i };
  }
  return { metadata, version: null };
}

function versionValue(line: string): string {
  const value = line.trimStart().slice("version:".length).trim();
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

/** SKILL.md with the package version stamped into its frontmatter, so an
 * agent can compare the skill it loaded with `npx --no -- roadmap --version`. */
export function stamped(skill: string, version = VERSION): string {
  const lines = skill.split("\n");
  const at = stampLines(lines);
  if (at === null) {
    throw new UsageError("SKILL.md has no metadata: block in its frontmatter to stamp the version into");
  }
  const stamp = `  version: "${version}"`;
  if (at.version === null) lines.splice(at.metadata + 1, 0, stamp);
  else lines[at.version] = stamp;
  return lines.join("\n");
}

/** The version a tool's copy of the skill was stamped with, if any. */
export function stampedVersion(skillDir: string): string | null {
  const path = joinPath(skillDir, "SKILL.md");
  if (!isFile(path)) return null;
  const lines = readText(path).split("\n");
  const at = stampLines(lines);
  return at?.version == null ? null : versionValue(lines[at.version] as string);
}

function versionKey(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number);
}

function newer(a: string, b: string): boolean {
  const [x, y] = [versionKey(a), versionKey(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

function parseTools(text: string): string[] {
  const names = text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const unknown = names.filter((t) => !(t in TOOLS));
  if (unknown.length || !names.length) {
    throw new UsageError(
      `unknown tool(s) ${unknown.join(", ") || repr(text)}; choose from ${Object.keys(TOOLS).join(", ")}`,
    );
  }
  return [...new Set(names)];
}

/** Copy the skill into `skillDir`, replacing whatever was there. */
function installSkill(skillDir: string): void {
  rmSync(skillDir, { recursive: true, force: true });
  mkdirSync(skillDir, { recursive: true });
  for (const entry of PAYLOAD) {
    const src = joinPath(PACKAGE_ROOT, entry);
    const dest = joinPath(skillDir, entry);
    if (entry === "SKILL.md") writeFileSync(dest, stamped(readText(src)));
    else cpSync(src, dest, { recursive: true });
  }
}

/** A tool directory set up by hand as symlinks, as this repo does to
 * dogfood its working copy. `update` leaves it alone. */
function linked(skillDir: string): boolean {
  for (const path of [skillDir, joinPath(skillDir, "SKILL.md")]) {
    try {
      if (lstatSync(path).isSymbolicLink()) return true;
    } catch {
      // missing: not a link
    }
  }
  return false;
}

function templateFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, joinPath(e.parentPath, e.name)))
    .sort();
}

export function cmdInit(rm: Roadmap, args: Args): number {
  const template = joinPath(PACKAGE_ROOT, "assets", "template");
  if (!isDir(template)) throw new UsageError(`the package is missing its template at ${template}`);
  const tools = parseTools(args.tools);
  const sources = templateFiles(template);
  const targets = sources.map((src) => [joinPath(template, src), joinPath(rm.dir, src)] as const);
  const skillDirs = tools.map((t) => TOOLS[t] as string);
  const clashes = [...targets.map(([, dest]) => dest).filter(exists), ...skillDirs.filter(exists)];
  if (clashes.length) {
    throw new UsageError(
      `refusing to overwrite ${clashes.join(", ")}${skillDirs.some(exists) ? "; run `update` to refresh an installed skill" : ""}`,
    );
  }

  for (const [src, dest] of targets) {
    mkdirSync(dirname(dest), { recursive: true });
    if (src.endsWith(".md") || src.endsWith(".toml"))
      writeFileSync(dest, readText(src).replaceAll("{{command}}", COMMAND).replaceAll("{{script}}", COMMAND));
    else cpSync(src, dest);
  }
  for (const dir of skillDirs) installSkill(dir);
  writeGenerated(rm);
  out(`Created ${rm.dir}/ and ${skillDirs.join(", ")} (roadmap ${VERSION}).`);
  out(`Add ${skillDirs.join(" and ")} to .gitignore, and pin the package: npm install -D simple-agentic-roadmap-skill`);
  return 0;
}

const VENDORED = "tools/roadmap.py";

/** Whether `dir` is a git submodule: named in .gitmodules, or holding the
 * `.git` file a submodule checkout has. */
function submodule(dir: string): boolean {
  if (exists(joinPath(dir, ".git"))) return true;
  if (!isFile(".gitmodules")) return false;
  return readText(".gitmodules")
    .split("\n")
    .some((line) => /^\s*path\s*=\s*(.+?)\s*$/.exec(line)?.[1] === dir);
}

/** What a 1.x install left behind: the skill as a submodule in a tool's
 * directory, and the vendored Python CLI. */
export function legacyInstalls(): { submodules: string[]; vendored: boolean } {
  return { submodules: Object.values(TOOLS).filter(submodule), vendored: isFile(VENDORED) };
}

/** The commands that move a 1.x install to the package. `update` prints
 * them and runs none: they delete files and rewrite git config. */
function migrationSteps(submodules: string[], vendored: boolean): string[] {
  const steps: string[] = [];
  for (const dir of submodules) {
    steps.push(`git submodule deinit -f ${dir}`, `git rm -f ${dir}`, `rm -rf .git/modules/${dir}`);
  }
  if (vendored) steps.push(`git rm ${VENDORED}`);
  if (submodules.length) steps.push(`printf '.claude/skills/\\n.agents/skills/\\n' >> .gitignore`);
  if (isFile(".gitattributes") && readText(".gitattributes").includes("merge=roadmap")) {
    steps.push(`git config merge.roadmap.driver "${COMMAND} merge-driver %O %A %B %P"`);
  }
  const tools = Object.entries(TOOLS)
    .filter(([, dir]) => submodules.includes(dir))
    .map(([tool]) => tool);
  if (tools.length) steps.push(`${COMMAND} update --tools ${tools.join(",")}`);
  const workflows = isDir(".github/workflows")
    ? readdirSync(".github/workflows")
        .map((name) => joinPath(".github/workflows", name))
        .filter((path) => isFile(path) && readText(path).includes("simple-agentic-roadmap-skill@v1"))
    : [];
  const lines = [
    "This repo still has a 1.x install, which update leaves alone. To move it to the npm package, run:",
    ...steps.map((step) => `  ${step}`),
  ];
  for (const path of workflows) {
    lines.push(`In ${path}, use carby/simple-agentic-roadmap-skill@v2 and drop its \`script:\` input.`);
  }
  lines.push("Then commit. The CHANGELOG's 2.0.0 entry has the details.");
  return lines;
}

export function cmdUpdate(rm: Roadmap, args: Args): number {
  const legacy = legacyInstalls();
  const requested = args.tools === null ? [] : parseTools(args.tools).map((t) => TOOLS[t] as string);
  const clashing = requested.filter((dir) => legacy.submodules.includes(dir));
  if (clashing.length) {
    throw new UsageError(`${clashing.join(", ")} is a git submodule; remove it first (run \`update\` to see how)`);
  }
  const installed = Object.values(TOOLS).filter(
    (dir) => requested.includes(dir) || (!legacy.submodules.includes(dir) && isFile(joinPath(dir, "SKILL.md"))),
  );
  const migrating = legacy.submodules.length > 0 || legacy.vendored;
  if (migrating) for (const line of migrationSteps(legacy.submodules, legacy.vendored)) out(line);
  if (!installed.length) {
    if (migrating) return 0;
    throw new UsageError(
      `no installed skill in ${Object.values(TOOLS).join(" or ")}; run \`update --tools ${Object.keys(TOOLS).join(",")}\`` +
        `, or \`init --tools …\` to set up a roadmap too`,
    );
  }
  for (const dir of installed) {
    if (linked(dir)) {
      out(`Skipped ${dir}: it is symlinked, so it already follows its target.`);
      continue;
    }
    const old = stampedVersion(dir);
    if (old !== null && newer(old, VERSION) && !args.force) {
      throw new UsageError(`${dir} is roadmap ${old}, newer than this ${VERSION}; pass --force to downgrade`);
    }
    const fresh = !isFile(joinPath(dir, "SKILL.md"));
    installSkill(dir);
    out(
      fresh
        ? `Installed ${dir}: roadmap ${VERSION}.`
        : old === VERSION
          ? `Refreshed ${dir}: roadmap ${VERSION}.`
          : `Updated ${dir}: roadmap ${old ?? "unknown"} → ${VERSION}.`,
    );
  }
  if (!isDir(rm.dir)) return 0;
  // A release may render the index differently. The generated blocks are
  // never edited by hand, so rewrite them now rather than leave `check` to
  // report them stale. A roadmap the new rules reject is left alone, as
  // `index` would leave it, and `check` reports why.
  const [items, archived, problems] = load(rm);
  if (!problems.length && !validate(rm, items, archived).length) {
    try {
      const written = writeGenerated(rm);
      if (written.length) out(`Regenerated ${written.join(", ")}.`);
    } catch (exc) {
      if (!(exc instanceof UsageError) && !(exc instanceof Error && "code" in exc)) throw exc;
      // missing files or markers; `check` reports them
    }
  }
  const code = cmdCheck(rm, { base: null });
  if (code) err("Some of these may come from rule changes; the release notes say what changed.");
  return code;
}
