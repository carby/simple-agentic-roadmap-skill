// The CLI as CI runs it: a subprocess, an exit status, and problems printed to stderr.

import { existsSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DECISIONS_INTRO, load, openRoadmap, parse, VERSION } from "../src/model.ts";
import { D, itemText, makeRoadmap, openMeta, type Result, run, snapshot, tempDir, validCopy } from "./helpers.ts";

const read = (path: string) => readFileSync(path, "utf8");
const valid = () => validCopy(tempDir());
const meta = (path: string) => parse(path).meta;

function ok(result: Result): void {
  expect(result.status, result.stderr).toBe(0);
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
  expect(result.stdout).toBe("Roadmap OK: 3 open, 2 archived.\n");
});

test("check fails with one tagged line per problem", () => {
  const root = valid();
  edit(join(root, "roadmap/items/cache-tokens.md"), 'bucket = "now"', 'bucket = "later"');
  unlinkSync(join(root, "src/app.py"));

  const result = run(["check"], root);

  expect(result.status).toBe(1);
  const lines = result.stderr.split("\n").filter(Boolean);
  expect(lines[0]).toBe("5 roadmap problem(s):");
  expect(lines.some((l) => l.endsWith("or depend on another 'later' item [bucket]"))).toBe(true);
  expect(lines.some((l) => l.includes("split-app.md: depends on 'cache-tokens' ('later', rank 1)"))).toBe(true);
  expect(lines.some((l) => l.endsWith("refs.files 'src/app.py' does not exist [refs]"))).toBe(true);
  expect(lines.filter((l) => l.endsWith("[generated]"))).toHaveLength(1); // the index now puts it under Later
  expect(
    lines.some((l) => l.endsWith("rank 1 is already taken in 'later' by roadmap/items/cache-tokens.md [rank]")),
  ).toBe(true);
});

test("index repairs a stale index", () => {
  const root = valid();
  edit(join(root, "roadmap/items/cache-tokens.md"), "Cache auth tokens", "Cache the auth tokens");
  expect(run(["check"], root).status).toBe(1);

  ok(run(["index"], root));

  checks(root);
  expect(read(join(root, "roadmap/README.md"))).toContain("[Cache the auth tokens](items/cache-tokens.md)");
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

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[frontmatter]");
  expect(read(join(root, "roadmap/README.md"))).toBe(readme);
});

test("--dir points at a roadmap elsewhere", () => {
  const root = valid();

  ok(run(["check", "--dir", "valid/roadmap"], join(root, "..")));
});

test("a broken config is a usage error", () => {
  const root = valid();
  writeFileSync(join(root, "roadmap/roadmap.toml"), "[refs\n");

  const result = run(["check"], root);

  expect(result.status).toBe(2);
  expect(result.stderr.startsWith("error: ")).toBe(true);
  expect(result.stderr).toContain("[config]");
});

test("--version", () => {
  expect(run(["--version"], process.cwd()).stdout.trim()).toBe(`roadmap.py ${VERSION}`);
});

test("new refuses a reused id", () => {
  const result = run(["new", "rewrite-in-rust", "--title", "Again", "--bucket", "now"], valid());

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("ids are never reused");
});

test("new enforces the bucket criterion up front", () => {
  const result = run(["new", "some-call", "--title", "T", "--bucket", "later"], valid());

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("--blocked-on is required");
});

test("new takes the next free rank, and refs", () => {
  const root = valid();

  ok(run(["new", "more-work", "--title", "More", "--bucket", "now", "--ref", "specs:auth", "--body", "Why."], root));

  const item = meta(join(root, "roadmap/items/more-work.md"));
  expect(item.rank).toBe(2);
  expect(item.refs).toEqual({ specs: ["auth"] });
  checks(root);
});

test("move goes to the bottom of the target bucket", () => {
  const root = valid();

  ok(run(["move", "rotate-keys", "--bucket", "next"], root));

  const moved = meta(join(root, "roadmap/items/rotate-keys.md"));
  expect([moved.bucket, moved.rank]).toEqual(["next", 2]);
  checks(root);
});

test("move lands above its dependents and shifts them down", () => {
  const root = valid();

  const result = run(["move", "cache-tokens", "--bucket", "next"], root);

  ok(result);
  expect(result.stdout.split("\n")[1]).toBe("Shifted split-app down a rank, below it.");
  const moved = meta(join(root, "roadmap/items/cache-tokens.md"));
  const shifted = meta(join(root, "roadmap/items/split-app.md"));
  expect([moved.bucket, moved.rank]).toEqual(["next", 1]);
  expect([shifted.bucket, shifted.rank]).toEqual(["next", 2]);
  checks(root);
});

test("move refuses to put an item behind its dependents, and writes nothing", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["move", "cache-tokens", "--bucket", "later", "--blocked-on", "which cache"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("moving cache-tokens would break the roadmap");
  expect(result.stderr).toContain("split-app.md: depends on 'cache-tokens' ('later', rank 2)");
  expect(snapshot(root)).toEqual(before);
});

