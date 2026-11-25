#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { localInstall, NO_HANDOFF } from "../dist/handoff.js";

// A global install defers to the copy the repo pins; see src/handoff.ts.
const local = process.env[NO_HANDOFF] ? null : localInstall();
if (local) {
  const run = spawnSync(process.execPath, [local, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, [NO_HANDOFF]: "1" },
  });
  process.exitCode = run.status ?? 1;
} else {
  const { main } = await import("../dist/cli.js");
  process.exitCode = main(process.argv.slice(2));
}
