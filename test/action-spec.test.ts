// Which package the GitHub Action runs: the input, then the repo's lockfile
// pin, then a plain semver range from its package.json, then the version its
// roadmap.toml pins, then its own version.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
// @ts-expect-error: a plain .mjs script with no type declarations
import { NAME, resolveSpec } from "../scripts/action-spec.mjs";
import { each, tempDir } from "./helpers.ts";

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

  assert.deepEqual(resolveSpec(repo, action, " ./pkg.tgz "), ["./pkg.tgz", "the package input"]);
});

test("a v3 lockfile pins the exact version", () => {
  const [repo, action] = setup({
    "package.json": dev("^2.0.0"),
    "package-lock.json": { lockfileVersion: 3, packages: { [`node_modules/${NAME}`]: { version: "2.3.1" } } },
  });

  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.3.1`, "package-lock.json"]);
});

test("a v1 lockfile pins the exact version too", () => {
  const [repo, action] = setup({
    "package-lock.json": { lockfileVersion: 1, dependencies: { [NAME]: { version: "2.2.0" } } },
  });

  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.2.0`, "package-lock.json"]);
});

describe("package.json's range is used only when it is plain semver", () => {
  each([
    ["^2.1.0", `${NAME}@^2.1.0`],
    ["~2.1", `${NAME}@~2.1`],
    [">=2.0.0 <3", `${NAME}@>=2.0.0 <3`],
    ["workspace:*", `${NAME}@2.0.0`],
    ["file:../roadmap", `${NAME}@2.0.0`],
    ["github:carby/simple-agentic-roadmap-skill", `${NAME}@2.0.0`],
    ["npm:other@1", `${NAME}@2.0.0`],
  ])("%s", (range, spec) => {
    const [repo, action] = setup({ "package.json": dev(range) });

    assert.equal(resolveSpec(repo, action)[0], spec);
  });
});

test("an unpinned repo gets the action's own version", () => {
  const [repo, action] = setup({});

  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.0.0`, "the action's own version"]);
});

function withToml(repo: string, text: string, dir = "roadmap"): void {
  mkdirSync(join(repo, dir), { recursive: true });
  writeFileSync(join(repo, dir, "roadmap.toml"), text);
}

test("roadmap.toml's pin is used when package.json pins nothing", () => {
  const [repo, action] = setup({});
  withToml(repo, '# Roadmap configuration\n\nversion = "2.4.0"  # moved by update\n\n[refs]\n');

  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.4.0`, "roadmap/roadmap.toml"]);
});

test("roadmap.toml's pin is read from the roadmap directory, and only above its tables", () => {
  const [repo, action] = setup({});
  withToml(repo, 'version = "2.5.0"\n', "docs/roadmap");
  withToml(repo, '[milestones]\nversion = "9.9.9"\n');

  assert.deepEqual(resolveSpec(repo, action, "", "docs/roadmap"), [`${NAME}@2.5.0`, "docs/roadmap/roadmap.toml"]);
  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.0.0`, "the action's own version"]);
});

test("package.json beats roadmap.toml, and a commented pin counts for nothing", () => {
  const [repo, action] = setup({ "package.json": dev("2.1.0") });
  withToml(repo, 'version = "2.4.0"\n');
  assert.deepEqual(resolveSpec(repo, action), [`${NAME}@2.1.0`, "package.json"]);

  const [bare, own] = setup({});
  withToml(bare, '# version = "x.y.z"\n');
  assert.deepEqual(resolveSpec(bare, own), [`${NAME}@2.0.0`, "the action's own version"]);
});
