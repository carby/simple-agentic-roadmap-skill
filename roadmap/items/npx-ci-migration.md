+++
id = "npx-ci-migration"
title = "Run check in CI through the npm package, and migrate submodule installs"
bucket = "now"
rank = 4
filed = 2026-10-30
depends_on = ["vitest-suite"]

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
