+++
id = "npx-ci-migration"
title = "Run check in CI through the npm package, and migrate submodule installs"
filed = 2026-10-30
depends_on = ["vitest-suite"]
closed = 2026-11-02
outcome = "shipped"
shipped_as = "#22"

[refs]
files = ["action.yml", "docs/install.md", "docs/upgrading.md"]
+++

Once [npm-installer](../archive/npm-installer.md) has shipped the package, CI and existing installs still run Python. `action.yml` runs the repo's vendored `tools/roadmap.py`, and every repo set up so far carries the skill as a submodule. The version pin has to move into `package.json` for CI too, or the repo's developers and its CI can run different versions.

Done looks like:
- `action.yml` sets up Node and runs `check` with the package version pinned in the repo's `package.json`, falling back to the copy bundled with the action.
- `scripts/roadmap.py` is removed (the Python tests go first, in [vitest-suite](../archive/vitest-suite.md)), and `update` replaces the vendored `tools/roadmap.py` (below).
- The Claude-app `roadmap.zip` carries a bundled `roadmap.mjs` instead of the Python script.
- `update` detects a submodule at a tool's skill path, or a `tools/roadmap.py`, and prints the commands that remove them. It doesn't run those commands itself.
- The package is published to npm (moved here from [npm-installer](../archive/npm-installer.md) on 2026-11-02).
- It ships as 2.0.0, with migration steps from a submodule install in the CHANGELOG, and [Upgrading](../../docs/upgrading.md) rewritten.

**2026-11-02:** the test port is split out as [vitest-suite](../archive/vitest-suite.md). Settled for this item:
- **CLI name:** `roadmap` in usage, `--version` and messages. The generated-block markers keep saying `roadmap.py`, so no existing roadmap's blocks change.
- **The action** runs `npx --yes simple-agentic-roadmap-skill@<pin>`, with the exact version from the repo's `package-lock.json`. Without one it runs the action's own version from npm, so nothing built is committed. Its inputs change, so it moves to a `v2` tag.
- **Publishing** is npm trusted publishing (OIDC, provenance) from `release.yml`. The first publish is by hand, because npm only lets you configure a trusted publisher for a package that exists.
- **`update` never overwrites a submodule.** It skips the tool, and prints the removal commands.

**2026-11-02, from the plan review:**
- **`npx --no -- roadmap` everywhere.** The bin stays `roadmap`, but there is an unrelated `roadmap` package on npm, and in a non-interactive shell (CI, an agent's Bash tool) a bare `npx roadmap` installs and runs it when ours is missing. Every documented command, the template, CI, pre-commit and the merge driver use `npx --no -- roadmap`, which never fetches. Renaming the bin was ruled out: `agentic-roadmap` is taken by a similar tool whose bins include `roadmap` too.
- **First publish by hand needs no provenance.** `publishConfig` sets only `access`, since trusted publishing adds provenance itself and `provenance: true` fails outside CI. A `prepack` script builds `dist/`.
- **CodeQL's default setup** drops Python once the script is gone.

**Outcome:** shipped in #22. The Action runs the package version pinned in the repo's lockfile, `scripts/roadmap.py` is gone, `roadmap.zip` carries the bundled CLI, `update` prints how to migrate a 1.x install, and `release.yml` publishes to npm. The package itself is first published by hand with the 2.0.0 release, after this merges. What the work corrected:
- A plan review caught that a bare `npx roadmap` is unsafe in any non-interactive shell, not just in CI, which led to `npx --no -- roadmap` everywhere and a docs test that enforces it.
- The migration needed `update --tools`: once the submodule is removed, `init` refuses because `roadmap/` exists, so nothing else could install the skill into a repo that already has a roadmap.
- `provenance` stays out of `publishConfig`, because it makes the first publish by hand fail outside CI. Trusted publishing adds provenance itself.
