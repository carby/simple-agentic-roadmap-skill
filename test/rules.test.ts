// One case per rule, each breaking exactly one thing. Every tag in RULES has
// to be covered either here or in append-only.test.ts, so a new rule cannot
// land untested.

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { check } from "../src/commands.ts";
import { ConfigError, openRoadmap, PLACEHOLDER, RULES } from "../src/model.ts";
import { join as pathJoin } from "../src/pathlib.ts";
import {
  closedMeta,
  contains,
  D,
  DONE,
  each,
  itemText,
  makeRoadmap,
  openMeta,
  Raw,
  README,
  tempDir,
  throwsWith,
} from "./helpers.ts";

const MILESTONES =
  '[milestones]\nalpha = { title = "Alpha", date = 2026-11-01 }\nbeta = { title = "Beta", date = 2026-12-01 }\n';

type Case = [id: string, rule: string, expected: string, files: Record<string, string>];

const CASES: Case[] = [
  ["no-fence", "frontmatter", "no +++-fenced TOML frontmatter", { "items/sample.md": "Just prose.\n" }],
  ["bad-toml", "frontmatter", "malformed TOML frontmatter", { "items/sample.md": '+++\nid = "broken\n+++\nBody.\n' }],
  ["missing", "schema", "missing required field(s) title", { "items/sample.md": itemText(openMeta({ title: null })) }],
  ["unknown", "schema", "unknown field(s) urgency", { "items/sample.md": itemText(openMeta({ urgency: "high" })) }],
  ["id-mismatch", "schema", "does not match its filename", { "items/sample.md": itemText(openMeta({ id: "other" })) }],
  [
    "not-a-slug",
    "schema",
    "is not a kebab-case slug",
    { "items/Sample_It.md": itemText(openMeta({ id: "Sample_It" })) },
  ],
  [
    "empty-title",
    "schema",
    "title must be a non-empty string",
    { "items/sample.md": itemText(openMeta({ title: " " })) },
  ],
  [
    "archived-queue-field",
    "schema",
    "queue field(s) bucket belong to open items",
    { "archive/sample.md": itemText(closedMeta({ bucket: "now" })) },
  ],
  [
    "bad-outcome",
    "schema",
    "outcome 'done' is not one of shipped, declined",
    { "archive/sample.md": itemText(closedMeta({ outcome: "done" })) },
  ],
  [
    "archived-missing",
    "schema",
    "missing required field(s) closed",
    { "archive/sample.md": itemText(closedMeta({ closed: null })) },
  ],
  [
    "bad-bucket",
    "bucket",
    "is not one of now, next, later",
    { "items/sample.md": itemText(openMeta({ bucket: "someday" })) },
  ],
  [
    "later-unblocked",
    "bucket",
    "must name what it is blocked_on",
    { "items/sample.md": itemText(openMeta({ bucket: "later" })) },
  ],
  [
    // The roadmap tracks priority, not who is working on what.
    "no-wip-tracking",
    "schema",
    "unknown field(s) claimed",
    { "items/sample.md": itemText(openMeta({ bucket: "next", claimed: D(2026, 9, 7) })) },
  ],
  [
    "next-blocked",
    "bucket",
    "blocked_on belongs to a 'later' item; this one is 'next'",
    { "items/sample.md": itemText(openMeta({ bucket: "next", blocked_on: "a call" })) },
  ],
  [
    "now-blocked",
    "bucket",
    "blocked_on belongs to a 'later' item",
    { "items/sample.md": itemText(openMeta({ blocked_on: "a call" })) },
  ],
  ["zero-rank", "rank", "rank must be a positive integer", { "items/sample.md": itemText(openMeta({ rank: 0 })) }],
  [
    "shared-rank",
    "rank",
    "rank 1 is already taken in 'now'",
    { "items/sample.md": itemText(openMeta()), "items/other.md": itemText(openMeta({ id: "other" })) },
  ],
  [
    "supersedes-shipped",
    "supersedes",
    "supersedes 'old', which shipped; use depends_on for follow-up work",
    {
      "items/sample.md": itemText(openMeta({ supersedes: "old" })),
      "archive/old.md": itemText(closedMeta({ id: "old" })),
    },
  ],
  [
    "supersedes-unknown",
    "supersedes",
    "supersedes 'ghost', which is not an archived item",
    { "items/sample.md": itemText(openMeta({ supersedes: "ghost" })) },
  ],
  [
    "supersedes-open",
    "supersedes",
    "supersedes 'other', which is not an archived item",
    {
      "items/sample.md": itemText(openMeta({ supersedes: "other" })),
      "items/other.md": itemText(openMeta({ id: "other", rank: 2 })),
    },
  ],
  [
    "supersedes-self",
    "supersedes",
    "supersedes itself",
    { "items/sample.md": itemText(openMeta({ supersedes: "sample" })) },
  ],
  [
    "depends-not-a-list",
    "depends",
    "depends_on must be a list of item ids",
    { "items/sample.md": itemText(openMeta({ depends_on: "other" })) },
  ],
  [
    "depends-nested",
    "depends",
    "depends_on must be a list of item ids",
    {
      "items/sample.md":
        '+++\nid = "sample"\ntitle = "S"\nbucket = "now"\nrank = 1\nfiled = 2026-09-06\n' +
        'depends_on = [["other"]]\n+++\nProse.\n',
    },
  ],
  [
    "depends-unknown",
    "depends",
    "'gone', which is not an open or archived item",
    { "items/sample.md": itemText(openMeta({ depends_on: ["gone"] })) },
  ],
  [
    "depends-self",
    "depends",
    "depends on itself",
    { "items/sample.md": itemText(openMeta({ depends_on: ["sample"] })) },
  ],
  [
    "depends-twice",
    "depends",
    "names an item more than once",
    {
      "items/sample.md": itemText(openMeta({ rank: 2, depends_on: ["first", "first"] })),
      "items/first.md": itemText(openMeta({ id: "first" })),
    },
  ],
  [
    "depends-ranked-below",
    "depends",
    "depends on 'second' ('now', rank 2), which must come first",
    {
      "items/sample.md": itemText(openMeta({ depends_on: ["second"] })),
      "items/second.md": itemText(openMeta({ id: "second", rank: 2 })),
    },
  ],
  [
    "depends-on-later",
    "depends",
    "depends on 'undecided' ('later', rank 1), which must come first: in an earlier bucket",
    {
      "items/sample.md": itemText(openMeta({ depends_on: ["undecided"] })),
      "items/undecided.md": itemText(openMeta({ id: "undecided", bucket: "later", blocked_on: "a call" })),
    },
  ],
  [
    // Each one exempts the other from blocked_on, so the ordering rule is what catches it.
    "depends-later-cycle",
    "depends",
    "which must come first",
    {
      "items/sample.md": itemText(openMeta({ bucket: "later", depends_on: ["other"] })),
      "items/other.md": itemText(openMeta({ id: "other", bucket: "later", rank: 2, depends_on: ["sample"] })),
    },
  ],
  [
    "depends-declined",
    "depends",
    "depends on 'old', which was declined",
    {
      "items/sample.md": itemText(openMeta({ depends_on: ["old"] })),
      "archive/old.md": itemText(closedMeta({ id: "old", outcome: "declined" })),
    },
  ],
  [
    "depends-archived-malformed",
    "depends",
    "depends_on must be a list of item ids",
    { "archive/sample.md": itemText(closedMeta({ depends_on: 3 })) },
  ],
  [
    "quoted-date",
    "dates",
    "must be a bare TOML date",
    { "items/sample.md": itemText(openMeta({ filed: "2026-09-06" })) },
  ],
  [
    "datetime",
    "dates",
    "must be a bare TOML date",
    { "items/sample.md": itemText(openMeta({ filed: new Raw("2026-09-06 10:00:00") })) },
  ],
  [
    "updated-before-filed",
    "dates",
    "updated 2026-09-01 is before filed 2026-09-06",
    { "items/sample.md": itemText(openMeta({ updated: D(2026, 9, 1) })) },
  ],
  [
    "closed-before-filed",
    "dates",
    "closed 2026-09-01 is before filed",
    { "archive/sample.md": itemText(closedMeta({ closed: D(2026, 9, 1) })) },
  ],
  ["no-body", "body", "has no prose", { "items/sample.md": itemText(openMeta(), "") }],
  ["placeholder-body", "body", "has no prose", { "items/sample.md": itemText(openMeta(), PLACEHOLDER) }],
  ["archived-no-body", "body", "has no prose", { "archive/sample.md": itemText(closedMeta(), "  ") }],
  [
    "missing-file",
    "refs",
    "refs.files 'src/gone.py' does not exist",
    { "items/sample.md": itemText(openMeta(), "Prose.", { files: ["src/gone.py"] }) },
  ],
  [
    "unknown-kind",
    "refs",
    "unknown ref kind 'owner'",
    { "items/sample.md": itemText(openMeta(), "Prose.", { owner: ["someone"] }) },
  ],
  [
    "declared-kind-unresolved",
    "refs",
    "refs.specs 'auth' matches none of specs/{}",
    {
      "roadmap.toml": '[refs]\nspecs = "specs/{}"\n',
      "items/sample.md": itemText(openMeta(), "Prose.", { specs: ["auth"] }),
    },
  ],
  ["refs-not-table", "refs", "refs must be a table", { "items/sample.md": itemText(openMeta({ refs: "src/app.py" })) }],
  [
    "refs-not-list",
    "refs",
    "refs.files must be a list of strings",
    {
      "items/sample.md":
        '+++\nid = "sample"\ntitle = "S"\nbucket = "now"\nrank = 1\nfiled = 2026-09-06\n' +
        '[refs]\nfiles = "src/app.py"\n+++\nProse.\n',
    },
  ],
  [
    "open-and-archived",
    "ids",
    "id 'sample' is both open and archived",
    { "items/sample.md": itemText(openMeta()), "archive/sample.md": itemText(closedMeta()) },
  ],
  [
    "duplicate-id",
    "ids",
    "duplicate id 'sample'",
    { "items/sample.md": itemText(openMeta()), "items/copy.md": itemText(openMeta({ rank: 2 })) },
  ],
  [
    "broken-item-link",
    "links",
    "links to 'gone.md', which does not exist",
    { "items/sample.md": itemText(openMeta(), "See [gone](gone.md).") },
  ],
  [
    "broken-reference-link",
    "links",
    "links to '../nowhere.md'",
    { "items/sample.md": itemText(openMeta(), "See [it][1].\n\n[1]: ../nowhere.md") },
  ],
  [
    "broken-readme-link",
    "links",
    "links to 'decisions.md'",
    { "README.md": `${README}\nClosed items used to live in [decisions](decisions.md).\n` },
  ],
  [
    "milestone-not-a-string",
    "schema",
    "milestone must be a non-empty string",
    { "items/sample.md": itemText(openMeta({ milestone: 3 })) },
  ],
  [
    "milestone-undeclared",
    "depends",
    "is due for milestone 'gamma', which roadmap.toml does not declare",
    { "roadmap.toml": MILESTONES, "items/sample.md": itemText(openMeta({ milestone: "gamma" })) },
  ],
  [
    "depends-unknown-milestone",
    "depends",
    "'gamma', which is not an open or archived item, or a declared milestone",
    { "roadmap.toml": MILESTONES, "items/sample.md": itemText(openMeta({ depends_on: ["gamma"] })) },
  ],
  [
    "milestone-due-ranked-below",
    "depends",
    "depends on milestone 'beta' (2026-12-01), but 'due' ('now', rank 2) is due by then and must come first",
    {
      "roadmap.toml": MILESTONES,
      "items/sample.md": itemText(openMeta({ depends_on: ["beta"] })),
      "items/due.md": itemText(openMeta({ id: "due", rank: 2, milestone: "beta" })),
    },
  ],
  [
    // Due for an earlier milestone is due by the later one too.
    "milestone-due-earlier-ranked-below",
    "depends",
    "but 'due' ('next', rank 1) is due by then and must come first",
    {
      "roadmap.toml": MILESTONES,
      "items/sample.md": itemText(openMeta({ depends_on: ["beta"] })),
      "items/due.md": itemText(openMeta({ id: "due", bucket: "next", milestone: "alpha" })),
    },
  ],
  [
    "milestone-waits-on-its-own",
    "depends",
    "is due for 'alpha' (2026-11-01) but waits on 'alpha' (2026-11-01)",
    {
      "roadmap.toml": MILESTONES,
      "items/sample.md": itemText(openMeta({ milestone: "alpha", depends_on: ["alpha"] })),
    },
  ],
  [
    "milestone-waits-on-a-later-one",
    "depends",
    "is due for 'alpha' (2026-11-01) but waits on 'beta' (2026-12-01)",
    { "roadmap.toml": MILESTONES, "items/sample.md": itemText(openMeta({ milestone: "alpha", depends_on: ["beta"] })) },
  ],
  [
    "milestone-dependency-due-later",
    "depends",
    "is due for 'alpha' (2026-11-01) but depends on 'first', which is due later, for 'beta' (2026-12-01)",
    {
      "roadmap.toml": MILESTONES,
      "items/sample.md": itemText(openMeta({ rank: 2, milestone: "alpha", depends_on: ["first"] })),
      "items/first.md": itemText(openMeta({ id: "first", milestone: "beta" })),
    },
  ],
  [
    "milestone-due-for-reached",
    "depends",
    "is due for 'alpha', which was reached on 2026-10-30; re-target the item, or remove `reached`",
    {
      "roadmap.toml": '[milestones]\nalpha = { title = "Alpha", date = 2026-11-01, reached = 2026-10-30 }\n',
      "items/sample.md": itemText(openMeta({ milestone: "alpha" })),
    },
  ],
  [
    "milestone-id-taken",
    "ids",
    "id 'beta' is also a milestone in roadmap.toml",
    { "roadmap.toml": MILESTONES, "items/beta.md": itemText(openMeta({ id: "beta" })) },
  ],
];

