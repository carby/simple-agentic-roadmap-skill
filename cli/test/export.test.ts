// `export` prints the whole roadmap as one JSON document for a GUI, and every
// `--json` keeps the same contract: one document on stdout whatever happens.
// The shape guard at the end fails when a field the schema promises goes
// missing or changes type without SCHEMA moving.

import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SCHEMA } from "../src/json.ts";
import {
  closedMeta,
  FIXTURES,
  git,
  gitRepo,
  itemText,
  makeRoadmap,
  openMeta,
  Raw,
  type Result,
  run,
  tempDir,
  validCopy,
  write,
} from "./helpers.ts";

// biome-ignore lint/suspicious/noExplicitAny: a parsed JSON document, checked field by field
type Doc = Record<string, any>;

const MILESTONES = `[milestones]
beta = { title = "Public beta", date = 2026-12-01, reached = 2026-12-03 }
v3 = { title = "3.0", date = 2027-02-01 }
`;

/** A roadmap with an item in each state, both kinds of milestone, and an
 * archived item an open one depends on. Returns the directory to run in. */
function rich(extra: Record<string, string> = {}, toml = MILESTONES): string {
  const root = tempDir();
  makeRoadmap(root, {
    "roadmap.toml": toml,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", milestone: ["v3"] })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", rank: 2, depends_on: ["a", "old"] })),
    "items/c.md": itemText(openMeta({ id: "c", title: "C", bucket: "next", depends_on: ["v3"] })),
    "items/d.md": itemText(openMeta({ id: "d", title: "D", bucket: "next", rank: 2, depends_on: ["beta"] })),
    "items/e.md": itemText(openMeta({ id: "e", title: "E", bucket: "later", blocked_on: "which way" })),
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old", milestone: "beta", shipped_as: "#1" })),
    ...extra,
  });
  return root;
}

function exported(cwd: string, args: string[] = []): [Doc, Result] {
  const result = run(["export", ...args], cwd);
  return [JSON.parse(result.stdout), result];
}

const byId = (doc: Doc) => Object.fromEntries(doc.items.map((i: Doc) => [i.id, i]));

