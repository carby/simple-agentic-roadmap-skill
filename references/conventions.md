# Roadmap conventions

## Why the roadmap is shaped this way

- **One file per item** means two agents editing different items never
  conflict. It also means an item can be linked, moved and checked on its own.
- **Frontmatter carries what a reader would otherwise have to infer.** That
  includes the bucket, the rank, what gates the item, what it is blocked on,
  and which files and specs it touches. The prose is the argument, and no
  schema touches it.
- **Generated indexes** make README.md and done.md cheap to read and impossible
  to let drift. `check` fails when they differ from what the files render.
- **The archive is split into one file per entry**, because a single
  append-only log grows past what anyone, human or agent, will read before
  proposing work. done.md is small enough to grep, and each line links to the
  one entry worth opening.

## Buckets

| Bucket | Means | Enforced as |
|---|---|---|
| `now` | the top priority, the way a planned sprint is. *Not* "in progress". | no `blocked_on` |
| `next` | ready, and queued to follow once Now is done | no `blocked_on` |
| `later` | blocked on a decision nobody has made yet | `blocked_on` required |

An item that is big or unscoped is not `later` for that reason. Only being
**undecided** puts it there.

**The human is the product owner.** The human decides what goes on the
roadmap, where it sits and when it leaves. An agent that spots something
worth tracking pitches it (title, the problem and why it matters, a suggested
bucket) and files it only after a yes. The same goes for moving and closing
items.

**People decide the bucket.** When filing an item, suggest a bucket and ask
before filing. Base the suggestion on dependency order: an item goes no
earlier than the items it depends on. If its dependencies are in Now, it
belongs in Next. If it depends on an undecided question, it belongs in Later.
If nothing blocks it, weigh it against what is already in Now. Explain the
suggestion in one line, e.g. "Next, because it needs `cache-tokens` (Now)
first". The human will almost always accept it, but the decision is theirs.

**No work-in-progress tracking.** The roadmap doesn't record who is working on
what or when work started. In a version-controlled repo, every status change
would be a commit. An item stays in its bucket until the work is done, and is
**closed in the same branch as the code that does it**, so it moves to
`done.md` when that code merges. A declined item can be closed in its own
commit.

`move <id> --bucket <b>` reprioritises an item, placing it at the bottom of the
target bucket. Adjust `rank` by hand to place it higher. Moving out of
`later` drops `blocked_on`, so record what was decided in the item's prose.

## Frontmatter

Open item (`items/<id>.md`):

```toml
+++
id = "matches-the-filename"       # kebab-case slug
title = "One line, rendered into the index"
bucket = "now"                    # now | next | later
rank = 1                          # positive, unique within the bucket, most valuable first
filed = 2026-09-06                # a bare TOML date, not a string
updated = 2026-09-06              # optional: when the item was last re-argued
gate = "..."                      # optional: the bar the work has to clear
blocked_on = "..."                # required for later, forbidden elsewhere

[refs]                            # optional: every entry must resolve
files = ["src/app.py"]            # built in: paths relative to the repo root
specs = ["auth"]                  # any kind declared in roadmap.toml
+++
```

Archived item (`archive/<id>.md`). `close` produces this shape: the queue
fields (`bucket`, `rank`, `blocked_on`) are removed, and these are
added:

```toml
closed = 2026-09-20
outcome = "shipped"               # shipped | declined
shipped_as = "pr-123"             # optional
```

## roadmap.toml

```toml
root = ".."                       # what refs resolve against; default: parent of the roadmap dir
[refs]
specs   = "openspec/specs/{}"
changes = ["openspec/changes/{}", "openspec/changes/archive/*-{}"]  # any may match; globs allowed
```

## Rule tags

Every problem `check` reports ends in one of these tags.

| Tag | Rule | Typical fix |
|---|---|---|
| `config` | roadmap.toml parses and each ref kind is a template containing `{}` | fix the TOML |
| `frontmatter` | the file starts with `+++`-fenced TOML that parses | add or repair the fence; quote strings |
| `schema` | required fields present, none unknown, id = filename = kebab slug; archived items carry no queue fields | rename the file or the id; remove the stray field |
| `bucket` | bucket is `now`, `next` or `later`; `later` ⇔ `blocked_on` | add `blocked_on`, or `move` the item out of `later` |
| `rank` | positive integer, unique within the bucket | renumber |
| `dates` | bare TOML dates (`2026-09-06`, not `"2026-09-06"`); none earlier than `filed` | unquote the date |
| `body` | the prose says something (HTML comments don't count) | write the argument |
| `refs` | every ref on an open item resolves | update the ref after a rename, or drop it |
| `ids` | an id is used once, across `items/` and `archive/` | choose a new id |
| `links` | every relative link in open items, README.md and done.md resolves | repoint it |
| `generated` | README.md's index and done.md match the files | run `index` |
| `append-only` | with `--base`: no archived entry is removed, moved, or has a line changed | revert the change; add a dated annotation on new lines instead |

Archived entries are exempt from `refs` and `links`. They describe the tree
as it was when they closed, and they cannot be edited to follow a later rename.

## Scaffolding is not closing

Turning an item into a design doc, spec or change proposal does not take it
out of the queue. A proposal is an understanding of what has to be done, not
the doing of it. The item stays in its bucket until the work is complete.
What scaffolding earns is an edit to the item itself:

- **Split it** if the analysis found two pieces of work rather than one.
- **Restate the `gate`** as whatever the work still has to clear. A gate that
  was a question ("benchmark this") is met once the benchmark exists. Leaving
  it in place tells the next reader to redo the work.
- **Record what the analysis corrected**, especially where the item's own
  earlier reasoning turned out to be wrong. A later reader cannot reconstruct
  that part.
- Leave `bucket` alone. Scaffolding changes what is known, not the priority.

## Fix mistakes forward

The roadmap is prose with a schema check over it, and more than one agent
edits it at a time. A wrong entry costs one follow-up commit. **Don't
`reset`, `amend` or rebase to tidy one up.** A neater log is not worth the
risk of dropping a peer's just-landed commit.
