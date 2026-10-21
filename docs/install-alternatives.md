---
tags: [roadmap-skill, setup]
aliases: [Alternatives, Claude app]
---

# Install alternatives

The recommended install is the pinned submodule in [Install](install.md). These
are the other options, and one that only looks like an option.

## Global, for yourself (every repo on your machine)

Nothing is committed, so collaborators and CI don't get the skill, and you have
to keep it current yourself. Pin the clone to a release, and still add the
`CLAUDE.md` note from step 3 of [Install](install.md).

```bash
git clone https://github.com/carby/simple-agentic-roadmap-skill.git ~/.claude/skills/roadmap
git -C ~/.claude/skills/roadmap checkout "$(git -C ~/.claude/skills/roadmap describe --tags --abbrev=0 --match 'v*.*.*')"

# then, from the root of each repo that should have a roadmap:
python ~/.claude/skills/roadmap/scripts/roadmap.py init
```

## A plain clone into the repo is not an install

`git clone ... .claude/skills/roadmap` isn't tracked by your repo, so
collaborators get nothing and each machine ends up on whichever commit it
cloned that day. Use the submodule, or commit a copy at a known release.

## Chats and Projects in the Claude app (claude.ai, desktop)

The app's Code tab is Claude Code, so use the submodule there. This option is
for chats, which read the roadmap but can't change the repo.

Download
[`roadmap.zip`](https://github.com/carby/simple-agentic-roadmap-skill/releases/latest/download/roadmap.zip)
from the latest release (or from a specific one, by replacing `latest/download`
in the link with `download/<tag>`) and upload it in the app's Skills settings.
To use it on a repo, add the repo to a Project and include the `roadmap/`
folder in the files it syncs. The app reads that copy but can't write to your
repo, so `/roadmap` and questions work as usual. `new`, `move` and `close` give
you the changed files to download and commit yourself; run `python
tools/roadmap.py index` and `check` locally afterwards.

---

Related: [Install](install.md) · [Upgrading](upgrading.md) · [Home](index.md)