const strings = (problems: { toString(): string }[]) => problems.map(String);

describe("each rule rejects what breaks it", () => {
  each(CASES)("%s", (_id, rule, expected, files) => {
    const rm = makeRoadmap(tempDir(), files);

    const problems = check(rm);

    assert.equal(
      problems.some((p) => p.rule === rule && p.message.includes(expected)),
      true,
      strings(problems).join("\n"),
    );
  });
});

describe("generated files must match the items", () => {
  each([
    ["stale-index", "generated block is stale", { "items/sample.md": itemText(openMeta()) }],
    ["no-markers", "markers not found", { "done.md": "# Done\n" }],
  ] as const)("%s", (_id, expected, files) => {
    const rm = makeRoadmap(tempDir(), {}, { sync: true });
    for (const [name, text] of Object.entries(files as Record<string, string>)) {
      mkdirSync(join(rm.dir, name, ".."), { recursive: true });
      writeFileSync(join(rm.dir, name), text);
    }

    const problems = check(rm);

    assert.equal(
      problems.some((p) => p.rule === "generated" && p.message.includes(expected)),
      true,
      strings(problems).join("\n"),
    );
  });
});

test("a missing done.md is reported", () => {
  const rm = makeRoadmap(tempDir(), {});
  rmSync(rm.done);

  assert.equal(
    check(rm).some((p) => p.rule === "generated" && p.message.includes("is missing")),
    true,
  );
});

