+++
id = "npm-installer"
title = "Install and upgrade the skill through an npm package, like OpenSpec"
bucket = "now"
rank = 2
filed = 2026-10-23
depends_on = ["typescript-port"]

[refs]
files = ["docs/install.md"]
+++

The skill is installed as a git submodule at `.claude/skills/roadmap`, with the script vendored to `tools/roadmap.py` ([Install](../../docs/install.md)). That commits the skill into every repo that uses it, ties every developer to the one AI tool whose directory the submodule sits in, and makes upgrading a submodule bump that someone has to remember.

[OpenSpec](https://github.com/Fission-AI/OpenSpec/) does this differently: an npm package (`npm install -g @fission-ai/openspec`) whose `openspec init` writes the skill and slash commands into the AI tools each developer picks, and whose `openspec update` refreshes them after a package upgrade. Copying that lets `.claude/skills/` (and the other tools' directories) stay gitignored, and lets each developer set the skill up in their own tools.

It also moves version pinning into `package.json`. A repo lists the package as a dev dependency next to `@fission-ai/openspec`, the lockfile pins the version, and `update` writes that version's skill. Every developer then gets the same version, upgrades go through the repo's normal dependency updates, and one manifest controls both tools. Today that pin is the submodule's commit.

**2026-10-30:** the open questions are answered, and the work is split three ways:
- **Package name:** `simple-agentic-roadmap-skill`, unscoped, because `roadmap-skill` is taken on npm. The bin is `roadmap`.
- **Runtime:** TypeScript, one runtime as in OpenSpec. The port is [typescript-port](../archive/typescript-port.md), which this item depends on.
- **Tools, first:** Claude Code (`.claude/skills/roadmap`) and the shared `.agents/skills/roadmap`, which OpenSpec 1.14.3 uses for Codex, Amp, Antigravity and GSD. More tools are one row each in the tool table.
- **The vendored script and the migration from submodules** are [npx-ci-migration](npx-ci-migration.md).

Done looks like:
- The package is published.
- `roadmap init [--tools claude,agents]` writes `roadmap/` and copies SKILL.md, `references/` and `assets/` into each tool's `skills/roadmap/`.
- `roadmap update` refreshes every tool directory that already has the skill, and regenerates the index if the new version renders it differently, as `upgrade` does today.
- SKILL.md's commands run through the package's bin.
- `.claude/skills/` is gitignored in the repo.
- The install docs are rewritten around the package.
