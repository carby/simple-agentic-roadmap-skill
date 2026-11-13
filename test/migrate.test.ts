// update's migrations: text an older template wrote is brought up to date,
// text a user edited is left alone, nothing append-only or generated is ever
// touched, and --dry-run writes nothing. Each test runs in its own temp repo,
// because update works on paths relative to the working directory.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { main } from "../src/cli.ts";
import { PACKAGE_ROOT, TOOLS } from "../src/install.ts";
import { DECISIONS_INTROS, GUIDING_MASK, INDEX_MASK, README_SECTIONS } from "../src/legacy.ts";
import { MIGRATIONS, type Migration, planMigrations } from "../src/migrate.ts";
import { DECISIONS_INTRO, INDEX_BEGIN, openRoadmap } from "../src/model.ts";
import { capture, contains, excludes } from "./helpers.ts";

const home = process.cwd();
let repo: string;
let output: string[] = [];

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "roadmap-migrate-"));
  process.chdir(repo);
  // Pinned through package.json, as a 1.x repo moved to 2.0 is, so init
  // writes the npx form these migrations aim at.
  writeFileSync("package.json", JSON.stringify({ devDependencies: { "simple-agentic-roadmap-skill": "^2.0.0" } }));
});

afterEach(() => {
  process.chdir(home);
  rmSync(repo, { recursive: true, force: true });
});

const read = (path: string) => readFileSync(path, "utf8");

/** Every file under `dir`, with its text. */
function snapshot(dir = "."): Map<string, string> {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
  return new Map(files.map((e) => [join(e.parentPath, e.name), read(join(e.parentPath, e.name))]));
}

/** Turn a fresh roadmap back into what 1.5.0's `init` wrote with the script
 * vendored at tools/roadmap.py. Checked against `git show
 * v1.5.0:assets/template` when this test was written: these lines are the
 * whole difference, outside decisions.md, which is append-only. */
function legacy(): void {
  const readme = read("roadmap/README.md")
    .replace(/^npx --no -- roadmap /gm, "python tools/roadmap.py ")
    .replace(/^`npx --no -- roadmap`, so don't/m, "`tools/roadmap.py`, so don't");
  writeFileSync("roadmap/README.md", readme);
  const config = read("roadmap/roadmap.toml").replace(
    "# Roadmap configuration, read by the roadmap CLI.",
    "# Roadmap configuration, read by roadmap.py.",
  );
  writeFileSync("roadmap/roadmap.toml", config);
}

function initLegacy(): { readme: string; config: string } {
  main(["init"]);
  const fresh = { readme: read("roadmap/README.md"), config: read("roadmap/roadmap.toml") };
  legacy();
  return fresh;
}

test("update migrates a 1.x roadmap's command text to what init writes now", (t) => {
  output = capture(t);
  const fresh = initLegacy();
  contains(read("roadmap/README.md"), "python tools/roadmap.py new <id>");
  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), "Migrated roadmap/README.md: the CLI runs as `npx --no -- roadmap`");
  contains(output.join(""), "Migrated roadmap/roadmap.toml:");
  assert.equal(read("roadmap/README.md"), fresh.readme);
  assert.equal(read("roadmap/roadmap.toml"), fresh.config);
  contains(output.join(""), "Roadmap OK");
});

test("a second update finds nothing to migrate", (t) => {
  output = capture(t);
  initLegacy();
  main(["update"]);
  const after = snapshot("roadmap");
  output.length = 0;
  assert.equal(main(["update"]), 0);
  excludes(output.join(""), "Migrated");
  assert.deepEqual(snapshot("roadmap"), after);
});

test("update --dry-run writes nothing and names what a real run changes", (t) => {
  output = capture(t);
  initLegacy();
  const skill = join(TOOLS.claude as string, "SKILL.md");
  writeFileSync(skill, read(skill).replace(/version: ".*"/, 'version: "1.0.0"'));
  writeFileSync("roadmap/README.md", read("roadmap/README.md").replace(INDEX_BEGIN, `${INDEX_BEGIN}\nstale`));
  const before = snapshot();
  output.length = 0;
  assert.equal(main(["update", "--dry-run"]), 0);
  const dry = output.join("");
  assert.deepEqual(snapshot(), before);
  contains(dry, "Would update .claude/skills/roadmap: roadmap 1.0.0 →");
  contains(dry, "Would migrate roadmap/README.md:");
  contains(dry, "Would migrate roadmap/roadmap.toml:");
  contains(dry, "Would regenerate roadmap/README.md.");
  contains(dry, "Dry run: nothing was written");
  excludes(dry, "Roadmap OK");

  output.length = 0;
  assert.equal(main(["update"]), 0);
  const real = output.join("");
  for (const line of dry.split("\n").filter((l) => l.startsWith("Would "))) {
    const [verb, rest] = [line.split(" ")[1] as string, line.split(" ").slice(2).join(" ")];
    const past = { update: "Updated", migrate: "Migrated", regenerate: "Regenerated" }[verb];
    contains(real, `${past} ${rest}`);
  }
});

