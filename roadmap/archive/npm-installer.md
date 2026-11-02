+++
id = "npm-installer"
title = "Install and upgrade the skill through an npm package, like OpenSpec"
filed = 2026-10-23
depends_on = ["typescript-port"]
closed = 2026-11-02
outcome = "shipped"
shipped_as = "#17"

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
- **The vendored script and the migration from submodules** are [npx-ci-migration](../items/npx-ci-migration.md).

Done looks like:
- The package is published.
- `roadmap init [--tools claude,agents]` writes `roadmap/` and copies SKILL.md, `references/` and `assets/` into each tool's `skills/roadmap/`.
- `roadmap update` refreshes every tool directory that already has the skill, and regenerates the index if the new version renders it differently, as `upgrade` does today.
- SKILL.md's commands run through the package's bin.
- `.claude/skills/` is gitignored in the repo.
- The install docs are rewritten around the package.

**2026-11-02:** before building:
- **Command form:** `npx roadmap ...`, with the package as a dev dependency. SKILL.md checks `npx --no -- roadmap --version` first, so npx never fetches the unrelated `roadmap` package on npm when this one isn't installed. The `--` matters: without it npx takes `--version` for itself and prints npm's version.
- **Publishing moves to [npx-ci-migration](../items/npx-ci-migration.md):** the package stays `private` here, publish-ready (`files`, `npm pack`), and is first published as 2.0.0. Until then Python stays the released implementation and no release is cut from this item.
- **Version drift:** `init` and `update` stamp `metadata.version` into each copied SKILL.md, so the agent compares it with `npx --no -- roadmap --version`. That replaces comparing the skill's script with the vendored one.
- **Dogfooding:** this repo gitignores `.claude/skills/` too, and `npm run dogfood` recreates the symlinks to the working copy, so edits stay live.

**Outcome:** shipped in #17, except publishing, which [npx-ci-migration](../items/npx-ci-migration.md) now owns. `init --tools` and `update` live in `src/install.ts`. SKILL.md runs everything through `npx roadmap`. The install docs lead with the package, behind a banner that points at the submodule until 2.0.0. What the work corrected:
- The template needed an edit after all: its command lines read `python {{script}}`, which would have rendered `python npx roadmap`. They now use a `{{command}}` placeholder, which each `init` fills in its own way.
- `npx roadmap --version` alone isn't a usable check, because npx takes `--version` for itself. SKILL.md uses `npx --no -- roadmap --version`.
