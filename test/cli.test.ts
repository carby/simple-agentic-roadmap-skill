// The CLI as CI runs it: a subprocess, an exit status, and problems printed to stderr.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { COMMANDS } from "../src/cli.ts";
import { DECISIONS_INTRO, load, openRoadmap, parse, VERSION } from "../src/model.ts";
import {
  contains,
  D,
  each,
  itemText,
  makeRoadmap,
  openMeta,
  type Result,
  run,
  snapshot,
  tempDir,
  validCopy,
} from "./helpers.ts";

const read = (path: string) => readFileSync(path, "utf8");
const valid = () => validCopy(tempDir());
const meta = (path: string) => parse(path).meta;

function ok(result: Result): void {
  assert.equal(result.status, 0, result.stderr);
}

function checks(cwd: string): void {
  ok(run(["check"], cwd));
}

function edit(path: string, from: string, to: string): void {
  writeFileSync(path, read(path).replace(from, to));
}

test("check passes on the valid fixture", () => {
  const result = run(["check"], valid());

  ok(result);
  assert.equal(result.stdout, "Roadmap OK: 3 open, 2 archived.\n");
});

test("check fails with one tagged line per problem", () => {
  const root = valid();
  edit(join(root, "roadmap/items/cache-tokens.md"), 'bucket = "now"', 'bucket = "later"');
  unlinkSync(join(root, "src/app.py"));

  const result = run(["check"], root);

  assert.equal(result.status, 1);
  const lines = result.stderr.split("\n").filter(Boolean);
  assert.equal(lines[0], "5 roadmap problem(s):");
  assert.equal(
    lines.some((l) => l.endsWith("or depend on another 'later' item [bucket]")),
    true,
  );
  assert.equal(
    lines.some((l) => l.includes("split-app.md: depends on 'cache-tokens' ('later', rank 1)")),
    true,
  );
  assert.equal(
    lines.some((l) => l.endsWith("refs.files 'src/app.py' does not exist [refs]")),
    true,
  );
  assert.equal(lines.filter((l) => l.endsWith("[generated]")).length, 1); // the index now puts it under Later
  assert.equal(
    lines.some((l) => l.endsWith("rank 1 is already taken in 'later' by roadmap/items/cache-tokens.md [rank]")),
    true,
  );
});

test("index repairs a stale index", () => {
  const root = valid();
  edit(join(root, "roadmap/items/cache-tokens.md"), "Cache auth tokens", "Cache the auth tokens");
  assert.equal(run(["check"], root).status, 1);

  ok(run(["index"], root));

  checks(root);
  contains(read(join(root, "roadmap/README.md")), "[Cache the auth tokens](items/cache-tokens.md)");
});

test("index repairs the index after an item is deleted by hand", () => {
  // The stale index still links to the deleted file. That is a [generated]
  // problem for `index` to fix, not a [links] problem that stops it.
  const root = valid();
  unlinkSync(join(root, "roadmap/items/split-app.md"));

  ok(run(["index"], root));

  checks(root);
});

test("index refuses to render an invalid roadmap", () => {
  const root = valid();
  writeFileSync(join(root, "roadmap/items/broken.md"), "no fence\n");
  const readme = read(join(root, "roadmap/README.md"));

  const result = run(["index"], root);

  assert.equal(result.status, 1);
  contains(result.stderr, "[frontmatter]");
  assert.equal(read(join(root, "roadmap/README.md")), readme);
});

test("--dir points at a roadmap elsewhere", () => {
  const root = valid();

  ok(run(["check", "--dir", "valid/roadmap"], join(root, "..")));
});

test("a broken config is a usage error", () => {
  const root = valid();
  writeFileSync(join(root, "roadmap/roadmap.toml"), "[refs\n");

  const result = run(["check"], root);

  assert.equal(result.status, 2);
  assert.equal(result.stderr.startsWith("error: "), true);
  contains(result.stderr, "[config]");
});

