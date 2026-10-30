+++
id = "typescript-port"
title = "Port roadmap.py to TypeScript with byte-identical output"
bucket = "now"
rank = 1
filed = 2026-10-30

[refs]
files = ["scripts/roadmap.py"]
+++

[npm-installer](npm-installer.md) settled its runtime question on 2026-10-30: the CLI is rewritten in TypeScript, so the npm package, the installer and `check` all run on Node, the way OpenSpec does. The alternatives were a Node shim around `roadmap.py` (two runtimes for every developer and CI) and npm shipping only the skill files (the version pinned twice). This item is the port itself, before anything is published.

`roadmap.py` is 1754 lines and 11 subcommands, and the 2.4k lines of tests pin its behaviour, including the golden `tests/fixtures/valid`. Every existing roadmap's generated blocks were rendered by it, so the port has to render them byte for byte, or the first `check` after the switch goes red on `[generated]`.

Done looks like:
- A TypeScript CLI under `src/` (bin `roadmap`, package `simple-agentic-roadmap-skill`, still private) with every command except `upgrade` and `init`'s vendoring of `tools/roadmap.py`, which [npm-installer](npm-installer.md) replaces with `update`.
- It ports one Python function to one TS function, with the same messages and rule tags, and generated blocks byte-identical to the Python script's.
- The function-level tests are ported to vitest. The CLI-level Python tests also run against the TS bin (`ROADMAP_IMPL=ts`), and CI runs both.
- The Python script stays the released implementation until [npx-ci-migration](npx-ci-migration.md).
