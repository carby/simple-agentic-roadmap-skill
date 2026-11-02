// Two branches that each change the roadmap, merged: the generated blocks in
// README.md and done.md clash unless `merge-driver` takes them, and ranks that
// both branches handed out collide until `index --renumber`.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { BIN, git, gitRepo, run, tempDir, validCopy } from "./helpers.ts";

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
  expect(run(command, root).status).toBe(0);
  git(root, "add", "-A");
  git(root, "commit", "-qm", name);
}

function closeOneOnEachBranch(root: string) {
  onBranch(root, "a", "close", "rotate-keys", "--outcome", "declined");
  onBranch(root, "b", "close", "split-app", "--outcome", "shipped");
  return attempt(root, "merge", "-q", "a");
}

test("without the driver, two closes conflict in the generated blocks", () => {
  const result = closeOneOnEachBranch(repo());

  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain("CONFLICT");
  expect(result.stdout).toContain("roadmap/done.md");
});

test("with the driver, two closes merge, and index makes check pass", () => {
  const root = repo();
  useDriver(root);

  const result = closeOneOnEachBranch(root);

  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("run `roadmap.py index` once the merge is done");
  expect(run(["index"], root).status).toBe(0);
  expect(run(["check", "--base", "base"], root).status).toBe(0);
  const done = read(join(root, "roadmap/done.md"));
  expect(done).toContain("archive/rotate-keys.md");
  expect(done).toContain("archive/split-app.md");
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

  expect(result.status).not.toBe(0);
  const text = read(readme);
  expect(text).toContain("<<<<<<<");
  expect(text.split("<!-- BEGIN INDEX").length - 1).toBe(1);
});

test("two branches filing in one bucket collide until renumbered", () => {
  const root = repo();
  useDriver(root);
  for (const name of ["first", "second"]) {
    onBranch(root, name, "new", name, "--title", name, "--bucket", "now", "--body", "Prose.");
  }

  expect(attempt(root, "merge", "-q", "first").status).toBe(0);
  run(["index"], root);
  expect(run(["check"], root).stderr).toContain("[rank]");

  expect(run(["index", "--renumber"], root).status).toBe(0);
  expect(run(["check"], root).status).toBe(0);
});
