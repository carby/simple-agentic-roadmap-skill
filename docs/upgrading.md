---
tags: [roadmap-skill, setup]
aliases: [Upgrade, Drift]
---

# Upgrading

The package holds two things at once: the **CLI**, which enforces the rules,
and the **skill**, which tells your agent what the rules are. Upgrading moves
both, in one commit per repo. Read the [CHANGELOG](../CHANGELOG.md) first: it
says when a release changes the rules, since a stricter rule can turn a
passing `check` red.

With the global CLI, upgrade it once, then run `update` in each repo:

```bash
npm install -g simple-agentic-roadmap-skill@latest   # or @<version>
cd your-repo
roadmap update
git add roadmap
git commit -m "chore: upgrade the roadmap skill to <version>"
```

In a repo that pins the package as a dev dependency, upgrade it there instead:

```bash
npm install -D simple-agentic-roadmap-skill@latest   # or @<version>
npx --no -- roadmap update
git add package.json package-lock.json roadmap
git commit -m "chore: upgrade the roadmap skill to <version>"
```

`update` copies the new skill into every tool directory that has one
(`.claude/skills/roadmap`, `.agents/skills/roadmap`). Add `--tools` to install
it for another tool too. It moves roadmap.toml's `version` pin, if the repo
has one, to the CLI's release, and migrates the roadmap's files (see below).
If the new version renders the index differently, it regenerates the
generated blocks in README.md and done.md and says so. It then runs `check`
with the new version, so any rule changes show up straight away. It refuses to
put an older skill over a newer one, or to move the pin back, unless you pass
`--force`.

`roadmap update --dry-run` prints the same steps as "Would …" lines and
writes nothing, so you can see what an upgrade changes first.

## Migrations

When a release changes text that `init` writes into `roadmap/`, such as the
command lines in README.md, a README section, or the intro at the top of
decisions.md, `update` rewrites the old text and reports each file as
`Migrated <path>: <what changed> (<release>)`. A README section is replaced
whole when it matches what an older template wrote, keeping your index and
guiding principle; compare a section you edited with the package's
`assets/template/README.md` yourself. Like OpenSpec's
`update`, it doesn't go by version numbers: each migration looks for the exact
text an older template wrote, so text you edited is left alone, and a second
`update` finds nothing to change. Migrations never touch `archive/`,
decisions.md's entries or the generated blocks.

The tool directories are gitignored, so after pulling an upgrade someone else
committed, each developer installs that release (`npm install -g
simple-agentic-roadmap-skill@<version>`, or `npm install` for a dev
dependency) and runs `roadmap update` in their own clone.

## How drift shows up

- `roadmap --version` says which release you are running. A global CLI hands
  off to the copy the repo's package.json pins, so in such a repo it prints
  that version.
- `version` in roadmap.toml says which release the repo pins, when it doesn't
  pin through package.json. Every command but `update` warns on stderr when
  it runs another release.
- Each copy of the skill names the release it was installed from, as
  `metadata.version` in its SKILL.md frontmatter.
- Once per session the agent compares them. If the skill is older, it offers
  to run `update`. If it is newer, it tells you, and relies on `check`.

The GitHub Action runs the version your lockfile pins, or else the one
roadmap.toml pins, so CI checks with the same version as everyone else. Its
floating `@v2` tag only moves the action's own steps; see [CI](ci.md).

## Migrating from 1.x (a submodule and `tools/roadmap.py`)

1.x carried the skill as a git submodule at `.claude/skills/roadmap` and
vendored the Python CLI to `tools/roadmap.py`. To move to the package:

```bash
npm install -D simple-agentic-roadmap-skill
npx --no -- roadmap update
```

`update` rewrites the `python tools/roadmap.py` command lines in
`roadmap/README.md` and `roadmap.toml` to `npx --no -- roadmap`, brings
README sections and the decisions.md intro from 1.x templates up to date, and
lists every line in a tracked config file (CI, pre-commit, Makefile and the
like, outside `roadmap/`) that still calls `roadmap.py`. It sees the
submodule and the vendored script, leaves both alone, and prints the commands that finish the move: removing the submodule and
`tools/roadmap.py`, gitignoring the tool directories, pointing the merge driver
at the package, installing the skill with `update --tools`, and switching your
workflow to `@v2` without its old `script:` input. It runs none of them, so
read them, run them, and commit. Then update the `CLAUDE.md` note from step 3
of [Install](install.md).

---

Related: [Install](install.md) · [CI](ci.md) · [Home](index.md)
