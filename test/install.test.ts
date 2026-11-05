// init and update: the template, the skill copies with their version stamp,
// and what update leaves alone. Each test runs in its own temp repo, because
// the tool directories are relative to the working directory.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { main } from "../src/cli.ts";
import { PACKAGE_ROOT, stamped, stampedVersion, TOOLS } from "../src/install.ts";
import { INDEX_BEGIN, VERSION } from "../src/model.ts";
import { capture, contains, excludes } from "./helpers.ts";

const home = process.cwd();
let repo: string;
// What main() printed; each test that runs it starts with `output = capture(t)`.
let output: string[] = [];

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "roadmap-install-"));
  process.chdir(repo);
});

afterEach(() => {
  process.chdir(home);
  rmSync(repo, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(path, "utf8");

test("init writes the roadmap and a stamped skill for each tool", (t) => {
  output = capture(t);
  assert.equal(main(["init", "--tools", "claude,agents"]), 0);
  const readme = read("roadmap/README.md");
  contains(readme, "npx --no -- roadmap new <id>");
  excludes(readme, "{{");
  excludes(readme, "python");
  contains(readme, INDEX_BEGIN);
  for (const dir of Object.values(TOOLS)) {
    assert.equal(stampedVersion(dir), VERSION);
    assert.equal(existsSync(join(dir, "references/conventions.md")), true);
    assert.equal(existsSync(join(dir, "assets/template/README.md")), true);
    assert.equal(existsSync(join(dir, "scripts")), false);
  }
  assert.equal(main(["check"]), 0);
});

test("init installs only the tools it is given, claude by default", (t) => {
  output = capture(t);
  assert.equal(main(["init"]), 0);
  assert.equal(existsSync(TOOLS.claude as string), true);
  assert.equal(existsSync(TOOLS.agents as string), false);
});

test("init refuses to overwrite a roadmap or an installed skill", (t) => {
  output = capture(t);
  mkdirSync(TOOLS.claude as string, { recursive: true });
  assert.equal(main(["init"]), 2);
  contains(output.join(""), "refusing to overwrite .claude/skills/roadmap; run `update`");
  assert.equal(existsSync("roadmap"), false);
});

test("init rejects an unknown tool", (t) => {
  output = capture(t);
  assert.equal(main(["init", "--tools", "claude,vim"]), 2);
  contains(output.join(""), "unknown tool(s) vim; choose from claude, agents");
});

test("update refreshes only the installed tools, and reports the old version", (t) => {
  output = capture(t);
  main(["init"]);
  const skill = join(TOOLS.claude as string, "SKILL.md");
  writeFileSync(skill, stamped(read(skill), "1.0.0"));
  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), `Updated .claude/skills/roadmap: roadmap 1.0.0 → ${VERSION}.`);
  assert.equal(stampedVersion(TOOLS.claude as string), VERSION);
  assert.equal(existsSync(TOOLS.agents as string), false);
});

test("update refuses a downgrade unless forced", (t) => {
  output = capture(t);
  main(["init"]);
  const skill = join(TOOLS.claude as string, "SKILL.md");
  writeFileSync(skill, stamped(read(skill), "99.0.0"));
  assert.equal(main(["update"]), 2);
  assert.equal(stampedVersion(TOOLS.claude as string), "99.0.0");
  assert.equal(main(["update", "--force"]), 0);
  assert.equal(stampedVersion(TOOLS.claude as string), VERSION);
});

test("update leaves a symlinked skill alone", (t) => {
  output = capture(t);
  main(["init"]);
  rmSync(TOOLS.claude as string, { recursive: true });
  mkdirSync(TOOLS.claude as string);
  symlinkSync(join(PACKAGE_ROOT, "SKILL.md"), join(TOOLS.claude as string, "SKILL.md"));
  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), "Skipped .claude/skills/roadmap: it is symlinked");
});

test("update regenerates a stale index, and returns check's status", (t) => {
  output = capture(t);
  main(["init"]);
  const readme = read("roadmap/README.md");
  writeFileSync("roadmap/README.md", readme.replace(INDEX_BEGIN, `${INDEX_BEGIN}\nstale`));
  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), "Regenerated roadmap/README.md.");
  assert.equal(read("roadmap/README.md"), readme);

  writeFileSync("roadmap/items/broken.md", "no frontmatter\n");
  assert.equal(main(["update"]), 1);
  contains(output.join(""), "the release notes say what changed");
});

test("update with nothing installed points at init", (t) => {
  output = capture(t);
  assert.equal(main(["update"]), 2);
  contains(output.join(""), "no installed skill in .claude/skills/roadmap or .agents/skills/roadmap");
});

test("stamping replaces an existing version and keeps the rest", () => {
  const skill = read(join(PACKAGE_ROOT, "SKILL.md"));
  const once = stamped(skill, "1.2.3");
  assert.equal(stamped(once, "2.0.0"), stamped(skill, "2.0.0"));
  assert.equal(once.replace('  version: "1.2.3"\n', ""), skill);
});

