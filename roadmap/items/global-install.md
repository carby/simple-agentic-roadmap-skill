+++
id = "global-install"
title = "Install the CLI globally and set projects up from it, like OpenSpec"
bucket = "now"
rank = 3
filed = 2026-11-05

[refs]
files = ["src/install.ts", "docs/install.md"]
+++

The CLI only works as a dev dependency of each repo: setting up a roadmap starts with `npm install -D simple-agentic-roadmap-skill`, and SKILL.md runs everything through `npx --no -- roadmap`. [OpenSpec](https://github.com/Fission-AI/OpenSpec/) installs one global CLI (`npm install -g @fission-ai/openspec`) instead, which sets projects up and keeps them current from there.

A global CLI would make setting up a new repo one command, without adding a dependency first. But it breaks something [npm-installer](../archive/npm-installer.md) and [npx-ci-migration](../archive/npx-ci-migration.md) built on purpose. Today the repo's lockfile pins one version, shared by every developer, by `update`'s copy of the skill and by the CI action, which reads the pin from `package-lock.json`. With a global install, each developer runs whatever version they installed last, so the pin has to live somewhere else. One option is to keep the dev dependency for CI and have the global CLI hand off to it, the way globally installed tools defer to a project-local copy.

Done looks like:
- A short survey in this item's prose of how OpenSpec installs globally and manages projects from there, including how it keeps a project's version consistent.
- A decision on where the pin lives, recorded here.
- `npm install -g` followed by `roadmap init` works end to end, without breaking the pinned CI path.
- SKILL.md's version check, the install docs and the action match the new install.

Separate from [update-migrations](../archive/update-migrations.md), which migrates the roadmap's files whichever way the CLI is installed.

**2026-11-05:** surveyed OpenSpec (its README, `docs/installation.md` and `src/core/shared/tool-detection.ts`). It leads with a standalone binary (`curl … | sh`, checked against `SHA256SUMS`), with `npm install -g` and Homebrew as alternatives. It keeps **no per-project pin**: generated skills carry a `generatedBy` stamp, `openspec update` refreshes them per project, and `openspec version --check` says how to upgrade. Copying that outright would drop the pin CI relies on.

**Decision, which was this item's gate:** the pin stays one per repo, wherever the repo keeps it.
- A global `roadmap` **hands off** to the copy the repo's package.json pins, so a dev-dependency repo keeps the lockfile as its pin. Only the nearest package.json counts, so a stray copy in `~/node_modules` is never used.
- A repo that doesn't pin through package.json carries `version = "x.y.z"` in **roadmap.toml**. `init` writes it, `update` moves it, every other command warns when it runs another release, and the action runs it after the lockfile and package.json. This works in Python and other non-Node repos.
- `init` names the CLI as `roadmap` in a toml-pinned README, and as `npx --no -- roadmap` in a package.json-pinned one.

Scope: `npm install -g` only. A standalone binary and Homebrew, as OpenSpec ships, are to be pitched as their own item.
