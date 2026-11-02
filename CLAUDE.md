### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill. This
repo *is* that skill, so `.claude/skills/roadmap` symlinks to the working copy
(`SKILL.md`, `references/`, `assets/`) instead of being installed from the
package: changes are dogfooded as they are made. `.claude/skills/` is
gitignored; run `npm run dogfood` once per clone to create the links. Use
`/roadmap` for any change to it. If the skill isn't available, stop and tell
the user. Don't edit `roadmap/items/` or `roadmap/archive/` by hand without it.
Verify with `npx roadmap check` (after `npm run build`), or
`python scripts/roadmap.py check`.