describe("a broken config is refused", () => {
  each([
    ['[refs\nspecs = "x"', "malformed TOML"],
    ['[refs]\nspecs = "specs/"', "must be a path template containing {}"],
    ['owner = "me"', "unknown key(s) owner"],
    ["root = 1", "root must be a path string"],
    ['milestones = "beta"', "milestones must be a table"],
    ['[milestones]\nBeta = { title = "B", date = 2026-12-01 }', "milestone id 'Beta' is not a kebab-case slug"],
    ['[milestones]\nbeta = { title = "B", date = "2026-12-01" }', "milestones.beta must be"],
    ["[milestones]\nbeta = { date = 2026-12-01 }", "milestones.beta must be"],
    ['[milestones]\nbeta = { title = "B", date = 2026-12-01, owner = "me" }', "milestones.beta must be"],
    ['[milestones]\nbeta = "2026-12-01"', "milestones.beta must be"],
    ['[milestones]\nbeta = { title = "B", date = 2026-12-01, reached = "2026-12-01" }', "milestones.beta must be"],
    [
      '[milestones]\nbeta = { title = "B", date = 2026-12-01, reached = 2026-12-01T10:00:00 }',
      "milestones.beta must be",
    ],
    ['[milestones]\nbeta = { title = "B", date = 2026-12-01, reached = true }', "optionally reached = 2026-12-01"],
  ])("%s", (toml, expected) => {
    const tmp = tempDir();
    mkdirSync(join(tmp, "roadmap"));
    writeFileSync(join(tmp, "roadmap", "roadmap.toml"), toml);

    throwsWith(() => openRoadmap(join(tmp, "roadmap")), ConfigError, expected);
  });
});

