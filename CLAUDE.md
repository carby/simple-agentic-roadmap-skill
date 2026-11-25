### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill. This
repo *is* that skill, so `.claude/skills/roadmap` symlinks to the working copy
in `cli/` (`SKILL.md`, `references/`, `assets/`) instead of being installed
from the package: changes are dogfooded as they are made. `.claude/skills/` is
gitignored; run `npm run dogfood` in `cli/` once per clone to create the links. Use
`/roadmap` for any change to it. If the skill isn't available, stop and tell
the user. Don't edit `roadmap/items/` or `roadmap/archive/` by hand without it.
Verify with `node cli/bin/roadmap.js check` from the repo root (after
`npm run build` in `cli/`); the bin is this working copy's, as the skill is.

### Layout

This is a monorepo: the CLI and the skill in `cli/` (run npm there), the GUI
in `gui/`, and `action.yml` and `roadmap/` at the root. The CLI's own
instructions are in `cli/CONTRIBUTING.md`.