test("export holds the open items in queue order, with readiness and edges", () => {
  const root = rich();
  const [doc, result] = exported(root);
  const items = byId(doc);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual([doc.schema, doc.ok, doc.warnings], [1, true, []]);
  assert.deepEqual(
    doc.items.map((i: Doc) => i.id),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(
    doc.items.map((i: Doc) => i.state),
    ["ready", "waiting", "waiting", "ready", "later"],
  );
  assert.deepEqual(items.b.waits_on, { items: ["a"], milestones: [] });
  assert.deepEqual(items.c.waits_on, { items: [], milestones: ["v3"] });
  assert.deepEqual(items.d.waits_on, { items: [], milestones: [] }); // beta is reached
  assert.deepEqual(items.a.dependents, ["b"]);
  assert.deepEqual(items.b.depends_on, ["a", "old"]);
  assert.deepEqual(items.a.due, ["v3"]);
  assert.equal(items.a.path, "items/a.md");
  assert.equal(items.a.archived, false);
  assert.equal(items.a.body, "\nProse.\n");
  assert.equal(items.a.frontmatter.filed, "2026-09-06");
  assert.equal(doc.dir, join(realpathSync(root), "roadmap"));
});

test("export holds the archived items and milestones, with edges into the archive", () => {
  const [doc] = exported(rich());
  const [old] = doc.archived;

  assert.equal(old.id, "old");
  assert.equal(old.archived, true);
  assert.equal(old.path, "archive/old.md");
  assert.equal(old.frontmatter.milestone, "beta"); // as written
  assert.deepEqual(old.due, ["beta"]); // normalised
  assert.deepEqual(old.dependents, ["b"]);
  assert.equal("state" in old, false);
  assert.deepEqual(doc.milestones, [
    { id: "beta", title: "Public beta", date: "2026-12-01", reached: "2026-12-03", due: ["old"], waiting: ["d"] },
    { id: "v3", title: "3.0", date: "2027-02-01", reached: null, due: ["a"], waiting: ["c"] },
  ]);
});

test("export outside git has no git state and no commit dates", () => {
  const [doc] = exported(rich());

  assert.equal(doc.git, null);
  assert.equal(byId(doc).a.committed, null);
});

test("export in git gives each file's last commit, the branch and whether it is clean", () => {
  const root = gitRepo(rich());
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "roadmap");
  let [doc] = exported(root);

  assert.deepEqual(doc.git, { branch: "master", clean: true });
  assert.match(byId(doc).a.committed, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(doc.archived[0].committed, /^\d{4}-\d{2}-\d{2}$/);

  write(join(root, "roadmap/items/f.md"), itemText(openMeta({ id: "f", title: "F", bucket: "next", rank: 3 })));
  [doc] = exported(root);
  assert.deepEqual(doc.git, { branch: "master", clean: false });
  assert.equal(byId(doc).f.committed, null); // untracked

  git(root, "checkout", "-q", "--detach");
  [doc] = exported(root);
  assert.equal(doc.git.branch, null);
});

test("export on a branch with no commits yet still names it", () => {
  const root = gitRepo(rich());
  const [doc] = exported(root);

  assert.deepEqual(doc.git, { branch: "master", clean: false });
});

test("an item with an invalid bucket or rank sorts last, with no state", () => {
  const root = tempDir();
  makeRoadmap(
    root,
    {
      "items/a.md": itemText(openMeta({ id: "a", title: "A", rank: new Raw("nan") })),
      "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "soon" })),
      "items/c.md": itemText(openMeta({ id: "c", title: "C" })),
    },
    { sync: false },
  );
  const [doc, result] = exported(root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    doc.items.map((i: Doc) => i.id),
    ["c", "a", "b"],
  );
  assert.equal(byId(doc).b.state, null);
  assert.equal(byId(doc).a.frontmatter.rank, "nan"); // still valid JSON
});

test("a file that won't parse is left out of export with a warning, and fails list --json", () => {
  const root = rich({ "items/broken.md": "no frontmatter\n" });
  const [doc, result] = exported(root);

  assert.equal(result.status, 0);
  assert.equal(doc.ok, true);
  assert.deepEqual(doc.unreadable, [
    { path: "items/broken.md", message: "no +++-fenced TOML frontmatter at the top of the file" },
  ]);
  assert.match(doc.warnings[0], /items\/broken\.md/);

  const list = run(["list", "--json"], root);
  const failed = JSON.parse(list.stdout);
  assert.equal(list.status, 1);
  assert.equal(list.stderr, "");
  assert.deepEqual([failed.ok, failed.rule], [false, "frontmatter"]);
  assert.equal(failed.problems[0].rule, "frontmatter");
});

test("the pin warning goes into the document, not stderr", () => {
  const root = rich({}, `version = "1.0.0"\n${MILESTONES}`);
  for (const args of [["export"], ["list", "--json"]]) {
    const result = run(args, root);
    assert.equal(result.stderr, "", args.join(" "));
    assert.match(JSON.parse(result.stdout).warnings[0], /pins roadmap 1\.0\.0/);
  }
});

for (const args of [
  ["list", "--json", "--bucket", "bogus"],
  ["list", "--bucket", "bogus", "--json"],
  ["list", "--json=x"],
  ["list", "--js", "--nope"],
  ["check", "--json"],
  ["export", "--nope"],
]) {
  test(`a usage error with --json is a JSON document: ${args.join(" ")}`, () => {
    const result = run(args, validCopy(tempDir()));
    const doc = JSON.parse(result.stdout);

    assert.equal(result.status, 2);
    assert.equal(result.stderr, "");
    assert.deepEqual([doc.schema, doc.ok, doc.rule], [1, false, "usage"]);
    assert.equal(typeof doc.message, "string");
  });
}

test("a missing roadmap fails instead of reading as empty", () => {
  const root = validCopy(tempDir());
  for (const dir of ["nope", "src"]) {
    const doc = JSON.parse(run(["export", "--dir", dir], root).stdout);
    assert.deepEqual([doc.ok, doc.rule], [false, "no-roadmap"], dir);
    assert.equal(run(["export", "--dir", dir], root).status, 2);
    assert.equal(JSON.parse(run(["list", "--json", "--dir", dir], root).stdout).rule, "no-roadmap");
  }
  const text = run(["list", "--dir", "nope"], root);
  assert.equal(text.status, 2);
  assert.equal(text.stdout, "");
  assert.match(text.stderr, /^error: no roadmap at nope/);
});

test("a malformed roadmap.toml is a config failure", () => {
  const root = rich();
  write(join(root, "roadmap/roadmap.toml"), "nonsense = 1\n");
  const result = run(["export"], root);
  const doc = JSON.parse(result.stdout);

  assert.equal(result.status, 2);
  assert.deepEqual([doc.ok, doc.rule], [false, "config"]);
  assert.equal(doc.message.endsWith("[config]"), false);
});

// --- the shape guard -----------------------------------------------------------

/** Every key path in a document and the JSON types seen there. An array's
 * elements share the path `<path>[]`; `frontmatter` is opaque, because a
 * roadmap may declare its own fields. */
function shapeOf(value: unknown, path: string, into: Map<string, Set<string>>): void {
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  into.set(path, (into.get(path) ?? new Set()).add(kind));
  if (path.endsWith(".frontmatter")) return;
  if (Array.isArray(value)) for (const v of value) shapeOf(v, `${path}[]`, into);
  else if (kind === "object") for (const [k, v] of Object.entries(value as object)) shapeOf(v, `${path}.${k}`, into);
}

function shapes(docs: Doc[]): Record<string, string> {
  const into = new Map<string, Set<string>>();
  for (const doc of docs) shapeOf(doc, "$", into);
  return Object.fromEntries(
    [...into].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, t]) => [p, [...t].sort().join("|")]),
  );
}