test("stamping is linear on long runs of indented whitespace", () => {
  const skill = `---\nname: x\nmetadata:\n${"\t\t\n".repeat(50_000)}---\n`;
  const start = performance.now();
  assert.equal(stamped(skill, "1.0.0"), skill.replace("metadata:\n", 'metadata:\n  version: "1.0.0"\n'));
  assert.ok(performance.now() - start < 1000, `${performance.now() - start} < ${1000}`);
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

test("update prints how to migrate a 1.x install, and changes none of it", (t) => {
  output = capture(t);
  main(["init", "--tools", "agents"]);
  const files = legacy();
  output.length = 0;

  assert.equal(main(["update"]), 0);

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
    contains(printed, step);
  }
  for (const [path, text] of Object.entries(files)) assert.equal(read(path), text);
  contains(printed, "Refreshed .agents/skills/roadmap"); // the package's own copies still update
});

test("update with only a 1.x install prints the migration and exits 0", (t) => {
  output = capture(t);
  mkdirSync("roadmap");
  legacy();
  output.length = 0;

  assert.equal(main(["update"]), 0);
  contains(output.join(""), "This repo still has a 1.x install");
});

test("update --tools installs into a tool that has no copy yet", (t) => {
  output = capture(t);
  main(["init"]);
  output.length = 0;

  assert.equal(main(["update", "--tools", "agents"]), 0);

  assert.equal(stampedVersion(TOOLS.agents as string), VERSION);
  contains(output.join(""), `Installed .agents/skills/roadmap: roadmap ${VERSION}.`);
});

test("update --tools refuses a tool whose path is still a submodule", (t) => {
  output = capture(t);
  main(["init", "--tools", "agents"]);
  legacy();

  assert.equal(main(["update", "--tools", "claude"]), 2);
  contains(read(".claude/skills/roadmap/SKILL.md"), "Old rules.");
});

const GITIGNORE_HINT = "to .gitignore.";
const PIN_HINT = "Pin the package: npm install -D simple-agentic-roadmap-skill";

/** A git repo whose .gitignore holds `ignored`, and a package.json that pins the package if `pin`. */
function quickStart(ignored: string[], pin: boolean): void {
  spawnSync("git", ["init", "-q"], { stdio: "ignore" });
  if (ignored.length) writeFileSync(".gitignore", `${ignored.join("\n")}\n`);
  const deps = pin ? { devDependencies: { "simple-agentic-roadmap-skill": "^2.0.0" } } : {};
  writeFileSync("package.json", JSON.stringify({ name: "x", ...deps }));
}

test("init in a bare directory hints at the gitignore and at creating a package.json", (t) => {
  output = capture(t);

  assert.equal(main(["init"]), 0);

  contains(output.join(""), `Add .claude/skills/roadmap ${GITIGNORE_HINT}`);
  contains(output.join(""), "There is no package.json here");
  contains(output.join(""), "Run `npm init -y` first, then `npm install -D simple-agentic-roadmap-skill`.");
  excludes(output.join(""), PIN_HINT);
});

test("init and update name the parent npm would install into without a package.json", (t) => {
  output = capture(t);
  writeFileSync("package.json", "{}");
  mkdirSync("app");
  process.chdir("app");

  assert.equal(main(["init"]), 0);
  contains(output.join(""), `so \`npm install\` installs into ${realpathSync(repo)} instead of this repo`);

  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), `installs into ${realpathSync(repo)} instead`);
});

test("update lists config files that still call roadmap.py, and no prose", (t) => {
  output = capture(t);
  quickStart([".claude/skills/"], true);
  main(["init"]);
  writeFileSync(".pre-commit-config.yaml", "      - id: roadmap\n        entry: python tools/roadmap.py check\n");
  writeFileSync("NOTES.md", "We used to run tools/roadmap.py.\n");
  // The roadmap's own files are the migrations' business, not this report's.
  const config = read("roadmap/roadmap.toml");
  writeFileSync("roadmap/roadmap.toml", config.replace("read by the roadmap CLI.", "read by roadmap.py."));
  spawnSync("git", ["add", "-A"], { stdio: "ignore" });

  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), "These lines still call roadmap.py, which 2.x replaces with `npx --no -- roadmap`:");
  contains(output.join(""), "  .pre-commit-config.yaml:2:        entry: python tools/roadmap.py check");
  excludes(output.join(""), "NOTES.md");
  excludes(output.join(""), "  roadmap/roadmap.toml:");
  contains(output.join(""), "Migrated roadmap/roadmap.toml");
});

test("update says nothing about callers when no config file names roadmap.py", (t) => {
  output = capture(t);
  quickStart([".claude/skills/"], true);
  main(["init"]);
  spawnSync("git", ["add", "-A"], { stdio: "ignore" });
  output.length = 0;
  assert.equal(main(["update"]), 0);
  excludes(output.join(""), "still call roadmap.py");
});

test("init hints at nothing once the README's steps are done", (t) => {
  output = capture(t);
  quickStart([".claude/skills/"], true);

  assert.equal(main(["init"]), 0);

  assert.deepEqual(output.join("").trim().split("\n"), [
    `Created roadmap/ and .claude/skills/roadmap (roadmap ${VERSION}).`,
  ]);
});

test("init hints only at the gitignore when the package is pinned", (t) => {
  output = capture(t);
  quickStart([], true);

  assert.equal(main(["init"]), 0);

  contains(output.join(""), GITIGNORE_HINT);
  excludes(output.join(""), PIN_HINT);
});

test("init hints only at the pin when the tool directories are ignored", (t) => {
  output = capture(t);
  quickStart([".claude/skills/"], false);

  assert.equal(main(["init"]), 0);

  excludes(output.join(""), GITIGNORE_HINT);
  contains(output.join(""), PIN_HINT);
});

test("init names only the tool directories git doesn't ignore yet", (t) => {
  output = capture(t);
  quickStart([".claude/skills/"], true);

  assert.equal(main(["init", "--tools", "claude,agents"]), 0);

  contains(output.join(""), `Add .agents/skills/roadmap ${GITIGNORE_HINT}`);
  excludes(output.join(""), "Add .claude/skills/roadmap");
});
