+++
id = "global-install"
title = "Install the CLI globally and set projects up from it, like OpenSpec"
bucket = "now"
rank = 2
filed = 2026-11-05
gate = "decide where the version pin lives once the CLI is global: the repo's dev dependency, which the global CLI hands off to, or something OpenSpec does instead"

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

Separate from [update-migrations](update-migrations.md), which migrates the roadmap's files whichever way the CLI is installed.
