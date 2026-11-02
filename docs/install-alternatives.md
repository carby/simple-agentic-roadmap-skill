---
tags: [roadmap-skill, setup]
aliases: [Alternatives, Claude app]
---

# Install alternatives

The recommended install is the npm dev dependency in [Install](install.md).
These are the other options, and one that only looks like an option.

## A submodule (1.x only)

1.x was installed as a git submodule at `.claude/skills/roadmap`, with the
Python CLI vendored to `tools/roadmap.py`. 2.x isn't installed that way: the
skill ships in the npm package, and a submodule would pin a second copy of it.
To move a 1.x install to the package, see
[Migrating from 1.x](upgrading.md#migrating-from-1x-a-submodule-and-toolsroadmappy).

## Global, for yourself (every repo on your machine)

Nothing is pinned per repo, so collaborators and CI don't get the skill, and you
have to keep it current yourself. Still add the `CLAUDE.md` note from step 3 of
[Install](install.md).

```bash
npm install -g simple-agentic-roadmap-skill

# then, from the root of each repo that should have a roadmap:
roadmap init
```

## A plain clone into the repo is not an install

`git clone ... .claude/skills/roadmap` isn't tracked by your repo, so
collaborators get nothing and each machine ends up on whichever commit it
cloned that day. Use the package.

## Chats and Projects in the Claude app (claude.ai, desktop)

The app's Code tab is Claude Code, so use the package there. This option is
for chats, which read the roadmap but can't change the repo.

Download
[`roadmap.zip`](https://github.com/carby/simple-agentic-roadmap-skill/releases/latest/download/roadmap.zip)
from the latest release (or from a specific one, by replacing `latest/download`
in the link with `download/<tag>`) and upload it in the app's Skills settings.
To use it on a repo, add the repo to a Project and include the `roadmap/`
folder in the files it syncs. The app reads that copy but can't write to your
repo, so `/roadmap` and questions work as usual. `new`, `move` and `close` give
you the changed files to download and commit yourself; run
`npx --no -- roadmap index` and `check` locally afterwards.

---

Related: [Install](install.md) · [Upgrading](upgrading.md) · [Home](index.md)
