// The whole lifecycle in a fresh repo: init, new, move, close. The roadmap has
// to pass `check` after every step, because that is what an agent following
// SKILL.md relies on.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "../src/model.ts";
import { D, run, tempDir } from "./helpers.ts";

const read = (path: string) => readFileSync(path, "utf8");

function repo(): string {
  const root = tempDir();
  const result = run(["init"], root);
  expect(result.status, result.stderr).toBe(0);
  return root;
}

/** Run a command, then require a clean check. Returns its stdout. */
function ok(root: string, ...args: string[]): string {
  const result = run(args, root);
  expect(result.status, result.stderr).toBe(0);
  const checked = run(["check"], root);
  expect(checked.status, checked.stderr).toBe(0);
  return result.stdout;
}

test("init writes a roadmap that names npx roadmap and passes check", () => {
  const root = repo();

  for (const name of ["README.md", "done.md", "decisions.md", "roadmap.toml", "items/.gitkeep", "archive/.gitkeep"]) {
    expect(existsSync(join(root, "roadmap", name)), name).toBe(true);
  }
  expect(read(join(root, "roadmap/README.md"))).not.toContain("{{");
  expect(read(join(root, "roadmap/README.md"))).toContain("npx roadmap check");
  expect(run(["check"], root).status).toBe(0);
});

test("a decision can be logged right after init", () => {
  const root = repo();

  ok(root, "decide", "--title", "Ship weekly", "--body", "Smaller releases.");

  expect(read(join(root, "roadmap/decisions.md"))).toContain("## ");
});

test("new, move, close", () => {
  const root = repo();
  // The first item links to the second before it exists, so the check waits for both.
  run(
    ["new", "add-cache", "--title", "Add a cache", "--bucket", "now", "--date", "2026-09-01"].concat([
      "--body",
      "Slow. Blocks [the split](split-module.md).",
    ]),
    root,
  );
  ok(
    root,
    "new",
    "split-module",
    "--title",
    "Split the module",
    "--bucket",
    "now",
    "--date",
    "2026-09-02",
    "--body",
    "Too big. Needs [the cache](add-cache.md) first.",
  ); // prettier-ignore
  ok(root, "move", "add-cache", "--bucket", "next", "--date", "2026-09-05");

  const moved = parse(join(root, "roadmap/items/add-cache.md"));
  expect([moved.meta.bucket, moved.meta.rank]).toEqual(["next", 1]);

  const out = ok(root, "close", "add-cache", "--outcome", "shipped", "--as", "pr-7", "--date", "2026-09-10");

  expect(existsSync(join(root, "roadmap/items/add-cache.md"))).toBe(false);
  const closed = parse(join(root, "roadmap/archive/add-cache.md"), true);
  expect(closed.meta).toEqual({
    id: "add-cache",
    title: "Add a cache",
    filed: D(2026, 9, 1),
    updated: D(2026, 9, 5),
    closed: D(2026, 9, 10),
    outcome: "shipped",
    shipped_as: "pr-7",
  });
  // Links follow the move both ways, and only hand-written edits are reported.
  expect(closed.body).toContain("[the split](../items/split-module.md)");
  expect(read(join(root, "roadmap/items/split-module.md"))).toContain("[the cache](../archive/add-cache.md)");
  expect(out.split("\n").filter(Boolean)).toEqual([
    "Updated links in roadmap/items/split-module.md.",
    "Closed add-cache as shipped: roadmap/archive/add-cache.md.",
  ]);
  expect(read(join(root, "roadmap/done.md"))).toContain(
    "- **shipped** [Add a cache](archive/add-cache.md) — closed 2026-09-10 as `pr-7`",
  );
});

test("close keeps comments and tables in the frontmatter", () => {
  const root = repo();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/app.py"), "");
  const item = join(root, "roadmap/items/keep-layout.md");
  writeFileSync(
    item,
    "+++\n" +
      'id = "keep-layout"\n' +
      'title = "Keep layout"  # a comment\n' +
      'bucket = "later"\n' +
      "rank = 1\n" +
      "filed = 2026-09-01\n" +
      'blocked_on = "a call"\n' +
      "\n" +
      "[refs]\n" +
      'files = ["src/app.py"]\n' +
      "+++\n\nProse.\n",
  );
  ok(root, "index");

  ok(root, "close", "keep-layout", "--outcome", "declined", "--date", "2026-09-05");

  expect(read(join(root, "roadmap/archive/keep-layout.md"))).toBe(
    "+++\n" +
      'id = "keep-layout"\n' +
      'title = "Keep layout"  # a comment\n' +
      "filed = 2026-09-01\n" +
      "closed = 2026-09-05\n" +
      'outcome = "declined"\n' +
      "\n" +
      "[refs]\n" +
      'files = ["src/app.py"]\n' +
      "+++\n\nProse.\n",
  );
});

test("an edit the frontmatter editor cannot verify is refused", () => {
  const root = repo();
  const item = join(root, "roadmap/items/multi-line.md");
  writeFileSync(
    item,
    '+++\nid = "multi-line"\ntitle = "T"\nbucket = "later"\nrank = 1\nfiled = 2026-09-01\n' +
      'blocked_on = """a call\nspanning lines"""\n+++\n\nProse.\n',
  );
  const before = read(item);

  const result = run(["close", "multi-line", "--outcome", "declined"], root);

  expect(result.status).toBe(2);
  expect(result.stderr).toContain("edit it by hand");
  expect(read(item)).toBe(before);
});
