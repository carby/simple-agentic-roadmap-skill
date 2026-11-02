// `review` is the upkeep `check` skips because it depends on today's date:
// milestones that have passed, and Now and Next items nobody has touched. It
// is advice, so it always exits 0.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { closedMeta, D, gitRepo, itemText, makeRoadmap, openMeta, run, tempDir } from "./helpers.ts";

const MILESTONES =
  '[milestones]\nalpha = { title = "Alpha", date = 2026-11-01 }\nbeta = { title = "Beta", date = 2026-12-01 }\n';

/** git with the author and committer dates set to noon on `date`. */
function gitOn(root: string, date: string, ...args: string[]): void {
  const stamp = `${date}T12:00:00`;
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp },
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

function review(root: string, ...args: string[]): string[] {
  const result = run(["review", ...args], root);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.split("\n").filter(Boolean);
}

test("a clean roadmap has nothing to review", () => {
  const root = tempDir();
  makeRoadmap(root, { "items/a.md": itemText(openMeta({ id: "a", filed: D(2026, 10, 1) })) });

  expect(review(root, "--date", "2026-10-22").at(-1)).toBe("Nothing to review.");
});

test("passed milestones are listed with the items that name them", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "roadmap.toml": MILESTONES,
    "items/a.md": itemText(openMeta({ id: "a", milestone: "alpha", filed: D(2026, 10, 30) })),
    "items/b.md": itemText(openMeta({ id: "b", bucket: "next", depends_on: ["alpha"], filed: D(2026, 10, 30) })),
  });

  const lines = review(root, "--date", "2026-11-11");

  expect(lines[0]?.startsWith("Milestones that have passed but open items still name")).toBe(true);
  expect(lines[1]).toBe("  alpha: Alpha (2026-11-01), 10 days ago; due: a; waiting: b");
  expect(lines.some((l) => l.includes("beta"))).toBe(false);
});

test("a passed milestone nothing open names is history", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "roadmap.toml": MILESTONES,
    "archive/a.md": itemText(closedMeta({ id: "a", milestone: "alpha" })),
  });

  expect(review(root, "--date", "2026-12-15").at(-1)).toBe("Nothing to review.");
});

test("a milestone due today has not passed", () => {
  const root = tempDir();
  makeRoadmap(root, { "roadmap.toml": MILESTONES });

  expect(review(root, "--date", "2026-11-01").at(-1)).toBe("Nothing to review.");
});

test("Now and Next items untouched for 60 days are stale", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/old-now.md": itemText(openMeta({ id: "old-now", filed: D(2026, 8, 1) })),
    "items/argued.md": itemText(
      openMeta({ id: "argued", bucket: "next", filed: D(2026, 6, 1), updated: D(2026, 10, 1) }),
    ),
    "items/old-later.md": itemText(
      openMeta({ id: "old-later", bucket: "later", blocked_on: "x", filed: D(2026, 1, 1) }),
    ),
  });

  const lines = review(root, "--date", "2026-10-01");

  expect(lines).toContain("  now 1  old-now  last touched 2026-08-01 (61 days ago)");
  expect(lines.some((l) => l.includes("argued") || l.includes("old-later"))).toBe(false);
  expect(lines.at(-1)).toContain("only filed and updated dates count");
});

test("--days sets the cutoff", () => {
  const root = tempDir();
  makeRoadmap(root, { "items/a.md": itemText(openMeta({ id: "a", filed: D(2026, 10, 1) })) });
  const stale = (days: string) =>
    review(root, "--date", "2026-10-22", "--days", days).some((l) => l.includes(" a  last touched"));

  expect(stale("21")).toBe(true);
  expect(stale("22")).toBe(false);
});

test("a recent commit to the item counts as a touch", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "items/edited.md": itemText(openMeta({ id: "edited", filed: D(2026, 6, 1) })),
    "items/left.md": itemText(openMeta({ id: "left", rank: 2, filed: D(2026, 6, 1) })),
  });
  gitRepo(root);
  gitOn(root, "2026-06-01", "add", "-A");
  gitOn(root, "2026-06-01", "commit", "-qm", "file");
  const edited = join(root, "roadmap/items/edited.md");
  writeFileSync(edited, readFileSync(edited, "utf8").replace("Prose.", "Better prose."));
  gitOn(root, "2026-10-01", "commit", "-qam", "re-argue");

  const lines = review(root, "--date", "2026-10-22");

  expect(lines).toContain("  now 2  left  last touched 2026-06-01 (143 days ago)");
  expect(lines.some((l) => l.includes("edited"))).toBe(false);
  expect(lines.some((l) => l.includes("only filed and updated"))).toBe(false);
});
