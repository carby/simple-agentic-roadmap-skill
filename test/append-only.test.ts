// `check --base` holds archive/ and decisions.md append-only against a git
// ref: an entry may gain lines, but it may not lose, change or move any.

import assert from "node:assert/strict";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { contains, git, gitRepo, run, tempDir, validCopy } from "./helpers.ts";

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
  assert.equal(checkBase(repo()).status, 0);
});

test("an appended dated annotation passes", () => {
  const root = repo();
  const entry = join(root, ENTRY);
  writeFileSync(entry, `${read(entry)}\n**2026-10-01:** the build-time figure predates incremental builds.\n`);

  const result = checkBase(root);

  assert.equal(result.status, 0, result.stderr);
});

test("a newly closed item passes", () => {
  const root = repo();
  assert.equal(run(["close", "cache-tokens", "--outcome", "shipped"], root).status, 0);

  const result = checkBase(root);

  assert.equal(result.status, 0, result.stderr);
});

test("a changed line fails", () => {
  const root = repo();
  const entry = join(root, ENTRY);
  writeFileSync(entry, read(entry).replace("Declined.", "Shelved."));

  const result = checkBase(root);

  assert.equal(result.status, 1);
  contains(result.stderr, "archived entries only take added lines");
  contains(result.stderr, `${ENTRY}:`);
  contains(result.stderr, "[append-only]");
});

test("a deleted entry fails", () => {
  const root = repo();
  unlinkSync(join(root, ENTRY));
  run(["index"], root);

  const result = checkBase(root);

  assert.equal(result.status, 1);
  contains(result.stderr, "existed at HEAD and is gone");
});

test("an entry moved back to items fails", () => {
  const root = repo();
  renameSync(join(root, ENTRY), join(root, "roadmap/items/rewrite-in-rust.md"));

  contains(checkBase(root).stderr, "existed at HEAD and is gone");
});

test("a new decision passes", () => {
  const root = repo();
  const result = run(["decide", "--title", "Ship weekly", "--body", "Smaller releases."], root);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(checkBase(root).status, 0);
});

test("an edited decision fails", () => {
  const root = repo();
  const decisions = join(root, DECISIONS);
  writeFileSync(decisions, read(decisions).replace("Rules out a shared token cache.", "Allows a cache."));

  const result = checkBase(root);

  assert.equal(result.status, 1);
  contains(result.stderr, "decisions.md only takes added lines");
  contains(result.stderr, `${DECISIONS}:`);
  contains(result.stderr, "[append-only]");
});

test("a deleted decisions log fails", () => {
  const root = repo();
  unlinkSync(join(root, DECISIONS));

  const result = checkBase(root);

  assert.equal(result.status, 1);
  contains(result.stderr, "existed at HEAD and is gone; a decision is reversed by a new entry");
});

test("a decisions log new since the base passes", () => {
  const root = repo();
  git(root, "rm", "-q", DECISIONS);
  git(root, "commit", "-qm", "no log");
  assert.equal(run(["decide", "--title", "Ship weekly", "--body", "Smaller releases."], root).status, 0);

  assert.equal(checkBase(root).status, 0);
});

test("an unknown base is a usage error", () => {
  const result = run(["check", "--base", "no-such-ref"], repo());

  assert.equal(result.status, 2);
  assert.equal(result.stderr.startsWith("error: git "), true);
});
