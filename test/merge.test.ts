// Two branches that each change the roadmap, merged: the generated blocks in
// README.md and done.md clash unless `merge-driver` takes them, and ranks that
// both branches handed out collide until `index --renumber`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BIN, contains, git, gitRepo, run, tempDir, validCopy } from "./helpers.ts";

const read = (path: string) => readFileSync(path, "utf8");

/** git that may fail, for merges. */
function attempt(repo: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function repo(): string {
  const root = gitRepo(validCopy(tempDir()));
  git(root, "checkout", "-q", "-b", "base");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  return root;
}

function useDriver(root: string): void {
  writeFileSync(join(root, ".gitattributes"), "roadmap/README.md merge=roadmap\nroadmap/done.md merge=roadmap\n");
  git(root, "add", ".gitattributes");
  git(root, "commit", "-qm", "attributes");
  git(root, "config", "merge.roadmap.driver", `"${process.execPath}" "${BIN}" merge-driver %O %A %B %P`);
}

function onBranch(root: string, name: string, ...command: string[]): void {
  git(root, "switch", "-q", "-c", name, "base");
  assert.equal(run(command, root).status, 0);
  git(root, "add", "-A");
  git(root, "commit", "-qm", name);
}

function closeOneOnEachBranch(root: string) {
  onBranch(root, "a", "close", "rotate-keys", "--outcome", "declined");
  onBranch(root, "b", "close", "split-app", "--outcome", "shipped");
  return attempt(root, "merge", "-q", "a");
}

test("without the driver, two closes conflict in the generated blocks", () => {
  const root = repo();
  const result = closeOneOnEachBranch(root);

  // git translates its messages, so ask it which files are left unmerged.
  assert.notEqual(result.status, 0);
  assert.deepEqual(git(root, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean), [
    "roadmap/README.md",
    "roadmap/done.md",
  ]);
});

test("with the driver, two closes merge, and index makes check pass", () => {
  const root = repo();
  useDriver(root);

  const result = closeOneOnEachBranch(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  contains(result.stderr, "run `roadmap index` once the merge is done");
  assert.equal(run(["index"], root).status, 0);
  assert.equal(run(["check", "--base", "base"], root).status, 0);
  const done = read(join(root, "roadmap/done.md"));
  contains(done, "archive/rotate-keys.md");
  contains(done, "archive/split-app.md");
});

test("the driver leaves a clash in hand-written text as a conflict", () => {
  const root = repo();
  useDriver(root);
  const readme = join(root, "roadmap/README.md");
  for (const [branch, word] of [
    ["a", "Alpha"],
    ["b", "Beta"],
  ] as const) {
    git(root, "switch", "-q", "-c", branch, "base");
    writeFileSync(readme, read(readme).replace("# Roadmap", `# Roadmap ${word}`));
    git(root, "commit", "-qam", branch);
  }

  const result = attempt(root, "merge", "-q", "a");

  assert.notEqual(result.status, 0);
  const text = read(readme);
  contains(text, "<<<<<<<");
  assert.equal(text.split("<!-- BEGIN INDEX").length - 1, 1);
});

test("two branches filing in one bucket collide until renumbered", () => {
  const root = repo();
  useDriver(root);
  for (const name of ["first", "second"]) {
    onBranch(root, name, "new", name, "--title", name, "--bucket", "now", "--body", "Prose.");
  }

  assert.equal(attempt(root, "merge", "-q", "first").status, 0);
  run(["index"], root);
  contains(run(["check"], root).stderr, "[rank]");

  assert.equal(run(["index", "--renumber"], root).status, 0);
  assert.equal(run(["check"], root).status, 0);
});
