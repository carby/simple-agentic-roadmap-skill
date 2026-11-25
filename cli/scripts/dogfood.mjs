#!/usr/bin/env node
// This repo is the skill, so its Claude Code copy links to the working copy
// instead of being installed by `roadmap update`: edits are live as they are
// made. .claude/skills/ is gitignored, so run this once per checkout. The
// links go in the repo root, where Claude Code looks, and point into cli/.

import { lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const cli = resolve(import.meta.dirname, "..");
const dir = join(cli, "..", ".claude/skills/roadmap");
mkdirSync(dir, { recursive: true });
for (const entry of ["SKILL.md", "references", "assets"]) {
  const link = join(dir, entry);
  try {
    lstatSync(link);
    rmSync(link, { recursive: true });
  } catch {
    // nothing there yet
  }
  symlinkSync(relative(dir, join(cli, entry)), link);
}
console.log(`Linked ${relative(process.cwd(), dir) || "."} to the working copy.`);