test("every rule has a failing case", () => {
  // The last three are tested separately.
  const covered = new Set([...CASES.map((c) => c[1]), "generated", "config", "append-only"]);

  assert.deepEqual([...covered].sort(), Object.keys(RULES).sort());
});

// --- what the rules deliberately allow -------------------------------------

test("a clean roadmap has no problems", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, "src"));
  writeFileSync(join(tmp, "src", "app.py"), "");
  const rm = makeRoadmap(tmp, {
    "items/now-one.md": itemText(openMeta({ id: "now-one" }), "Prose.", { files: ["src/app.py"] }),
    "items/next-one.md": itemText(openMeta({ id: "next-one", bucket: "next" })),
    "items/later-one.md": itemText(openMeta({ id: "later-one", bucket: "later", blocked_on: "a call" })),
    "archive/old-one.md": itemText(closedMeta({ id: "old-one", outcome: "declined" })),
    "archive/shipped-one.md": itemText(
      closedMeta({ id: "shipped-one", depends_on: ["old-one"], supersedes: "old-one" }),
    ),
    "items/retry-one.md": itemText(openMeta({ id: "retry-one", rank: 2, supersedes: "old-one" })),
    // An archived item keeps supersedes as history, whatever its target became.
    "archive/history.md": itemText(closedMeta({ id: "history", supersedes: "shipped-one" })),
  });

  assert.deepEqual(strings(check(rm)), []);
});

