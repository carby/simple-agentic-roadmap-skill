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
- A TypeScript CLI under `src/` (bin `roadmap`, package `simple-agentic-roadmap-skill`, still private) with every command except `init` and `upgrade`, which [npm-installer](npm-installer.md) redesigns around tool directories and `update`.
- It ports one Python function to one TS function, with the same messages and rule tags, and generated blocks byte-identical to the Python script's.
- The Python suite runs against the TS bin (`ROADMAP_IMPL=ts`), and CI runs both.
- The Python script stays the released implementation until [npx-ci-migration](npx-ci-migration.md).

**2026-10-30, what the work corrected:**
- `init` isn't ported at all, not just its vendoring. Without vendoring, the template's `{{script}}` has nothing to name, and [npm-installer](npm-installer.md) rewrites `init` anyway.
- The roughly 80 function-level tests weren't ported to vitest one by one. That would have left two copies of the same spec to keep in step while both implementations exist. Instead, with `ROADMAP_IMPL=ts`, the 211 Python tests that don't need `init` or `upgrade` run against the bin, and every in-process `check()`, along with every roadmap a test builds, is repeated through the bin and has to report the same problem lines. That covers rendering too, because a block the port renders differently shows up as `[generated]`. Planted bugs confirm it: changing one message failed 3 tests, and changing one rendered word failed 101.
- vitest covers what Python can't check: the Python-compatible helpers (`repr`, `str`, `splitlines`, `json.dumps`, difflib's opcodes), with expected values printed by CPython, and the golden fixture rendered in-process.
- The suite moves to TypeScript when [npx-ci-migration](npx-ci-migration.md) deletes the Python script.
- TOML syntax errors are worded by smol-toml, not tomllib, so only the `malformed TOML` prefix and the rule tag match. Everything else prints byte for byte: `check`, `list --json` and `review` give identical output on this roadmap and on the golden fixture.

**Outcome:** shipped. The port lives in `src/`, has the same command set minus `init` and `upgrade`, and passes the Python suite as its spec.