test("the CLI has exactly these commands", () => {
  assert.deepEqual(
    Object.keys(COMMANDS).sort(),
    [
      "check",
      "close",
      "decide",
      "index",
      "init",
      "list",
      "merge-driver",
      "move",
      "new",
      "review",
      "split",
      "update",
    ].sort(),
  );
});

test("--version", () => {
  assert.equal(run(["--version"], process.cwd()).stdout.trim(), `roadmap ${VERSION}`);
});

test("new refuses a reused id", () => {
  const result = run(["new", "rewrite-in-rust", "--title", "Again", "--bucket", "now"], valid());

  assert.equal(result.status, 2);
  contains(result.stderr, "ids are never reused");
});

test("new enforces the bucket criterion up front", () => {
  const result = run(["new", "some-call", "--title", "T", "--bucket", "later"], valid());

  assert.equal(result.status, 2);
  contains(result.stderr, "--blocked-on is required");
});

test("new takes the next free rank, and refs", () => {
  const root = valid();

  ok(run(["new", "more-work", "--title", "More", "--bucket", "now", "--ref", "specs:auth", "--body", "Why."], root));

  const item = meta(join(root, "roadmap/items/more-work.md"));
  assert.equal(item.rank, 2);
  assert.deepEqual(item.refs, { specs: ["auth"] });
  checks(root);
});

test("move goes to the bottom of the target bucket", () => {
  const root = valid();

  ok(run(["move", "rotate-keys", "--bucket", "next"], root));

  const moved = meta(join(root, "roadmap/items/rotate-keys.md"));
  assert.deepEqual([moved.bucket, moved.rank], ["next", 2]);
  checks(root);
});

test("move lands above its dependents and shifts them down", () => {
  const root = valid();

  const result = run(["move", "cache-tokens", "--bucket", "next"], root);

  ok(result);
  assert.equal(result.stdout.split("\n")[1], "Shifted split-app down a rank, below it.");
  const moved = meta(join(root, "roadmap/items/cache-tokens.md"));
  const shifted = meta(join(root, "roadmap/items/split-app.md"));
  assert.deepEqual([moved.bucket, moved.rank], ["next", 1]);
  assert.deepEqual([shifted.bucket, shifted.rank], ["next", 2]);
  checks(root);
});

test("move refuses to put an item behind its dependents, and writes nothing", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["move", "cache-tokens", "--bucket", "later", "--blocked-on", "which cache"], root);

  assert.equal(result.status, 2);
  contains(result.stderr, "moving cache-tokens would break the roadmap");
  contains(result.stderr, "split-app.md: depends on 'cache-tokens' ('later', rank 2)");
  assert.deepEqual(snapshot(root), before);
});

test("move out of later drops blocked_on and asks for the decision", () => {
  const root = valid();

  const result = run(["move", "rotate-keys", "--bucket", "now"], root);

  ok(result);
  contains(result.stdout, "record in its prose what was decided");
  assert.ok(!("blocked_on" in meta(join(root, "roadmap/items/rotate-keys.md"))));
  checks(root);
});

test("move into later needs the open question", () => {
  const root = valid();

  const refused = run(["move", "split-app", "--bucket", "later"], root);
  const moved = run(["move", "split-app", "--bucket", "later", "--blocked-on", "where to split"], root);

  assert.equal(refused.status, 2);
  contains(refused.stderr, "--blocked-on is required");
  ok(moved);
  assert.equal(meta(join(root, "roadmap/items/split-app.md")).blocked_on, "where to split");
  checks(root);
});

/** Items a, b, c, d at ranks 1-4 in Now, and e at rank 1 in Next. */
function fourInNow(root: string, depends: Record<string, string[]> = {}): void {
  const files: Record<string, string> = {};
  [..."abcd"].forEach((id, i) => {
    files[`items/${id}.md`] = itemText(openMeta({ id, rank: i + 1, depends_on: depends[id] }));
  });
  files["items/e.md"] = itemText(openMeta({ id: "e", bucket: "next" }));
  makeRoadmap(root, files);
}

