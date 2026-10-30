+++
id = "npx-ci-migration"
title = "Run check in CI through the npm package, and migrate submodule installs"
bucket = "now"
rank = 3
filed = 2026-10-30
depends_on = ["npm-installer"]

[refs]
files = ["action.yml", "docs/install.md", "docs/upgrading.md"]
+++

Once [npm-installer](npm-installer.md) has shipped the package, CI and existing installs still run Python. `action.yml` runs the repo's vendored `tools/roadmap.py`, and every repo set up so far carries the skill as a submodule. The version pin has to move into `package.json` for CI too, or the repo's developers and its CI can run different versions.

Done looks like:
- `action.yml` sets up Node and runs `check` with the package version pinned in the repo's `package.json`, falling back to the copy bundled with the action.
- The vendored `tools/roadmap.py`, `scripts/roadmap.py` and the Python tests are removed.
- The Claude-app `roadmap.zip` carries a bundled `roadmap.mjs` instead of the Python script.
- `update` detects a submodule at a tool's skill path, or a `tools/roadmap.py`, and prints the commands that remove them. It doesn't run those commands itself.
- It ships as 2.0.0, with migration steps from a submodule install in the CHANGELOG, and [Upgrading](../../docs/upgrading.md) rewritten.
