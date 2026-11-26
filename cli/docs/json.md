---
tags: [roadmap-skill, scripting]
aliases: [JSON, export, Scripting]
---

# JSON output

`roadmap export` prints the whole roadmap as one JSON document. It is built
for a GUI, and scripts and agents can use it too. `roadmap list --json`
prints the open items in the same kind of document. Read the roadmap through
these documents rather than by parsing the Markdown: the files' layout
belongs to the CLI, but the documents carry a schema number.

```bash
roadmap export > snapshot.json
roadmap list --json --bucket now
```

## The contract

With `--json`, and always with `export`:

1. stdout holds exactly one JSON document, whether the command succeeds,
   fails on a bad argument, or finds no roadmap. Every document carries
   `schema`, `ok` and `warnings`. A failure also carries `rule` and
   `message`.
2. `--json` is spotted before the other arguments are parsed, so a bad
   argument still gets a JSON answer.
3. Warnings that would otherwise go to stderr, such as roadmap.toml pinning
   another release, go into `warnings`.
4. The exit code agrees with `ok`: 0 when it is true, and non-zero otherwise.
5. It never prompts.
6. stderr is only for a crash, which prints a stack trace there, next to a
   `crash` document on stdout.

`--help` and `--version` are the one exception: they print text, as they do
without `--json`.

## Failures

| `rule` | Exit | When |
|---|---|---|
| `usage` | 2 | A bad argument, an option the command doesn't take (`check --json`), or a command that can't run as asked |
| `config` | 2 | roadmap.toml doesn't parse, or declares something wrong |
| `no-roadmap` | 2 | `--dir` (default `roadmap`) is not a directory with an `items/` folder |
| `frontmatter` | 1 | `list --json` only: a file that won't parse. `problems` lists each one as `{path, rule, message, line}` |
| `crash` | 1 | A bug in the CLI. The stack trace is on stderr |

These are not `check`'s [rule tags](rule-tags.md). `check` itself doesn't
take `--json` yet.

## `export`

```json
{
  "schema": 1,
  "ok": true,
  "warnings": [],
  "version": "2.2.0",
  "dir": "/home/me/src/app/roadmap",
  "git": { "branch": "main", "clean": true },
  "milestones": [
    { "id": "beta", "title": "Public beta", "date": "2026-12-01", "reached": null,
      "due": ["cache-tokens"], "waiting": ["split-app"] }
  ],
  "items": [
    { "id": "cache-tokens", "path": "items/cache-tokens.md", "archived": false,
      "frontmatter": { "id": "cache-tokens", "title": "Cache auth tokens", "bucket": "now", "rank": 1,
                       "filed": "2026-08-01", "milestone": ["beta"] },
      "body": "\nLogins are slow.\n",
      "committed": "2026-08-02",
      "depends_on": [], "due": ["beta"], "dependents": ["split-app"],
      "state": "ready", "waits_on": { "items": [], "milestones": [] } }
  ],
  "archived": [],
  "unreadable": []
}
```

The top level:

- `version`: the CLI's release.
- `dir`: the roadmap directory, as an absolute path. Item `path`s are
  relative to it.
- `git`: `branch` (null on a detached HEAD) and `clean` (whether the whole
  working tree has no changes, untracked files included). It is null outside
  a git repository.
- `milestones`: those roadmap.toml declares, by date, then id. Each has
  `date` and `reached` (null until someone marks it met), plus:
  - `due`: the items due for it, open and archived.
  - `waiting`: the items whose `depends_on` names it.
- `items`: the open items, in queue order (bucket, then rank). An item whose
  bucket or rank is invalid comes last.
- `archived`: the closed items, newest first, as done.md lists them.
- `unreadable`: files that won't parse, as `{path, message}`. They are left
  out of `items` and `archived`, and each gets a warning. One broken file
  doesn't fail the export.

Each item, open or archived:

- `frontmatter`: exactly as the file has it. Dates are `YYYY-MM-DD` strings.
  A non-finite float such as `nan` is written as the string TOML spells it.
- `body`: the prose after the closing `+++`, untrimmed.
- `committed`: the author date of the last commit that changed the file. It
  is null when git doesn't track the file, or outside git.
- `depends_on` and `due`: the item's dependencies and the milestones it is
  due for, always as lists. They are empty when the frontmatter field is
  missing or malformed. An archived item's older `milestone = "beta"` comes
  out as `["beta"]`.
- `dependents`: the items, open and archived, whose `depends_on` names this
  one.

Each open item also has:

- `state`: `ready`, `waiting`, `later`, or null for an invalid bucket. An
  item is ready when it isn't in Later and waits on no open item and no
  unreached milestone. The index's chart marks the same items as ready.
- `waits_on`: what holds a waiting item. `items` are its open dependencies,
  and `milestones` are the milestones it depends on that nobody has marked
  reached.

## `list --json`

```json
{ "schema": 1, "ok": true, "warnings": [],
  "items": [ { "path": "roadmap/items/cache-tokens.md", "id": "cache-tokens", "...": "..." } ] }
```

`items` holds the open items in queue order, filtered by `--bucket`. Each one
is its frontmatter plus `path`, which is relative to where you ran the
command. Before 2.3.0, `list --json` printed the bare array that is now
`items`.

## The schema number

`schema` moves when a field is removed or renamed, or its type changes.
Adding a field keeps it, so a reader should ignore fields it doesn't know,
and refuse a `schema` it doesn't know. A program that needs `export` should
also expect an older CLI without it. A global `roadmap` hands off to the
version the repo pins, and that version may predate `export`: it then fails
with a usage error and no JSON on stdout.