test("move out of later drops blocked_on and asks for the decision", () => {
  const root = valid();

  const result = run(["move", "rotate-keys", "--bucket", "now"], root);

  ok(result);
  expect(result.stdout).toContain("record in its prose what was decided");
  expect(meta(join(root, "roadmap/items/rotate-keys.md"))).not.toHaveProperty("blocked_on");
  checks(root);
});

test("move into later needs the open question", () => {
  const root = valid();

  const refused = run(["move", "split-app", "--bucket", "later"], root);
  const moved = run(["move", "split-app", "--bucket", "later", "--blocked-on", "where to split"], root);

  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain("--blocked-on is required");
  ok(moved);
  expect(meta(join(root, "roadmap/items/split-app.md")).blocked_on).toBe("where to split");
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
  expect(String(meta(a).updated)).toBe(String(D(2026, 10, 1)));
  expect(read(a).split("updated =").length - 1).toBe(1);
  for (const id of "bcde") expect(meta(join(root, `roadmap/items/${id}.md`))).not.toHaveProperty("updated");
  checks(root);
});

test("move refuses a no-op", () => {
  const result = run(["move", "split-app", "--bucket", "next"], valid());

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("is already in 'next'");
});

test("move --rank raises an item and shifts the ones it passes down", () => {
  const root = tempDir();
  fourInNow(root);

  const result = run(["move", "c", "--rank", "1"], root);

  ok(result);
  expect(result.stdout.split("\n").filter(Boolean)).toEqual([
    "Moved roadmap/items/c.md to rank 1 in 'now'.",
    "Shifted a, b down a rank, below it.",
  ]);
  expect(ranks(root)).toEqual({ c: ["now", 1], a: ["now", 2], b: ["now", 3], d: ["now", 4], e: ["next", 1] });
  checks(root);
});

test("move --rank lowers an item and shifts the ones it passes up", () => {
  const root = tempDir();
  fourInNow(root);

  const result = run(["move", "a", "--rank", "3"], root);

  ok(result);
  expect(result.stdout.split("\n")[1]).toBe("Shifted b, c up a rank, above it.");
  expect(ranks(root)).toEqual({ b: ["now", 1], c: ["now", 2], a: ["now", 3], d: ["now", 4], e: ["next", 1] });
  checks(root);
});

describe("move --above lands directly above the other item", () => {
  test.each([
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
    expect(now.join("")).toBe(order);
    checks(root);
  });
});

test("move --above takes the other item's bucket", () => {
  const root = tempDir();
  fourInNow(root);

  ok(run(["move", "e", "--above", "b"], root));

  expect(ranks(root)).toEqual({ a: ["now", 1], e: ["now", 2], b: ["now", 3], c: ["now", 4], d: ["now", 5] });
  checks(root);
});

test("move --rank into another bucket shifts that bucket down", () => {
  const root = tempDir();
  fourInNow(root);

  ok(run(["move", "a", "--bucket", "next", "--rank", "1"], root));

  expect(ranks(root).a).toEqual(["next", 1]);
  expect(ranks(root).e).toEqual(["next", 2]);
  checks(root);
});