function ranks(root: string): Record<string, [string, number]> {
  const [items] = load(openRoadmap(join(root, "roadmap")));
  return Object.fromEntries(items.map((i) => [i.id, [i.bucket, i.rank]]));
}

test("move to another bucket sets updated, and a re-rank does not", () => {
  const root = tempDir();
  fourInNow(root);
  const a = join(root, "roadmap/items/a.md");
  edit(a, "filed = 2026-09-06", "filed = 2026-09-06\nupdated = 2026-09-07");

  const moved = run(["move", "a", "--bucket", "next", "--date", "2026-10-01"], root);
  const reRanked = run(["move", "c", "--rank", "1", "--date", "2026-10-02"], root);

  ok(moved);
  ok(reRanked);
  assert.equal(String(meta(a).updated), String(D(2026, 10, 1)));
  assert.equal(read(a).split("updated =").length - 1, 1);
  for (const id of "bcde") assert.ok(!("updated" in meta(join(root, `roadmap/items/${id}.md`))));
  checks(root);
});

test("move refuses a no-op", () => {
  const result = run(["move", "split-app", "--bucket", "next"], valid());

  assert.equal(result.status, 2);
  contains(result.stderr, "is already in 'next'");
});

test("move --rank raises an item and shifts the ones it passes down", () => {
  const root = tempDir();
  fourInNow(root);

  const result = run(["move", "c", "--rank", "1"], root);

  ok(result);
  assert.deepEqual(result.stdout.split("\n").filter(Boolean), [
    "Moved roadmap/items/c.md to rank 1 in 'now'.",
    "Shifted a, b down a rank, below it.",
  ]);
  assert.deepEqual(ranks(root), { c: ["now", 1], a: ["now", 2], b: ["now", 3], d: ["now", 4], e: ["next", 1] });
  checks(root);
});

test("move --rank lowers an item and shifts the ones it passes up", () => {
  const root = tempDir();
  fourInNow(root);

  const result = run(["move", "a", "--rank", "3"], root);

  ok(result);
  assert.equal(result.stdout.split("\n")[1], "Shifted b, c up a rank, above it.");
  assert.deepEqual(ranks(root), { b: ["now", 1], c: ["now", 2], a: ["now", 3], d: ["now", 4], e: ["next", 1] });
  checks(root);
});

describe("move --above lands directly above the other item", () => {
  each([
    ["d", "b", "adbc"],
    ["a", "d", "bcad"],
  ])("%s above %s", (item, above, order) => {
    const root = tempDir();
    fourInNow(root);

    ok(run(["move", item, "--above", above], root));

    const now = Object.entries(ranks(root))
      .filter(([, [bucket]]) => bucket === "now")
      .sort((x, y) => x[1][1] - y[1][1])
      .map(([id]) => id);
    assert.equal(now.join(""), order);
    checks(root);
  });
});

test("move --above takes the other item's bucket", () => {
  const root = tempDir();
  fourInNow(root);

  ok(run(["move", "e", "--above", "b"], root));

  assert.deepEqual(ranks(root), { a: ["now", 1], e: ["now", 2], b: ["now", 3], c: ["now", 4], d: ["now", 5] });
  checks(root);
});

test("move --rank into another bucket shifts that bucket down", () => {
  const root = tempDir();
  fourInNow(root);

  ok(run(["move", "a", "--bucket", "next", "--rank", "1"], root));

  assert.deepEqual(ranks(root).a, ["next", 1]);
  assert.deepEqual(ranks(root).e, ["next", 2]);
  checks(root);
});

test("move --rank refuses to put an item above its dependency, and writes nothing", () => {
  const root = tempDir();
  fourInNow(root, { c: ["b"] });
  const before = snapshot(root);

  const result = run(["move", "c", "--rank", "1"], root);

  assert.equal(result.status, 2);
  contains(result.stderr, "moving c would break the roadmap");
  assert.deepEqual(snapshot(root), before);
});