test(`the documents keep the shape json-schema-${SCHEMA}.json records`, () => {
  // Between them, these set every nullable field both ways and fill every array.
  const plain = rich(
    {
      "items/broken.md": "no frontmatter\n",
      "items/odd.md": itemText(openMeta({ id: "odd", title: "Odd", bucket: "soon" })),
      "archive/older.md": itemText(closedMeta({ id: "older", title: "Older", depends_on: ["old"] })),
    },
    `version = "1.0.0"\n${MILESTONES}`,
  );
  const committed = gitRepo(rich());
  git(committed, "add", "-A");
  git(committed, "commit", "-q", "-m", "roadmap");
  const detached = gitRepo(rich());
  git(detached, "add", "-A");
  git(detached, "commit", "-q", "-m", "roadmap");
  git(detached, "checkout", "-q", "--detach");
  const observed = {
    export: shapes([plain, committed, detached].map((cwd) => exported(cwd)[0])),
    failure: shapes([
      JSON.parse(run(["list", "--json", "--bogus"], plain).stdout),
      JSON.parse(run(["list", "--json"], plain).stdout),
    ]),
  };
  const file = join(FIXTURES, `json-schema-${SCHEMA}.json`);
  // To record a new schema's shape, bump SCHEMA and run this test once with
  // WRITE_JSON_SHAPE=1; never rewrite the file for a schema that has shipped.
  if (process.env.WRITE_JSON_SHAPE) writeFileSync(file, `${JSON.stringify(observed, null, 2)}\n`);
  const recorded = JSON.parse(readFileSync(file, "utf8")) as typeof observed;

  for (const kind of ["export", "failure"] as const) {
    for (const [path, types] of Object.entries(recorded[kind])) {
      assert.equal(
        observed[kind][path],
        types,
        `${kind} ${path} was ${types}; a removed or retyped field needs a new SCHEMA (see docs/json.md)`,
      );
    }
  }
});
