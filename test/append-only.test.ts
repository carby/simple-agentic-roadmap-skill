// `check --base` holds archive/ and decisions.md append-only against a git
// ref: an entry may gain lines, but it may not lose, change or move any.

import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { git, gitRepo, run, tempDir, validCopy } from "./helpers.ts";

const ENTRY = "roadmap/archive/rewrite-in-rust.md";
const DECISIONS = "roadmap/decisions.md";

const read = (path: string) => readFileSync(path, "utf8");
const checkBase = (root: string) => run(["check", "--base", "HEAD"], root);

function repo(): string {
  const root = gitRepo(validCopy(tempDir()));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  return root;
}

test("an unchanged archive passes", () => {
  expect(checkBase(repo()).status).toBe(0);
});

test("an appended dated annotation passes", () => {
  const root = repo();
  const entry = join(root, ENTRY);
  writeFileSync(entry, `${read(entry)}\n**2026-10-01:** the build-time figure predates incremental builds.\n`);

  const result = checkBase(root);

  expect(result.status, result.stderr).toBe(0);
});

test("a newly closed item passes", () => {
  const root = repo();
  expect(run(["close", "cache-tokens", "--outcome", "shipped"], root).status).toBe(0);

  const result = checkBase(root);

  expect(result.status, result.stderr).toBe(0);
});

test("a changed line fails", () => {
  const root = repo();
  const entry = join(root, ENTRY);
  writeFileSync(entry, read(entry).replace("Declined.", "Shelved."));

  const result = checkBase(root);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("archived entries only take added lines");
  expect(result.stderr).toContain(`${ENTRY}:`);
  expect(result.stderr).toContain("[append-only]");
});

test("a deleted entry fails", () => {
  const root = repo();
  unlinkSync(join(root, ENTRY));
  run(["index"], root);

  const result = checkBase(root);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("existed at HEAD and is gone");
});

test("an entry moved back to items fails", () => {
  const root = repo();
  renameSync(join(root, ENTRY), join(root, "roadmap/items/rewrite-in-rust.md"));

  expect(checkBase(root).stderr).toContain("existed at HEAD and is gone");
});

test("a new decision passes", () => {
  const root = repo();
  const result = run(["decide", "--title", "Ship weekly", "--body", "Smaller releases."], root);
  expect(result.status, result.stderr).toBe(0);

  expect(checkBase(root).status).toBe(0);
});

test("an edited decision fails", () => {
  const root = repo();
  const decisions = join(root, DECISIONS);
  writeFileSync(decisions, read(decisions).replace("Rules out a shared token cache.", "Allows a cache."));

  const result = checkBase(root);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("decisions.md only takes added lines");
  expect(result.stderr).toContain(`${DECISIONS}:`);
  expect(result.stderr).toContain("[append-only]");
});

test("a deleted decisions log fails", () => {
  const root = repo();
  unlinkSync(join(root, DECISIONS));

  const result = checkBase(root);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("existed at HEAD and is gone; a decision is reversed by a new entry");
});

test("a decisions log new since the base passes", () => {
  const root = repo();
  git(root, "rm", "-q", DECISIONS);
  git(root, "commit", "-qm", "no log");
  expect(run(["decide", "--title", "Ship weekly", "--body", "Smaller releases."], root).status).toBe(0);

  expect(checkBase(root).status).toBe(0);
});

test("an unknown base is a usage error", () => {
  const result = run(["check", "--base", "no-such-ref"], repo());

  expect(result.status).toBe(2);
  expect(result.stderr.startsWith("error: git ")).toBe(true);
});