describe("move refuses a bad re-rank", () => {
  each([
    [["a", "--rank", "1"], "is already at rank 1 in 'now'"],
    [["a", "--above", "a"], "cannot go above itself"],
    [["a", "--above", "b", "--bucket", "next"], "--above b is in 'now', not 'next'"],
    [["a", "--rank", "2", "--blocked-on", "why"], "--blocked-on is only for moving"],
    [["a", "--rank", "2", "--above", "c"], "not allowed with argument"],
    [["a", "--rank", "0"], "is not a positive integer"],
    [["a"], "give --bucket, --rank or --above"],
  ])("%j", (args, expected) => {
    const root = tempDir();
    fourInNow(root);

    const result = run(["move", ...args], root);

    assert.equal(result.status, 2);
    contains(result.stderr, expected);
  });
});

test("there is no WIP-tracking command", () => {
  const result = run(["claim", "cache-tokens"], valid());

  assert.equal(result.status, 2);
  contains(result.stderr, "invalid choice: 'claim'");
});

test("move and close refuse an archived item", () => {
  const root = valid();
  for (const args of [
    ["move", "rewrite-in-rust", "--bucket", "now"],
    ["close", "rewrite-in-rust", "--outcome", "shipped"],
  ]) {
    const result = run(args, root);

    assert.equal(result.status, 2);
    contains(result.stderr, "it is already closed");
  }
});

test("new records its dependencies", () => {
  const root = valid();

  ok(
    run(
      ["new", "more-work", "--title", "More", "--bucket", "next", "--depends-on", "split-app"].concat([
        "--depends-on",
        "drop-legacy-login",
        "--body",
        "Why.",
      ]),
      root,
    ),
  );

  const item = meta(join(root, "roadmap/items/more-work.md"));
  assert.deepEqual([item.rank, item.depends_on], [2, ["split-app", "drop-legacy-login"]]);
  checks(root);
});

test("new refuses to file an item ahead of its dependencies", () => {
  const root = valid();

  const result = run(["new", "too-soon", "--title", "T", "--bucket", "now", "--depends-on", "split-app"], root);

  assert.equal(result.status, 2);
  contains(result.stderr, "filing too-soon would break the roadmap");
  contains(result.stderr, "which must come first");
  assert.equal(existsSync(join(root, "roadmap/items/too-soon.md")), false);
});

test("a later item may wait on another later item instead of naming a question", () => {
  const root = valid();
  ok(
    run(
      ["new", "after-rotation", "--title", "T", "--bucket", "later", "--depends-on", "rotate-keys", "--body", "Why."],
      root,
    ),
  );
  checks(root);
  const before = snapshot(root);

  // Taking rotate-keys out of Later, either way, would leave after-rotation blocked on nothing.
  const moved = run(["move", "rotate-keys", "--bucket", "next"], root);
  const closed = run(["close", "rotate-keys", "--outcome", "shipped"], root);

  for (const result of [moved, closed]) {
    assert.equal(result.status, 2);
    contains(result.stderr, "after-rotation.md: a 'later' item must name what it is blocked_on");
  }
  assert.deepEqual(snapshot(root), before);
});

test("close refuses to decline an item others depend on", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["close", "cache-tokens", "--outcome", "declined"], root);

  assert.equal(result.status, 2);
  contains(result.stderr, "closing cache-tokens as declined would break the roadmap");
  contains(result.stderr, "split-app.md: depends on 'cache-tokens', which was declined");
  assert.deepEqual(snapshot(root), before);
});

test("close may ship an item others depend on", () => {
  const root = valid();

  ok(run(["close", "cache-tokens", "--outcome", "shipped"], root));

  contains(read(join(root, "roadmap/README.md")), "[Cache auth tokens](archive/cache-tokens.md) (shipped)");
  checks(root);
});