test("archived refs and links may go stale", () => {
  // An archived entry describes the tree as it was. It cannot be edited to
  // follow a rename, so it is not held to the tree as it is now.
  const rm = makeRoadmap(tempDir(), {
    "archive/sample.md": itemText(closedMeta(), "Was in [the old module](../../src/old.py).", {
      files: ["src/old.py"],
    }),
  });

  assert.deepEqual(strings(check(rm)), []);
});

test("links that are not relative paths are not checked", () => {
  const body = [
    "[web](https://example.com/x.md) [mail](mailto:a@b.c) [anchor](#top) [abs](/docs/x.md)",
    "[self](sample.md#section) [dir](../items/) [spaced](<../items/sample.md>)",
    "`[code](nowhere.md)`",
    "```",
    "[fenced](nowhere.md)",
    "```",
  ].join("\n");
  const rm = makeRoadmap(tempDir(), { "items/sample.md": itemText(openMeta(), body) });

  assert.deepEqual(strings(check(rm)), []);
});

test("a declared ref kind may use several templates and globs", () => {
  const tmp = tempDir();
  mkdirSync(join(tmp, "changes", "archive", "2026-09-01-add-cache"), { recursive: true });
  const rm = makeRoadmap(tmp, {
    "roadmap.toml": '[refs]\nchanges = ["changes/{}", "changes/archive/*-{}"]\n',
    "items/sample.md": itemText(openMeta(), "Prose.", { changes: ["add-cache"] }),
  });

  assert.deepEqual(strings(check(rm)), []);
});

test("a broken file does not hide the others", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/broken.md": "no fence\n",
    "items/sample.md": itemText(openMeta({ bucket: "later" })),
  });

  const rules = new Set(check(rm).map((p) => p.rule));

  contains(rules, "frontmatter");
  contains(rules, "bucket");
});

test("problems render with path, line and tag", () => {
  const rm = makeRoadmap(tempDir(), { "items/sample.md": itemText(openMeta(), "Line one.\n[x](gone.md)") });

  const problems = check(rm);

  assert.deepEqual(strings(problems), [
    `${pathJoin(rm.itemsDir, "sample.md")}:10: links to 'gone.md', which does not exist [links]`,
  ]);
});

test("README and done templates are valid without items", () => {
  const rm = makeRoadmap(tempDir(), { "README.md": README, "done.md": DONE });

  assert.deepEqual(strings(check(rm)), []);
});

