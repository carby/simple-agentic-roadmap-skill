// Which package the GitHub Action runs: the input, then the repo's lockfile
// pin, then a plain semver range from its package.json, then its own version.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
// @ts-expect-error: a plain .mjs script with no type declarations
import { NAME, resolveSpec } from "../scripts/action-spec.mjs";
import { tempDir } from "./helpers.ts";

function setup(files: Record<string, unknown>): [string, string] {
  const root = tempDir();
  const repo = join(root, "repo");
  const action = join(root, "action");
  mkdirSync(repo);
  mkdirSync(action);
  writeFileSync(join(action, "package.json"), JSON.stringify({ name: NAME, version: "2.0.0" }));
  for (const [name, value] of Object.entries(files)) writeFileSync(join(repo, name), JSON.stringify(value));
  return [repo, action];
}

const dev = (range: string) => ({ devDependencies: { [NAME]: range } });

test("the package input wins", () => {
  const [repo, action] = setup({ "package.json": dev("^2.1.0") });

  expect(resolveSpec(repo, action, " ./pkg.tgz ")).toEqual(["./pkg.tgz", "the package input"]);
});

test("a v3 lockfile pins the exact version", () => {
  const [repo, action] = setup({
    "package.json": dev("^2.0.0"),
    "package-lock.json": { lockfileVersion: 3, packages: { [`node_modules/${NAME}`]: { version: "2.3.1" } } },
  });

  expect(resolveSpec(repo, action)).toEqual([`${NAME}@2.3.1`, "package-lock.json"]);
});

test("a v1 lockfile pins the exact version too", () => {
  const [repo, action] = setup({
    "package-lock.json": { lockfileVersion: 1, dependencies: { [NAME]: { version: "2.2.0" } } },
  });

  expect(resolveSpec(repo, action)).toEqual([`${NAME}@2.2.0`, "package-lock.json"]);
});

describe("package.json's range is used only when it is plain semver", () => {
  test.each([
    ["^2.1.0", `${NAME}@^2.1.0`],
    ["~2.1", `${NAME}@~2.1`],
    [">=2.0.0 <3", `${NAME}@>=2.0.0 <3`],
    ["workspace:*", `${NAME}@2.0.0`],
    ["file:../roadmap", `${NAME}@2.0.0`],
    ["github:carby/simple-agentic-roadmap-skill", `${NAME}@2.0.0`],
    ["npm:other@1", `${NAME}@2.0.0`],
  ])("%s", (range, spec) => {
    const [repo, action] = setup({ "package.json": dev(range) });

    expect(resolveSpec(repo, action)[0]).toBe(spec);
  });
});

test("an unpinned repo gets the action's own version", () => {
  const [repo, action] = setup({});

  expect(resolveSpec(repo, action)).toEqual([`${NAME}@2.0.0`, "the action's own version"]);
});