describe("close hints at --as when shipped without it", () => {
  each([
    [["--outcome", "shipped"], true],
    [["--outcome", "shipped", "--as", "pr-9"], false],
    [["--outcome", "declined"], false],
  ] as const)("%j", (args, hinted) => {
    const result = run(["close", "rotate-keys", ...args], valid());

    ok(result);
    assert.equal(result.stdout.includes("No --as given"), hinted);
  });
});

test("decide creates the log and appends dated entries", () => {
  const root = valid();
  const log = join(root, "roadmap/decisions.md");
  rmSync(log);

  const first = run(["decide", "--title", "Ship weekly", "--body", "Smaller releases.", "--date", "2026-10-01"], root);
  const second = run(["decide", "--title", "No epics", "--body", "  Stay KISS.\n", "--date", "2026-10-02"], root);

  ok(first);
  ok(second);
  assert.equal(first.stdout, "Recorded a decision in roadmap/decisions.md.\n");
  assert.equal(
    read(log),
    `${DECISIONS_INTRO}\n## 2026-10-01: Ship weekly\n\nSmaller releases.\n\n## 2026-10-02: No epics\n\nStay KISS.\n`,
  );
  checks(root);
});

describe("decide needs a one-line title and the reasoning", () => {
  each([
    [["--title", "Ship weekly"], "the following arguments are required: --body"],
    [["--title", "Ship weekly", "--body", " "], "--body must say why"],
    [["--title", "Two\nlines", "--body", "Why."], "--title must be one non-empty line"],
  ])("%j", (args, expected) => {
    const root = valid();
    const before = read(join(root, "roadmap/decisions.md"));

    const result = run(["decide", ...args], root);

    assert.equal(result.status, 2);
    contains(result.stderr, expected);
    assert.equal(read(join(root, "roadmap/decisions.md")), before);
  });
});

test("new --supersedes links a retry, and close moves the link", () => {
  const root = valid();
  const done = join(root, "roadmap/done.md");

  ok(
    run(
      ["new", "retry-rust", "--title", "Rust, again", "--bucket", "next", "--supersedes", "rewrite-in-rust"].concat([
        "--body",
        "Incremental builds changed the numbers.",
      ]),
      root,
    ),
  );

  assert.equal(meta(join(root, "roadmap/items/retry-rust.md")).supersedes, "rewrite-in-rust");
  contains(read(done), "superseded by [Rust, again](items/retry-rust.md)");
  checks(root);

  ok(run(["close", "retry-rust", "--outcome", "shipped", "--as", "pr-3"], root));

  contains(read(done), "superseded by [Rust, again](archive/retry-rust.md)");
  checks(root);
});

test("new refuses to supersede a shipped item, and writes nothing", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(
    ["new", "again", "--title", "Again", "--bucket", "now", "--supersedes", "drop-legacy-login"],
    root,
  );

  assert.equal(result.status, 2);
  contains(result.stderr, "supersedes 'drop-legacy-login', which shipped");
  assert.deepEqual(snapshot(root), before);
});

const MILESTONES = '[milestones]\nbeta = { title = "Public beta", date = 2026-12-01 }\n';

test("new records the milestone an item is due for", () => {
  const root = tempDir();
  makeRoadmap(root, { "roadmap.toml": MILESTONES });

  ok(run(["new", "ship-it", "--title", "T", "--bucket", "now", "--milestone", "beta", "--body", "Why."], root));

  assert.equal(meta(join(root, "roadmap/items/ship-it.md")).milestone, "beta");
  contains(read(join(root, "roadmap/README.md")), "**Due for:** Public beta (2026-12-01)");
  checks(root);
});

describe("new refuses an unknown milestone, and a milestone's id", () => {
  each([
    [
      "unknown-milestone",
      ["ship-it", "--milestone", "gamma"],
      "is due for milestone 'gamma', which roadmap.toml does not declare",
    ],
    ["milestone-id", ["beta"], "'beta' is a milestone in"],
  ])("%s", (_id, args, expected) => {
    const root = tempDir();
    makeRoadmap(root, { "roadmap.toml": MILESTONES });

    const result = run(["new", ...args, "--title", "T", "--bucket", "now", "--body", "Why."], root);

    assert.equal(result.status, 2);
    contains(result.stderr, expected);
    assert.deepEqual(
      readdirSync(join(root, "roadmap/items")).filter((p) => p.endsWith(".md")),
      [],
    );
  });
});

