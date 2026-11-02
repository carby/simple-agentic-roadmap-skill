#!/usr/bin/env node
// Which package the GitHub Action runs `check` with, printed as an npm spec:
//   1. the action's `package` input, if set (this repo's CI passes a tarball);
//   2. the exact version in the repo's package-lock.json (v1, v2 or v3);
//   3. the range in its package.json, if it is plain semver;
//   4. the action's own version.
// pnpm and yarn lockfiles aren't read; those repos get step 3.
// Usage: action-spec.mjs <repo dir> <action dir> [<package input>]

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const NAME = "simple-agentic-roadmap-skill";

function json(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** A range npm can resolve from the registry: no workspace:, file:, link:, npm:, git or URL specs. */
function plainRange(range) {
  return typeof range === "string" && /^[\s\d.xX*^~<>=|-]+$/.test(range) && /\d|\*|x/i.test(range);
}

/** [spec, where it came from] */
export function resolveSpec(repo, actionDir, input = "") {
  if (input.trim()) return [input.trim(), "the package input"];
  const lock = json(join(repo, "package-lock.json"));
  const locked = lock?.packages?.[`node_modules/${NAME}`]?.version ?? lock?.dependencies?.[NAME]?.version;
  if (typeof locked === "string") return [`${NAME}@${locked}`, "package-lock.json"];
  const manifest = json(join(repo, "package.json"));
  const range = manifest?.devDependencies?.[NAME] ?? manifest?.dependencies?.[NAME];
  if (plainRange(range)) return [`${NAME}@${range}`, "package.json"];
  const own = json(join(actionDir, "package.json"))?.version;
  return [`${NAME}@${own}`, "the action's own version"];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repo = ".", actionDir = ".", input = ""] = process.argv.slice(2);
  const [spec, source] = resolveSpec(repo, actionDir, input);
  if (source === "the action's own version") {
    console.error(`::notice::${NAME} isn't pinned in this repo; using ${spec}, the action's own version`);
  }
  console.log(spec);
}
