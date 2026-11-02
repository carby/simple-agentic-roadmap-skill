#!/usr/bin/env node
// Lays out roadmap.zip's folder for the Claude app: SKILL.md stamped with
// this release's version, LICENSE, references/, assets/, and the CLI bundled
// into scripts/roadmap.mjs (`npm run bundle` first). The bundled CLI finds
// the template next to it, so even `init` works from the zip.
// Usage: stage-zip.mjs <out dir>, which gets a roadmap/ folder.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stamped } from "../dist/install.js";

const out = join(process.argv[2] ?? "stage", "roadmap");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "scripts"), { recursive: true });
writeFileSync(join(out, "SKILL.md"), stamped(readFileSync("SKILL.md", "utf8")));
for (const entry of ["LICENSE", "references", "assets"]) cpSync(entry, join(out, entry), { recursive: true });
cpSync("build/roadmap.mjs", join(out, "scripts", "roadmap.mjs"));
console.log(`Staged ${out}`);