function dueAndWaiting(root: string): void {
  makeRoadmap(root, {
    "roadmap.toml": MILESTONES,
    "items/due.md": itemText(openMeta({ id: "due", milestone: "beta" })),
    "items/waits.md": itemText(openMeta({ id: "waits", bucket: "next", depends_on: ["beta"] })),
  });
}

test("move lands an item due for a milestone above the items waiting on it", () => {
  const root = tempDir();
  dueAndWaiting(root);

  ok(run(["move", "due", "--bucket", "next"], root));

  assert.equal(meta(join(root, "roadmap/items/due.md")).rank, 1);
  assert.equal(meta(join(root, "roadmap/items/waits.md")).rank, 2);
  checks(root);
});

test("move refuses to put an item behind the items waiting on its milestone", () => {
  const root = tempDir();
  dueAndWaiting(root);

  const result = run(["move", "due", "--bucket", "later", "--blocked-on", "a call"], root);

  assert.equal(result.status, 2);
  contains(result.stderr, "waits.md: depends on milestone 'beta' (2026-12-01), but 'due' ('later', rank 1)");
});

test("move puts an item waiting on a reached milestone ahead of the items due for it", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "roadmap.toml": '[milestones]\nbeta = { title = "Public beta", date = 2026-12-01, reached = 2026-12-01 }\n',
    "items/done-soon.md": itemText(openMeta({ id: "done-soon" })),
    "items/waits.md": itemText(openMeta({ id: "waits", bucket: "next", depends_on: ["beta"] })),
  });

  ok(run(["move", "waits", "--bucket", "now", "--rank", "1"], root));

  assert.equal(meta(join(root, "roadmap/items/waits.md")).rank, 1);
  checks(root);
});

test("index --renumber resolves a rank collision, oldest first", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/newer.md": itemText(openMeta({ id: "newer", filed: D(2026, 9, 8) })),
    "items/older.md": itemText(openMeta({ id: "older" })),
  });
  contains(run(["check"], root).stderr, "[rank]");

  const result = run(["index", "--renumber"], root);

  ok(result);
  assert.equal(result.stdout.split("\n")[0], "Renumbered newer.");
  assert.equal(meta(join(root, "roadmap/items/older.md")).rank, 1);
  assert.equal(meta(join(root, "roadmap/items/newer.md")).rank, 2);
  checks(root);
});

test("index --renumber puts a dependency first among tied items", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/dependent.md": itemText(openMeta({ id: "dependent", depends_on: ["dependency"] })),
    "items/dependency.md": itemText(openMeta({ id: "dependency", filed: D(2026, 9, 8) })),
  });

  ok(run(["index", "--renumber"], root));

  assert.equal(meta(join(root, "roadmap/items/dependency.md")).rank, 1);
  assert.equal(meta(join(root, "roadmap/items/dependent.md")).rank, 2);
  checks(root);
});

test("index --renumber closes gaps, and leaves ranks that hold alone", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/first.md": itemText(openMeta({ id: "first" })),
    "items/third.md": itemText(openMeta({ id: "third", rank: 3 })),
  });
  const first = read(join(root, "roadmap/items/first.md"));

  ok(run(["index", "--renumber"], root));

  assert.equal(read(join(root, "roadmap/items/first.md")), first);
  assert.equal(meta(join(root, "roadmap/items/third.md")).rank, 2);
});

test("index --renumber changes nothing on a clean roadmap", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["index", "--renumber"], root);

  ok(result);
  assert.equal(result.stdout, "Index already up to date.\n");
  assert.deepEqual(snapshot(root), before);
});
