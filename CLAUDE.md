### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill. This
repo *is* that skill, so `.claude/skills/roadmap` symlinks to the working copy
(`SKILL.md`, `scripts/`, `references/`, `assets/`) instead of pinning a release:
changes are dogfooded as they are made. Use `/roadmap` for any change to it. If
the skill isn't available, stop and tell the user. Don't edit `roadmap/items/`
or `roadmap/archive/` by hand without it. There is no vendored
`tools/roadmap.py` here; verify with `python scripts/roadmap.py check`.
