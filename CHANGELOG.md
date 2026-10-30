# Changelog

Each release has a fixed `vX.Y.Z` tag. The skill is installed pinned to one
(see [Install](docs/install.md)), so read this before moving the
pin. **Upgrade notes** say what you have to do after `upgrade`. Where a release
changes the rules `check` enforces, it says so there, because a stricter rule can
turn a passing `check` red.

## Unreleased

- **TypeScript port** — `src/` holds a TypeScript port of `roadmap.py`: every
  command except `init` and `upgrade`, with the same messages and
  byte-identical generated blocks. It isn't published or used by the action
  yet, so nothing changes for a repo using the skill. It's the first step
  towards installing through npm.

## 1.5.0 — 2026-10-30

- **Milestone history** — A milestone stays in roadmap.toml after its date
  passes, instead of being deleted. done.md lists each milestone the archive
  names, newest first, with how many items shipped or were declined for it,
  and each closed line names its milestone. `review` flags a passed milestone
  only while an open item still names it. An archived item naming a milestone
  roadmap.toml no longer declares shows the bare id, and `check` accepts it.
  **Upgrade notes:** `upgrade` regenerates done.md if the archive names
  milestones. Nothing changes for `check`.

## 1.4.0 — 2026-10-22

- **Chart** — Each item's box in the roadmap chart starts with its rank, and
  titles over 40 characters are shortened at a word break. An item nothing
  holds up (not in Later, waiting on no open item or milestone) gets a thick
  border. A milestone always counts as waiting, so `check` still never reads
  today's date.
- **Upgrade regenerates the index** — When a new version renders README.md's
  index or done.md differently, as this release does, `upgrade` rewrites
  those generated blocks and says so, instead of leaving `check` to report
  them stale. A roadmap the new rules reject is left alone, and `check`
  reports why.
- **Split** — `split <id> <new-id> --title "..."` adds the other part of an
  item that turned out to be two pieces of work, as hard rule 4 asks. The new
  item copies the bucket, gate, blocked_on, depends_on, milestone and refs,
  and lands directly below the original, with the items under it shifting
  down. The original keeps its id, dependents and links, so you only narrow
  its prose.
- **List** — `list [--bucket now] [--json]` prints the open items in queue
  order, so agents and scripts needn't parse README.md. `--json` gives each
  item's frontmatter and path, with dates as ISO strings.
- **Review** — `review` lists milestones that have passed, with the items
  due for or waiting on them, and Now and Next items nobody has touched for 60
  days (`--days` to change). An item's last touch is the latest of `filed`,
  `updated` and the last commit to its file. Unlike `check`, it uses today's
  date, so it is for people and agents, not CI. It always exits 0. Plain
  `/roadmap` runs it too.
- **Supersedes** — `new --supersedes <declined-id>` files a second attempt
  at a declined idea and links it to the first. The new `[supersedes]` rule
  requires the field to name a declined archived item. Follow-up work on a
  shipped item uses `depends_on` instead. The index shows the link on the new
  item, and done.md shows "superseded by" on the declined one. Nothing to do
  after upgrading.
- **SKILL.md** — Hard rule 0 now lists `decide` among the commands that need
  the user's yes.
- **Decisions log** — `roadmap/decisions.md` logs the decisions that belong
  to no single item, such as a convention or something the project doesn't
  do. `decide --title "..." --body "..."` appends a dated entry, and `init`
  writes the file empty. `check --base` holds it append-only like the archive:
  a decision is reversed by a new entry. SKILL.md searches it along with
  done.md before proposing work. **Upgrade notes:** nothing to do for `check`.
  To start a log, run `decide`, which creates the file. Add
  `roadmap/decisions.md merge=union` to `.gitattributes` so two branches'
  decisions merge cleanly.
- **No chart without arrows** — The index leaves out its Mermaid chart when
  no open item depends on another or on a milestone, since it would only
  repeat the list as boxes. One line says so instead.
- **`updated` is set for you** — `move` to another bucket sets the item's
  `updated` to today (or `--date`, which `move` now takes too). A re-rank
  within the bucket leaves it alone, as do the items shifted to make room.
- **`close` asks for `--as`** — closing an item as shipped without `--as`
  still works, but prints a hint, since the append-only archive can't have it
  added later.
- **Small fixes** — The frontmatter examples in the README template now show
  `milestone`, and say that `depends_on` takes milestone ids. SKILL.md's
  description now also triggers on milestone and OpenSpec questions.
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