test("dependencies may be shipped or ahead, and a later item may wait on one", () => {
  // A shipped dependency is satisfied. A 'later' item that depends on another
  // 'later' item waits on that item's decision, so it needn't repeat it.
  const rm = makeRoadmap(tempDir(), {
    "items/first.md": itemText(openMeta({ id: "first" })),
    "items/second.md": itemText(openMeta({ id: "second", rank: 2, depends_on: ["first", "shipped"] })),
    "items/after.md": itemText(openMeta({ id: "after", bucket: "next", depends_on: ["second"] })),
    "items/undecided.md": itemText(openMeta({ id: "undecided", bucket: "later", blocked_on: "a call" })),
    "items/waiting.md": itemText(openMeta({ id: "waiting", bucket: "later", rank: 2, depends_on: ["undecided"] })),
    "archive/shipped.md": itemText(closedMeta({ id: "shipped" })),
  });

  assert.deepEqual(strings(check(rm)), []);
});

test("a malformed dependency does not crash the other rules", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/sample.md": itemText(openMeta({ bucket: "later", depends_on: ["other"] })),
    "items/other.md": itemText(openMeta({ id: "other", bucket: "someday", rank: "x" })),
  });

  const rules = new Set(check(rm).map((p) => p.rule));

  contains(rules, "bucket");
  contains(rules, "rank");
});

test("milestones order the items due for them ahead of the items waiting on them", () => {
  // Items due for a milestone, or for an earlier one, come first. A 'later'
  // item due for it makes the items waiting on it 'later' too, without a
  // blocked_on of their own. An archived item may name a milestone that is gone.
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": MILESTONES,
    "items/early.md": itemText(openMeta({ id: "early", milestone: "alpha" })),
    "items/due.md": itemText(openMeta({ id: "due", rank: 2, milestone: "beta", depends_on: ["alpha"] })),
    "items/after.md": itemText(openMeta({ id: "after", bucket: "next", depends_on: ["alpha", "early"] })),
    "items/undecided.md": itemText(
      openMeta({ id: "undecided", bucket: "later", milestone: "beta", blocked_on: "a call" }),
    ),
    "items/waiting.md": itemText(openMeta({ id: "waiting", bucket: "later", rank: 2, depends_on: ["beta"] })),
    "archive/old.md": itemText(closedMeta({ id: "old", milestone: "retired", depends_on: ["retired"] })),
  });

  assert.deepEqual(strings(check(rm)), []);
});

test("a reached milestone is satisfied, like a shipped item", () => {
  // alpha was met early, so the items waiting on it are free to go ahead of
  // anything, and to sit in any bucket. They keep naming it as history.
  const reached =
    '[milestones]\nalpha = { title = "Alpha", date = 2026-11-01, reached = 2026-10-30 }\n' +
    'beta = { title = "Beta", date = 2026-12-01 }\n';
  const files = {
    "roadmap.toml": reached,
    "items/waits.md": itemText(openMeta({ id: "waits", depends_on: ["alpha"] })),
    "items/due.md": itemText(openMeta({ id: "due", rank: 2, milestone: "beta", depends_on: ["alpha"] })),
    "items/early.md": itemText(openMeta({ id: "early", bucket: "later", blocked_on: "a call" })),
    "archive/old.md": itemText(closedMeta({ id: "old", milestone: "alpha" })),
  };
  assert.deepEqual(strings(check(makeRoadmap(tempDir(), files))), []);

  // Un-marking it brings the ordering back.
  const unmarked = makeRoadmap(tempDir(), {
    ...files,
    "roadmap.toml": reached.replace(", reached = 2026-10-30", ""),
    "items/late.md": itemText(openMeta({ id: "late", bucket: "next", milestone: "alpha" })),
  });
  contains(strings(check(unmarked)).join("\n"), "depends on milestone 'alpha' (2026-11-01), but 'late'");
});

test("a reached milestone may be reached before or after its date", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml":
      '[milestones]\nearly = { title = "E", date = 2026-11-01, reached = 2026-10-01 }\n' +
      'late = { title = "L", date = 2026-11-01, reached = 2026-12-01 }\n',
    "items/a.md": itemText(openMeta({ id: "a", depends_on: ["early", "late"] })),
  });

  assert.deepEqual(strings(check(rm)), []);
  assert.equal(String(rm.milestones.get("late")?.reached), "2026-12-01");
});
