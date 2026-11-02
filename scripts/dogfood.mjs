#!/usr/bin/env node
// This repo is the skill, so its Claude Code copy links to the working copy
// instead of being installed by `roadmap update`: edits are live as they are
// made. .claude/skills/ is gitignored, so run this once per checkout.

import { lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

const dir = ".claude/skills/roadmap";
mkdirSync(dir, { recursive: true });
for (const entry of ["SKILL.md", "references", "assets"]) {
  const link = join(dir, entry);
  try {
    lstatSync(link);
    rmSync(link, { recursive: true });
  } catch {
    // nothing there yet
  }
  symlinkSync(relative(dir, entry), link);
}
console.log(`Linked ${dir} to the working copy.`);