test("move --rank refuses to put an item above its dependency, and writes nothing", () => {
  const root = tempDir();
  fourInNow(root, { c: ["b"] });
  const before = snapshot(root);

  const result = run(["move", "c", "--rank", "1"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("moving c would break the roadmap");
  expect(snapshot(root)).toEqual(before);
});

describe("move refuses a bad re-rank", () => {
  test.each([
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

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
  });
});

test("there is no WIP-tracking command", () => {
  const result = run(["claim", "cache-tokens"], valid());

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("invalid choice: 'claim'");
});

test("move and close refuse an archived item", () => {
  const root = valid();
  for (const args of [
    ["move", "rewrite-in-rust", "--bucket", "now"],
    ["close", "rewrite-in-rust", "--outcome", "shipped"],
  ]) {
    const result = run(args, root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("it is already closed");
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
  expect([item.rank, item.depends_on]).toEqual([2, ["split-app", "drop-legacy-login"]]);
  checks(root);
});

test("new refuses to file an item ahead of its dependencies", () => {
  const root = valid();

  const result = run(["new", "too-soon", "--title", "T", "--bucket", "now", "--depends-on", "split-app"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("filing too-soon would break the roadmap");
  expect(result.stderr).toContain("which must come first");
  expect(existsSync(join(root, "roadmap/items/too-soon.md"))).toBe(false);
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
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("after-rotation.md: a 'later' item must name what it is blocked_on");
  }
  expect(snapshot(root)).toEqual(before);
});

test("close refuses to decline an item others depend on", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["close", "cache-tokens", "--outcome", "declined"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("closing cache-tokens as declined would break the roadmap");
  expect(result.stderr).toContain("split-app.md: depends on 'cache-tokens', which was declined");
  expect(snapshot(root)).toEqual(before);
});

test("close may ship an item others depend on", () => {
  const root = valid();

  ok(run(["close", "cache-tokens", "--outcome", "shipped"], root));

  expect(read(join(root, "roadmap/README.md"))).toContain("[Cache auth tokens](archive/cache-tokens.md) (shipped)");
  checks(root);
});

describe("close hints at --as when shipped without it", () => {
  test.each([
    [["--outcome", "shipped"], true],
    [["--outcome", "shipped", "--as", "pr-9"], false],
    [["--outcome", "declined"], false],
  ] as const)("%j", (args, hinted) => {
    const result = run(["close", "rotate-keys", ...args], valid());

    ok(result);
    expect(result.stdout.includes("No --as given")).toBe(hinted);
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
  expect(first.stdout).toBe("Recorded a decision in roadmap/decisions.md.\n");
  expect(read(log)).toBe(
    `${DECISIONS_INTRO}\n## 2026-10-01: Ship weekly\n\nSmaller releases.\n\n## 2026-10-02: No epics\n\nStay KISS.\n`,
  );
  checks(root);
});

describe("decide needs a one-line title and the reasoning", () => {
  test.each([
    [["--title", "Ship weekly"], "the following arguments are required: --body"],
    [["--title", "Ship weekly", "--body", " "], "--body must say why"],
    [["--title", "Two\nlines", "--body", "Why."], "--title must be one non-empty line"],
  ])("%j", (args, expected) => {
    const root = valid();
    const before = read(join(root, "roadmap/decisions.md"));

    const result = run(["decide", ...args], root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(read(join(root, "roadmap/decisions.md"))).toBe(before);
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

  expect(meta(join(root, "roadmap/items/retry-rust.md")).supersedes).toBe("rewrite-in-rust");
  expect(read(done)).toContain("superseded by [Rust, again](items/retry-rust.md)");
  checks(root);

  ok(run(["close", "retry-rust", "--outcome", "shipped", "--as", "pr-3"], root));

  expect(read(done)).toContain("superseded by [Rust, again](archive/retry-rust.md)");
  checks(root);
});

test("new refuses to supersede a shipped item, and writes nothing", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(
    ["new", "again", "--title", "Again", "--bucket", "now", "--supersedes", "drop-legacy-login"],
    root,
  );

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("supersedes 'drop-legacy-login', which shipped");
  expect(snapshot(root)).toEqual(before);
});

const MILESTONES = '[milestones]\nbeta = { title = "Public beta", date = 2026-12-01 }\n';

test("new records the milestone an item is due for", () => {
  const root = tempDir();
  makeRoadmap(root, { "roadmap.toml": MILESTONES });

  ok(run(["new", "ship-it", "--title", "T", "--bucket", "now", "--milestone", "beta", "--body", "Why."], root));

  expect(meta(join(root, "roadmap/items/ship-it.md")).milestone).toBe("beta");
  expect(read(join(root, "roadmap/README.md"))).toContain("**Due for:** Public beta (2026-12-01)");
  checks(root);
});

describe("new refuses an unknown milestone, and a milestone's id", () => {
  test.each([
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

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(readdirSync(join(root, "roadmap/items")).filter((p) => p.endsWith(".md"))).toEqual([]);
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

  expect(meta(join(root, "roadmap/items/due.md")).rank).toBe(1);
  expect(meta(join(root, "roadmap/items/waits.md")).rank).toBe(2);
  checks(root);
});

test("move refuses to put an item behind the items waiting on its milestone", () => {
  const root = tempDir();
  dueAndWaiting(root);

  const result = run(["move", "due", "--bucket", "later", "--blocked-on", "a call"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("waits.md: depends on milestone 'beta' (2026-12-01), but 'due' ('later', rank 1)");
});

test("index --renumber resolves a rank collision, oldest first", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/newer.md": itemText(openMeta({ id: "newer", filed: D(2026, 9, 8) })),
    "items/older.md": itemText(openMeta({ id: "older" })),
  });
  expect(run(["check"], root).stderr).toContain("[rank]");

  const result = run(["index", "--renumber"], root);

  ok(result);
  expect(result.stdout.split("\n")[0]).toBe("Renumbered newer.");
  expect(meta(join(root, "roadmap/items/older.md")).rank).toBe(1);
  expect(meta(join(root, "roadmap/items/newer.md")).rank).toBe(2);
  checks(root);
});

test("index --renumber puts a dependency first among tied items", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/dependent.md": itemText(openMeta({ id: "dependent", depends_on: ["dependency"] })),
    "items/dependency.md": itemText(openMeta({ id: "dependency", filed: D(2026, 9, 8) })),
  });

  ok(run(["index", "--renumber"], root));

  expect(meta(join(root, "roadmap/items/dependency.md")).rank).toBe(1);
  expect(meta(join(root, "roadmap/items/dependent.md")).rank).toBe(2);
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

  expect(read(join(root, "roadmap/items/first.md"))).toBe(first);
  expect(meta(join(root, "roadmap/items/third.md")).rank).toBe(2);
});

test("index --renumber changes nothing on a clean roadmap", () => {
  const root = valid();
  const before = snapshot(root);

  const result = run(["index", "--renumber"], root);

  ok(result);
  expect(result.stdout).toBe("Index already up to date.\n");
  expect(snapshot(root)).toEqual(before);
});
