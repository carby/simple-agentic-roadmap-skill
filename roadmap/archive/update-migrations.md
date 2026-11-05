+++
id = "update-migrations"
title = "Let `update` migrate the roadmap's files to the new version"
filed = 2026-11-05
closed = 2026-11-05
outcome = "shipped"
shipped_as = "#29"

[refs]
files = ["src/install.ts"]
+++

The install and upgrade cycle mostly matches OpenSpec's since [npm-installer](../archive/npm-installer.md): `init --tools` installs the skill, and `update` copies the new version's skill into each tool directory, regenerates the index, and runs `check`. What it doesn't do is bring the roadmap's own files up to the new version. When a release changes a rule, `check` fails after `update` and points at the release notes, and the user edits item frontmatter, the conventions text in README.md, `roadmap.toml` or the CI workflow by hand.

That turns every rule change into a manual migration that each repo has to work out from the changelog, and it is easy to get wrong or skip. The package already knows what changed between versions, so it should apply the changes itself.

Done looks like:
- A first step that looks at how OpenSpec's `update` brings files written by an older version up to date, and records what to copy here.
- Versioned migrations in the package, which `update` runs in order from the version stamped in the installed SKILL.md (`metadata.version`) to the package's version.
- Migrations are idempotent and never touch `archive/` or `decisions.md`, which stay append-only.
- `update` reports each file it changed, and `--dry-run` shows the changes without writing them.
- `update` still ends with `check`, which passes after a migration for every rule change that has one.

**2026-11-05:** surveyed OpenSpec's `update` (`src/core/update.ts`, `migration.ts`, `legacy-cleanup.ts`, `update-plan.ts`). What the analysis corrected:
- **Detection, not the stamp.** OpenSpec's migrations don't go by version: each one detects the old shape and does nothing once it is gone. The stamped `metadata.version` can't drive migrations here anyway, because symlinked and 1.x installs have none and two tool directories can disagree. So each migration matches the exact text an older template wrote, which leaves edited lines alone and makes a second run a no-op. `since` only labels the release in the output.
- **Only what the template wrote.** As OpenSpec touches only content it generated, migrations rewrite files `init` writes into `roadmap/`, and throw if one aims at `archive/`, `decisions.md` or a generated block. Workflow and submodule changes stay printed steps.
- **One code path for `--dry-run`.** OpenSpec records writes through a seam (`UpdatePlanRecorder`) instead of describing them separately. Here `update --dry-run` runs every step and prints "Would …" where it would write.

The first migration, `cli-command`, rewrites a 1.x roadmap's `python tools/roadmap.py` command lines in README.md and the header comment in roadmap.toml.

**Outcome:** shipped in #29. Migrations live in `src/migrate.ts` and run from `update` between copying the skill and regenerating the index; `update --dry-run` previews all three. The stamp-driven ordering in the original done-criteria was dropped for detection, as above.
