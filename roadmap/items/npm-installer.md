+++
id = "npm-installer"
title = "Install and upgrade the skill through an npm package, like OpenSpec"
bucket = "now"
rank = 1
filed = 2026-10-23

[refs]
files = ["docs/install.md"]
+++

The skill is installed as a git submodule at `.claude/skills/roadmap`, with the script vendored to `tools/roadmap.py` ([Install](../../docs/install.md)). That commits the skill into every repo that uses it, ties every developer to the one AI tool whose directory the submodule sits in, and makes upgrading a submodule bump that someone has to remember.

[OpenSpec](https://github.com/Fission-AI/OpenSpec/) does this differently: an npm package (`npm install -g @fission-ai/openspec`) whose `openspec init` writes the skill and slash commands into the AI tools each developer picks, and whose `openspec update` refreshes them after a package upgrade. Copying that lets `.claude/skills/` (and the other tools' directories) stay gitignored, and lets each developer set the skill up in their own tools.

It also moves version pinning into `package.json`. A repo lists the package as a dev dependency next to `@fission-ai/openspec`, the lockfile pins the version, and `update` writes that version's skill. Every developer then gets the same version, upgrades go through the repo's normal dependency updates, and one manifest controls both tools. Today that pin is the submodule's commit.

Done looks like an npm package whose `init` and `update` commands install and upgrade the skill into the AI tools a developer chooses, with `.claude/skills/` gitignored in the repo and the install docs rewritten around it. Open questions the work has to answer:

- the package name;
- whether `tools/roadmap.py` stays vendored, since `check` in CI (`action.yml`) runs it and must not depend on each developer's install. With the version pinned in `package.json`, CI could run the pinned package instead (e.g. via `npx`), which would make the vendored copy unnecessary;
- which runtime the CLI uses. OpenSpec is all TypeScript (no Python in the repo), so its skills can count on the `openspec` CLI that npm installed. Ours is Python, so the options are: ship `roadmap.py` in the npm package behind a Node `bin` (developers and CI need both Node and Python); rewrite the CLI in TypeScript (one runtime, but the script, tests and `action.yml` are rewritten); or have npm install only the skill files and keep `tools/roadmap.py` vendored for CI (Python stays the only runtime for `check`, but the version is pinned in two places). This decides the vendored-script question above;
- which AI tools are supported first, and where each one expects skills;
- how existing submodule installs migrate.
