// `list` prints the queue for agents and scripts. `split` gives an item that
// turned out to be two pieces of work a sibling directly below it.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { parse } from "../src/model.ts";
import {
  closedMeta,
  contains,
  D,
  each,
  itemText,
  makeRoadmap,
  openMeta,
  run,
  snapshot,
  tempDir,
  validCopy,
} from "./helpers.ts";

const valid = () => validCopy(tempDir());
const lines = (text: string) => text.split("\n").filter(Boolean);

test("list prints the queue in order, with what holds each item", () => {
  const result = run(["list"], valid());

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "now 1  cache-tokens  Cache auth tokens",
    "    gate: p99 login under 50ms",
    "next 1  split-app  Split app.py",
    "    depends on: cache-tokens, drop-legacy-login",
    "later 1  rotate-keys  Rotate signing keys",
    "    blocked on: whether rotation is manual or scheduled",
  ]);
});

test("list filters by bucket", () => {
  const root = valid();

  assert.equal(lines(run(["list", "--bucket", "next"], root).stdout)[0], "next 1  split-app  Split app.py");
  assert.equal(run(["list", "--bucket", "now", "--json"], root).stdout.split('"id"').length - 1, 1);
});

test("list --json holds the frontmatter and path of open items only", () => {
  const items = JSON.parse(run(["list", "--json"], valid()).stdout);

  assert.deepEqual(
    items.map((i: { id: string }) => i.id),
    ["cache-tokens", "split-app", "rotate-keys"],
  );
  assert.equal(items[0].path, "roadmap/items/cache-tokens.md");
  assert.equal(items[0].filed, "2026-08-01");
  assert.deepEqual(items[0].refs, { files: ["src/app.py"], specs: ["auth"] });
});

test("list says when there is nothing open", () => {
  const root = tempDir();
  makeRoadmap(root, {});

  assert.equal(run(["list"], root).stdout, "No open items.\n");
});

test("split adds a sibling below the original, with its place and dependencies", () => {
  const root = tempDir();
  makeRoadmap(root, {
    "roadmap.toml": '[milestones]\nbeta = { title = "Beta", date = 2026-12-01 }\n',
    "items/base.md": itemText(openMeta({ id: "base" })),
    "items/big.md": itemText(
      openMeta({ id: "big", rank: 2, gate: "fast", milestone: "beta", depends_on: ["base"], supersedes: "x" }),
      "Prose.",
      { files: ["README.md"] },
    ),
    "items/after.md": itemText(openMeta({ id: "after", rank: 3 })),
    "archive/x.md": itemText(closedMeta({ id: "x", outcome: "declined" })),
  });
  writeFileSync(join(root, "README.md"), "");

  const result = run(
    ["split", "big", "big-two", "--title", "Second half", "--body", "The rest.", "--date", "2026-10-22"],
    root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "Split big-two from big: rank 3 in 'now'.",
    "Shifted after down a rank, below it.",
    "Narrow roadmap/items/big.md's prose to the part it keeps.",
  ]);
  const created = parse(join(root, "roadmap/items/big-two.md"));
  assert.deepEqual(created.meta, {
    id: "big-two",
    title: "Second half",
    bucket: "now",
    rank: 3,
    filed: D(2026, 10, 22),
    gate: "fast",
    milestone: "beta",
    depends_on: ["base"],
    refs: { files: ["README.md"] },
  });
  assert.equal(created.body.trim(), "The rest.");
  assert.equal(parse(join(root, "roadmap/items/after.md")).meta.rank, 4);
  assert.equal(run(["check"], root).status, 0);
});

test("split of a later item copies what it is blocked on", () => {
  const root = valid();

  const result = run(["split", "rotate-keys", "rotate-certs", "--title", "Rotate certificates"], root);

  assert.equal(result.status, 0, result.stderr);
  contains(result.stdout, "body is a placeholder");
  const meta = parse(join(root, "roadmap/items/rotate-certs.md")).meta;
  assert.deepEqual([meta.bucket, meta.rank, meta.blocked_on], ["later", 2, "whether rotation is manual or scheduled"]);
});

describe("split refuses a bad id, and writes nothing", () => {
  each([
    ["split-app", "already exists; ids are never reused"],
    ["rewrite-in-rust", "already exists; ids are never reused"],
    ["Not_A_Slug", "is not a kebab-case slug"],
  ])("%s", (newId, expected) => {
    const root = valid();
    const before = snapshot(root);

    const result = run(["split", "cache-tokens", newId, "--title", "T"], root);

    assert.equal(result.status, 2);
    contains(result.stderr, expected);
    assert.deepEqual(snapshot(root), before);
  });
});