test("update leaves command lines and comments a user edited alone", (t) => {
  output = capture(t);
  initLegacy();
  const edited = read("roadmap/README.md")
    .replace("python tools/roadmap.py check ", "python3 tools/roadmap.py check ")
    .replace(/^python tools\/roadmap\.py index .*$/m, "python tools/roadmap.py index   # and commit the result");
  writeFileSync("roadmap/README.md", `${edited}\nRun \`python tools/roadmap.py\` by hand.\n`);
  writeFileSync(
    "roadmap/roadmap.toml",
    read("roadmap/roadmap.toml").replace("read by roadmap.py.", "read by roadmap.py!"),
  );
  main(["update"]);
  const readme = read("roadmap/README.md");
  contains(readme, "python3 tools/roadmap.py check ");
  contains(readme, "npx --no -- roadmap index   # and commit the result");
  contains(readme, "Run `python tools/roadmap.py` by hand.");
  excludes(readme, "python tools/roadmap.py new");
  contains(read("roadmap/roadmap.toml"), "read by roadmap.py!");
});

test("update never touches a decision or the archive", (t) => {
  output = capture(t);
  initLegacy();
  writeFileSync(
    "roadmap/decisions.md",
    `${read("roadmap/decisions.md")}\n## 2026-01-01: Old\n\npython tools/roadmap.py check\n`,
  );
  writeFileSync(
    "roadmap/archive/old.md",
    '+++\nid = "old"\ntitle = "Old"\nfiled = 2026-01-01\nclosed = 2026-01-02\noutcome = "declined"\n+++\n\npython tools/roadmap.py check\n',
  );
  const decisions = read("roadmap/decisions.md");
  const archived = read("roadmap/archive/old.md");
  main(["update"]);
  assert.equal(read("roadmap/decisions.md"), decisions);
  assert.equal(read("roadmap/archive/old.md"), archived);
});

test("a migration aimed at the archive, a decision or a generated block throws", (t) => {
  output = capture(t);
  main(["init"]);
  writeFileSync(
    "roadmap/decisions.md",
    `${read("roadmap/decisions.md")}\n## 2026-01-01: Ship weekly\n\nSmaller releases.\n`,
  );
  const rm = openRoadmap("roadmap");
  const aimed = (files: Migration["files"]): Migration[] => [{ id: "bad", since: "0.0.0", summary: "", files }];
  const touch = (text: string) => `${text}x`;
  assert.throws(() => planMigrations(rm, aimed({ "decisions.md": touch })), /changes an entry/);
  const intro = (text: string) => text.replace("# Decisions", "# Decision log");
  assert.equal(planMigrations(rm, aimed({ "decisions.md": intro })).length, 1);
  assert.throws(() => planMigrations(rm, aimed({ "archive/old.md": touch })), /never touch/);
  assert.throws(() => planMigrations(rm, aimed({ "../README.md": touch })), /never touch/);
  const intoIndex = (text: string) => text.replace(INDEX_BEGIN, `${INDEX_BEGIN}\nx`);
  assert.throws(() => planMigrations(rm, aimed({ "README.md": intoIndex })), /generated block/);
  assert.deepEqual(planMigrations(rm, aimed({ "README.md": (text) => text })), []);
});

test("every shipped migration is a no-op on a fresh roadmap", (t) => {
  output = capture(t);
  main(["init"]);
  assert.deepEqual(planMigrations(openRoadmap("roadmap"), MIGRATIONS), []);
});

