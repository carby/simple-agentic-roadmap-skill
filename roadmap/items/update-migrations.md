+++
id = "update-migrations"
title = "Let `update` migrate the roadmap's files to the new version"
bucket = "now"
rank = 1
filed = 2026-11-05

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
