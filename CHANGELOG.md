# Changelog

Each release has a fixed `vX.Y.Z` tag. The skill is installed pinned to one
(see [Install](docs/install.md)), so read this before moving the
pin. **Upgrade notes** say what you have to do after `upgrade`. Where a release
changes the rules `check` enforces, it says so there, because a stricter rule can
turn a passing `check` red.

## Unreleased

- **Re-ranking** — `move <id> --rank <n>` and `move <id> --above <other>`
  re-rank an item within its bucket, or place it in another one, instead of
  renumbering files by hand. The items between the old and new place shift a
  rank to make room. `--above` takes the other item's bucket, and `--bucket`
  is now optional. Like a move between buckets, a re-rank that would put an
  item ahead of its dependencies is refused.
- **Parallel branches** — `index --renumber` numbers each bucket 1, 2, 3...
  in its current order, which fixes the `[rank]` collision two branches cause
  when each files an item into the same bucket. A new `merge-driver` command
  lets git merge README.md and done.md around their generated blocks, so
  closing items on two branches no longer conflicts there; run `index` after
  the merge. Both are documented under "Parallel branches" in the conventions.
- **Docs** — The README is now a short anchor: a quick start, the slash
  commands and a map of the docs. The detail moved into `docs/`, one note per
  topic (install, upgrading, checking, CI, rule tags, configuration), which
  also opens as an Obsidian vault. Links are plain Markdown, so they work on
  GitHub too.
- **Install** — The README now leads with one path: the skill as a git
  submodule pinned to a release tag, then `init`, then a note in `CLAUDE.md`
  saying the skill is required. A global clone and the Claude app zip are
  documented as alternatives, and a plain unpinned clone into `.claude/skills/`
  is called out as not an install. Upgrading has its own section.
- **Agent behaviour** — `SKILL.md` now also tells the agent what to do when the
  skill's copy of `roadmap.py` is *older* than the repo's vendored one. Before,
  only the opposite case was covered.
- No change to the rules `check` enforces.

## 1.3.1 — 2026-10-21

- Publishing a release attaches `roadmap.zip`, the skill packaged for upload
  to the Claude app.
- `SKILL.md` says what to do when the roadmap is only readable, as it is when a
  repo is synced into a Project: run the command on a copy and hand back the
  changed files to commit.

## 1.3.0 — 2026-10-16

- Milestones: named dates declared in `roadmap.toml`. An item is due for one
  (`milestone`) or waits on one (`depends_on`), and `check` keeps them in order
  without ever comparing against today's date.
- **Upgrade notes:** a vendored script older than 1.3.0 rejects the
  `[milestones]` table, so upgrade before declaring one.
- **Rules:** `check` rejects an item that waits on a milestone at or after its
  own, or depends on an item due later than itself. Roadmaps without
  milestones are unaffected.

## 1.2.0 — 2026-10-14

- `upgrade` replaces the vendored script, prints `old → new`, and runs `check`
  with the new version. It refuses a downgrade, an unversioned copy or one with
  local edits unless you pass `--force`.
- The skill's copy warns on stderr when it runs next to an older vendored copy.

## 1.1.0 — 2026-10-13

- `depends_on` between items, held in order by `check`.
- The index in `roadmap/README.md` opens with a generated Mermaid diagram.
- **Upgrade notes:** run `roadmap.py index` once, so the index picks up the
  diagram. Repos whose CI uses the Action without a vendored script get the
  bundled version when `v1` moves, and report `[generated]` until then.

## 1.0.0 — 2026-09-25

- First release: the `/roadmap` skill, the stdlib-only `roadmap.py`
  (`init`, `new`, `move`, `close`, `index`, `check`), and the `check` GitHub
  Action. The floating `v1` tag follows every compatible 1.x release.
