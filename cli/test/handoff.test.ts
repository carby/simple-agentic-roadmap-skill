// A global `roadmap` hands off to the copy the repo's package.json pins, and
// to nothing else: not without a pin, not to a copy above the repo, not to
// itself, and never twice.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { localInstall, NO_HANDOFF } from "../src/handoff.ts";
import { PACKAGE_NAME } from "../src/package.ts";
import { contains, excludes, REPO, run, tempDir } from "./helpers.ts";

/** A repo whose package.json lists the package if `pin`, with a fake local
 * copy in node_modules that prints a marker and exits 7. */
function repo(pin = true): string {
  const root = tempDir();
  const deps = pin ? { devDependencies: { [PACKAGE_NAME]: "^2.0.0" } } : {};
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", ...deps }));
  const bin = join(root, "node_modules", PACKAGE_NAME, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "roadmap.js"),
    `console.log("local copy", process.argv.slice(2).join(" "), process.env.${NO_HANDOFF}); process.exitCode = 7;\n`,
  );
  return root;
}

test("a pinned local copy runs instead, with the same arguments and exit code", () => {
  const root = repo();
  mkdirSync(join(root, "sub"));
  const result = run(["--version"], join(root, "sub"));
  assert.equal(result.status, 7);
  contains(result.stdout, "local copy --version 1");
});

test("no hand-off when the environment says so", () => {
  const result = run(["--version"], repo(), { [NO_HANDOFF]: "1" });
  assert.equal(result.status, 0);
  excludes(result.stdout, "local copy");
});

test("no hand-off when package.json doesn't list the package", () => {
  const result = run(["--version"], repo(false));
  assert.equal(result.status, 0);
  excludes(result.stdout, "local copy");
});

test("no hand-off to a copy above the nearest package.json", () => {
  const outer = repo();
  const inner = join(outer, "app");
  mkdirSync(inner);
  writeFileSync(join(inner, "package.json"), JSON.stringify({ name: "app" }));
  assert.equal(localInstall(inner), null);
  excludes(run(["--version"], inner).stdout, "local copy");
});

test("no hand-off to this package itself", () => {
  assert.equal(localInstall(REPO, REPO), null);
  const root = repo();
  assert.equal(localInstall(root, join(root, "node_modules", PACKAGE_NAME)), null);
  assert.equal(localInstall(root), join(root, "node_modules", PACKAGE_NAME, "bin", "roadmap.js"));
});
