// `list` prints the queue for agents and scripts. `split` gives an item that
// turned out to be two pieces of work a sibling directly below it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parse } from "../src/model.ts";
import { closedMeta, D, itemText, makeRoadmap, openMeta, run, snapshot, tempDir, validCopy } from "./helpers.ts";

const valid = () => validCopy(tempDir());
const lines = (text: string) => text.split("\n").filter(Boolean);

test("list prints the queue in order, with what holds each item", () => {
  const result = run(["list"], valid());

  expect(result.status, result.stderr).toBe(0);
  expect(lines(result.stdout)).toEqual([
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

  expect(lines(run(["list", "--bucket", "next"], root).stdout)[0]).toBe("next 1  split-app  Split app.py");
  expect(run(["list", "--bucket", "now", "--json"], root).stdout.split('"id"').length - 1).toBe(1);
});

test("list --json holds the frontmatter and path of open items only", () => {
  const items = JSON.parse(run(["list", "--json"], valid()).stdout);

  expect(items.map((i: { id: string }) => i.id)).toEqual(["cache-tokens", "split-app", "rotate-keys"]);
  expect(items[0].path).toBe("roadmap/items/cache-tokens.md");
  expect(items[0].filed).toBe("2026-08-01");
  expect(items[0].refs).toEqual({ files: ["src/app.py"], specs: ["auth"] });
});

test("list says when there is nothing open", () => {
  const root = tempDir();
  makeRoadmap(root, {});

  expect(run(["list"], root).stdout).toBe("No open items.\n");
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

  expect(result.status, result.stderr).toBe(0);
  expect(lines(result.stdout)).toEqual([
    "Split big-two from big: rank 3 in 'now'.",
    "Shifted after down a rank, below it.",
    "Narrow roadmap/items/big.md's prose to the part it keeps.",
  ]);
  const created = parse(join(root, "roadmap/items/big-two.md"));
  expect(created.meta).toEqual({
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
  expect(created.body.trim()).toBe("The rest.");
  expect(parse(join(root, "roadmap/items/after.md")).meta.rank).toBe(4);
  expect(run(["check"], root).status).toBe(0);
});

test("split of a later item copies what it is blocked on", () => {
  const root = valid();

  const result = run(["split", "rotate-keys", "rotate-certs", "--title", "Rotate certificates"], root);

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("body is a placeholder");
  const meta = parse(join(root, "roadmap/items/rotate-certs.md")).meta;
  expect([meta.bucket, meta.rank, meta.blocked_on]).toEqual(["later", 2, "whether rotation is manual or scheduled"]);
});

describe("split refuses a bad id, and writes nothing", () => {
  test.each([
    ["split-app", "already exists; ids are never reused"],
    ["rewrite-in-rust", "already exists; ids are never reused"],
    ["Not_A_Slug", "is not a kebab-case slug"],
  ])("%s", (newId, expected) => {
    const root = valid();
    const before = snapshot(root);

    const result = run(["split", "cache-tokens", newId, "--title", "T"], root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(expected);
    expect(snapshot(root)).toEqual(before);
  });
});
