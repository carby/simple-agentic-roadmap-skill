---
tags: [roadmap-skill, setup]
aliases: [Upgrade, Drift]
---

# Upgrading

The skill and the vendored script move together, in one commit. Read the
[CHANGELOG](../CHANGELOG.md) first: it says when a release changes the rules,
since a stricter rule can turn a passing `check` red.

```bash
git -C .claude/skills/roadmap fetch --tags
git -C .claude/skills/roadmap checkout <tag>             # the release you want
python .claude/skills/roadmap/scripts/roadmap.py upgrade # --script <path> if not tools/roadmap.py
git add .claude/skills/roadmap tools/roadmap.py
git commit -m "chore: upgrade the roadmap skill to <tag>"
```

`upgrade` replaces the vendored script, prints `old → new`, and leaves
`roadmap/` alone. It then runs `check` with the new version, so any rule
changes show up straight away. It refuses a downgrade, or a copy with local
edits, unless you pass `--force`.

## How drift shows up

`python tools/roadmap.py --version` says which release is vendored.
- The skill's copy warns on stderr whenever it runs next to an older
  `tools/roadmap.py`.
- Once per session the agent compares the two versions. If the vendored script
  is older it offers `upgrade`. If the skill is older than the script, it tells
  you to update the skill, because someone upgraded the repo without the
  checkout you are using.
- With the submodule, `git submodule status` shows the pinned commit, and a
  commit that moves it is easy to spot in review. Git may label that commit
  `v1` rather than `v1.3.1`, because the floating tag sits on the same commit.
  The commit is what is pinned, so the label doesn't matter.

The GitHub Action's floating `@v1` tag is the only thing that follows new
releases on its own. It runs your vendored `tools/roadmap.py` when there is one,
and falls back to the copy bundled with the action when there isn't. See
[CI](ci.md).

---

Related: [Install](install.md) · [CI](ci.md) · [Home](index.md)
