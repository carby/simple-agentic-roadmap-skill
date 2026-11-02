// init and update: the template, the skill copies with their version stamp,
// and what update leaves alone. Each test runs in its own temp repo, because
// the tool directories are relative to the working directory.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { main } from "../src/cli.ts";
import { PACKAGE_ROOT, stamped, stampedVersion, TOOLS } from "../src/install.ts";
import { INDEX_BEGIN, VERSION } from "../src/model.ts";

const home = process.cwd();
let repo: string;
let output: string[];

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "roadmap-install-"));
  process.chdir(repo);
  output = [];
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(home);
  rmSync(repo, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(path, "utf8");

test("init writes the roadmap and a stamped skill for each tool", () => {
  expect(main(["init", "--tools", "claude,agents"])).toBe(0);
  const readme = read("roadmap/README.md");
  expect(readme).toContain("npx --no -- roadmap new <id>");
  expect(readme).not.toContain("{{");
  expect(readme).not.toContain("python");
  expect(readme).toContain(INDEX_BEGIN);
  for (const dir of Object.values(TOOLS)) {
    expect(stampedVersion(dir)).toBe(VERSION);
    expect(existsSync(join(dir, "references/conventions.md"))).toBe(true);
    expect(existsSync(join(dir, "assets/template/README.md"))).toBe(true);
    expect(existsSync(join(dir, "scripts"))).toBe(false);
  }
  expect(main(["check"])).toBe(0);
});

test("init installs only the tools it is given, claude by default", () => {
  expect(main(["init"])).toBe(0);
  expect(existsSync(TOOLS.claude as string)).toBe(true);
  expect(existsSync(TOOLS.agents as string)).toBe(false);
});

test("init refuses to overwrite a roadmap or an installed skill", () => {
  mkdirSync(TOOLS.claude as string, { recursive: true });
  expect(main(["init"])).toBe(2);
  expect(output.join("")).toContain("refusing to overwrite .claude/skills/roadmap; run `update`");
  expect(existsSync("roadmap")).toBe(false);
});

test("init rejects an unknown tool", () => {
  expect(main(["init", "--tools", "claude,vim"])).toBe(2);
  expect(output.join("")).toContain("unknown tool(s) vim; choose from claude, agents");
});

test("update refreshes only the installed tools, and reports the old version", () => {
  main(["init"]);
  const skill = join(TOOLS.claude as string, "SKILL.md");
  writeFileSync(skill, stamped(read(skill), "1.0.0"));
  output = [];
  expect(main(["update"])).toBe(0);
  expect(output.join("")).toContain(`Updated .claude/skills/roadmap: roadmap 1.0.0 → ${VERSION}.`);
  expect(stampedVersion(TOOLS.claude as string)).toBe(VERSION);
  expect(existsSync(TOOLS.agents as string)).toBe(false);
});

test("update refuses a downgrade unless forced", () => {
  main(["init"]);
  const skill = join(TOOLS.claude as string, "SKILL.md");
  writeFileSync(skill, stamped(read(skill), "99.0.0"));
  expect(main(["update"])).toBe(2);
  expect(stampedVersion(TOOLS.claude as string)).toBe("99.0.0");
  expect(main(["update", "--force"])).toBe(0);
  expect(stampedVersion(TOOLS.claude as string)).toBe(VERSION);
});

test("update leaves a symlinked skill alone", () => {
  main(["init"]);
  rmSync(TOOLS.claude as string, { recursive: true });
  mkdirSync(TOOLS.claude as string);
  symlinkSync(join(PACKAGE_ROOT, "SKILL.md"), join(TOOLS.claude as string, "SKILL.md"));
  output = [];
  expect(main(["update"])).toBe(0);
  expect(output.join("")).toContain("Skipped .claude/skills/roadmap: it is symlinked");
});

test("update regenerates a stale index, and returns check's status", () => {
  main(["init"]);
  const readme = read("roadmap/README.md");
  writeFileSync("roadmap/README.md", readme.replace(INDEX_BEGIN, `${INDEX_BEGIN}\nstale`));
  output = [];
  expect(main(["update"])).toBe(0);
  expect(output.join("")).toContain("Regenerated roadmap/README.md.");
  expect(read("roadmap/README.md")).toBe(readme);

  writeFileSync("roadmap/items/broken.md", "no frontmatter\n");
  expect(main(["update"])).toBe(1);
  expect(output.join("")).toContain("the release notes say what changed");
});

test("update with nothing installed points at init", () => {
  expect(main(["update"])).toBe(2);
  expect(output.join("")).toContain("no installed skill in .claude/skills/roadmap or .agents/skills/roadmap");
});

test("stamping replaces an existing version and keeps the rest", () => {
  const skill = read(join(PACKAGE_ROOT, "SKILL.md"));
  const once = stamped(skill, "1.2.3");
  expect(stamped(once, "2.0.0")).toBe(stamped(skill, "2.0.0"));
  expect(once.replace('  version: "1.2.3"\n', "")).toBe(skill);
});

test("stamping is linear on long runs of indented whitespace", () => {
  const skill = `---\nname: x\nmetadata:\n${"\t\t\n".repeat(50_000)}---\n`;
  const start = performance.now();
  expect(stamped(skill, "1.0.0")).toBe(skill.replace("metadata:\n", 'metadata:\n  version: "1.0.0"\n'));
  expect(performance.now() - start).toBeLessThan(1000);
});

/** A 1.x install: the skill as a submodule at .claude/skills/roadmap, the
 * vendored Python CLI, the merge driver and a workflow on @v1. */
function legacy(): Record<string, string> {
  const files: Record<string, string> = {
    ".gitmodules":
      '[submodule ".claude/skills/roadmap"]\n\tpath = .claude/skills/roadmap\n\turl = https://example.com\n',
    ".claude/skills/roadmap/.git": "gitdir: ../../../.git/modules/.claude/skills/roadmap\n",
    ".claude/skills/roadmap/SKILL.md": "---\nname: roadmap\nmetadata:\n  author: x\n---\nOld rules.\n",
    "tools/roadmap.py": "# the 1.x script\n",
    ".gitattributes": "roadmap/README.md merge=roadmap\n",
    ".github/workflows/roadmap.yml": "      - uses: carby/simple-agentic-roadmap-skill@v1\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  return files;
}

test("update prints how to migrate a 1.x install, and changes none of it", () => {
  main(["init", "--tools", "agents"]);
  const files = legacy();
  output = [];

  expect(main(["update"])).toBe(0);

  const printed = output.join("");
  for (const step of [
    "  git submodule deinit -f .claude/skills/roadmap\n",
    "  git rm -f .claude/skills/roadmap\n",
    "  rm -rf .git/modules/.claude/skills/roadmap\n",
    "  git rm tools/roadmap.py\n",
    "  printf '.claude/skills/\\n.agents/skills/\\n' >> .gitignore\n",
    '  git config merge.roadmap.driver "npx --no -- roadmap merge-driver %O %A %B %P"\n',
    "  npx --no -- roadmap update --tools claude\n",
    "In .github/workflows/roadmap.yml, use carby/simple-agentic-roadmap-skill@v2",
  ]) {
    expect(printed).toContain(step);
  }
  for (const [path, text] of Object.entries(files)) expect(read(path)).toBe(text);
  expect(printed).toContain("Refreshed .agents/skills/roadmap"); // the package's own copies still update
});

test("update with only a 1.x install prints the migration and exits 0", () => {
  mkdirSync("roadmap");
  legacy();
  output = [];

  expect(main(["update"])).toBe(0);
  expect(output.join("")).toContain("This repo still has a 1.x install");
});

test("update --tools installs into a tool that has no copy yet", () => {
  main(["init"]);
  output = [];

  expect(main(["update", "--tools", "agents"])).toBe(0);

  expect(stampedVersion(TOOLS.agents as string)).toBe(VERSION);
  expect(output.join("")).toContain(`Installed .agents/skills/roadmap: roadmap ${VERSION}.`);
});

test("update --tools refuses a tool whose path is still a submodule", () => {
  main(["init", "--tools", "agents"]);
  legacy();

  expect(main(["update", "--tools", "claude"])).toBe(2);
  expect(read(".claude/skills/roadmap/SKILL.md")).toContain("Old rules.");
});