test("a 2.1 roadmap.toml learns about reached, once, and keeps its milestones", (t) => {
  output = capture(t);
  main(["init"]);
  const fresh = read("roadmap/roadmap.toml");
  const old = fresh
    .replace(/^# Once one is met.*\n# shipped item.*\n/m, "")
    .replace(/^# alpha = .*\n/m, "")
    .replace(/^\[milestones\]$/m, '[milestones]\nbeta = { title = "B", date = 2026-12-01 }');
  writeFileSync("roadmap/roadmap.toml", old);

  const [planned] = planMigrations(openRoadmap("roadmap"), MIGRATIONS);
  assert.deepEqual(
    planned?.migrations.map((m) => m.id),
    ["milestone-reached"],
  );
  writeFileSync("roadmap/roadmap.toml", planned?.text ?? "");

  contains(read("roadmap/roadmap.toml"), "add `reached = <date>`");
  contains(read("roadmap/roadmap.toml"), 'beta = { title = "B", date = 2026-12-01 }');
  assert.deepEqual(planMigrations(openRoadmap("roadmap"), MIGRATIONS), []);
});

test("update migrates the roadmap next to a symlinked skill", (t) => {
  output = capture(t);
  const fresh = initLegacy();
  rmSync(TOOLS.claude as string, { recursive: true });
  mkdirSync(TOOLS.claude as string);
  symlinkSync(join(PACKAGE_ROOT, "SKILL.md"), join(TOOLS.claude as string, "SKILL.md"));
  output.length = 0;
  assert.equal(main(["update"]), 0);
  contains(output.join(""), "Skipped .claude/skills/roadmap: it is symlinked");
  assert.equal(read("roadmap/README.md"), fresh.readme);
});

/** README.md as an older template wrote it: today's, with each section that
 * template wrote differently swapped for its frozen text. `pick` chooses
 * which of a heading's historical texts to use. */
function olderReadme(text: string, pick: (texts: readonly string[]) => string): string {
  const index = /<!-- BEGIN INDEX[\s\S]*?<!-- END INDEX -->/.exec(text)?.[0] as string;
  const guiding = /^\*\*Guiding principle:\*\*[\s\S]*?(?=\n\n)/m.exec(text)?.[0] as string;
  const parts = text.split(/^(?=#{1,3} )/m);
  return parts
    .map((part, i) => {
      const head = part.split("\n")[0] as string;
      const old = README_SECTIONS[head];
      if (!old) return part;
      const body = pick(old).replace(INDEX_MASK, index).replace(GUIDING_MASK, guiding);
      // A frozen section stops before the newline that ends its last line
      // when another section follows; split here, the part keeps it.
      return i < parts.length - 1 ? `${body}\n` : body;
    })
    .join("");
}

for (const [label, pick] of [
  ["1.0.0", (texts: readonly string[]) => texts[0] as string],
  ["1.1.0", (texts: readonly string[]) => texts.at(-1) as string],
] as const) {
  test(`update brings README sections from ${label} up to today's template`, (t) => {
    output = capture(t);
    main(["init"]);
    const fresh = read("roadmap/README.md");
    const ours = fresh.replace(/^\*\*Guiding principle:\*\*[\s\S]*?(?=\n\n)/m, "**Guiding principle:** ours.");
    const older = olderReadme(ours, pick);
    assert.notEqual(older, ours);
    writeFileSync("roadmap/README.md", older);
    output.length = 0;
    assert.equal(main(["update"]), 0);
    contains(output.join(""), "Migrated roadmap/README.md: sections an older template wrote");
    assert.equal(read("roadmap/README.md"), ours);
  });
}

test("update keeps an older README section the user edited", (t) => {
  output = capture(t);
  main(["init"]);
  const older = olderReadme(read("roadmap/README.md"), (texts) => texts[0] as string);
  const edited = older.replace("## Working on this\n", "## Working on this\n\nOur own note.\n");
  writeFileSync("roadmap/README.md", edited);
  main(["update"]);
  const readme = read("roadmap/README.md");
  contains(readme, "Our own note.");
  // The sections around it still move to today's text.
  contains(readme, "Decisions that belong to no single item");
});

test("update replaces an older decisions.md intro and keeps the entries", (t) => {
  output = capture(t);
  main(["init"]);
  const entries = "## 2026-01-01: Ship weekly\n\nSmaller releases.\n";
  for (const old of DECISIONS_INTROS) {
    writeFileSync("roadmap/decisions.md", `${old.trimEnd()}\n\n${entries}`);
    output.length = 0;
    assert.equal(main(["update"]), 0);
    contains(output.join(""), "Migrated roadmap/decisions.md: the intro above the first decision");
    assert.equal(read("roadmap/decisions.md"), `${DECISIONS_INTRO.trimEnd()}\n\n${entries}`);
  }
  writeFileSync("roadmap/decisions.md", `# Our decisions\n\n${entries}`);
  main(["update"]);
  assert.equal(read("roadmap/decisions.md"), `# Our decisions\n\n${entries}`);
});

test("the frozen texts never include today's template", () => {
  const template = read(join(PACKAGE_ROOT, "assets/template/README.md"));
  for (const texts of Object.values(README_SECTIONS)) {
    for (const text of texts) {
      const head = text.split("\n")[0] as string;
      const today = template.split(/^(?=#{1,3} )/m).find((part) => part.startsWith(`${head}\n`));
      assert.ok(today, `${head} is no longer a heading in the template`);
    }
  }
  assert.ok(!DECISIONS_INTROS.includes(DECISIONS_INTRO));
  assert.deepEqual(planMigrations(openRoadmap(join(PACKAGE_ROOT, "assets/template"))), []);
});
