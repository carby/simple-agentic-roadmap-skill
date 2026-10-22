# Roadmap conventions

## Why the roadmap is shaped this way

- **One file per item** means two agents editing different items don't
  conflict in the item files. What the commands write around them, the
  generated blocks and the next free rank, can still clash; see
  [Parallel branches](#parallel-branches). It also means an item can be
  linked, moved and checked on its own.
- **Frontmatter carries what a reader would otherwise have to infer.** That
  includes the bucket, the rank, what gates the item, what it is blocked on,
  which items must come first, and which files and specs it touches. The prose is the argument, and no
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
| `later` | blocked on a decision nobody has made yet | `blocked_on`, or a dependency that is itself in `later` |

An item that is big or unscoped is not `later` for that reason. Only being
**undecided** puts it there.

**The human is the product owner.** The human decides what goes on the
roadmap, where it sits and when it leaves. An agent that spots something
worth tracking pitches it (title, the problem and why it matters, a suggested
bucket) and files it only after a yes. The same goes for moving and closing
items.

**Dependencies decide the order.** `depends_on` lists the items that must
come first. `check` holds each one ahead of the item: in an earlier bucket, or
higher in the same one. Ranks are unique, so that also rules out cycles. A
shipped dependency is satisfied. A declined one fails `check` until the item is
re-argued, either by dropping the dependency or re-scoping the item, and
`close --outcome declined` refuses while other items still depend on it. A
`later` item that depends on another `later` item waits on that item's
decision, so it may leave out `blocked_on`.

**Milestones are named points in time.** roadmap.toml declares them, each
with a title and a date. An item relates to a milestone in one of two ways:

- `milestone = "beta"`: the item is **due for** beta, and ships by then. An
  item has at most one milestone.
- `depends_on = ["beta"]`: the item **waits on** beta, and doesn't start
  before it. `depends_on` mixes item and milestone ids freely.

`check` puts every item due for a milestone, or for an earlier one, ahead of
the items that wait on it, in the same bucket-then-rank order as a
dependency. An item can't wait on a milestone that falls on or after the one
it is due for, and it can't depend on an item that is due for a later
milestone than its own. A `later` item due for a milestone makes the items
waiting on it `later` too, without a `blocked_on` of their own. Dates order
milestones against each other, never against today, so `check` gives the same
answer every day. Once a milestone has passed, drop the `depends_on` entries
that name it and then delete it from roadmap.toml. Archived items may still
name it, because they are history. Milestones need roadmap.py 1.3.0 or later,
because older versions reject the `[milestones]` table.

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

`move <id> --bucket <b>` reprioritises an item. It lands just above the first
item in the target bucket that has to follow it (it depends on the item, or
waits on a milestone the item is due for). That item and everything below it
shift down a rank. If nothing there has to follow it, it lands at the
bottom. `--rank <n>` or `--above <id>` places it instead, and re-ranks an
item within its own bucket: the items between its old and new place shift a
rank to make room. `--above` takes the other item's bucket. `new`, `move` and `close`
refuse, and write nothing, when the result would break `bucket` or `depends`:
for example a move that leaves a dependency behind its dependent, or a close
that takes away the `later` item another `later` item was waiting on. Moving
out of `later` drops `blocked_on`, so record what was decided in the item's
prose.

## Parallel branches

Two branches that each run `new`, `move` or `close` merge cleanly in the item
files, but not always around them:

- **The generated blocks clash.** Both branches rewrote the index in README.md
  or done.md. Take either side of the conflict, then run `index`, which
  renders the block from the merged item files.
- **Ranks collide.** `new` gives an item the next free rank in its bucket, so
  two branches filing in the same bucket hand out the same rank, and `check`
  fails with `[rank]` after the merge. Run `index --renumber`: it numbers each
  bucket 1, 2, 3... in its current order, with tied items keeping their
  dependencies first, then oldest first.

`merge-driver` resolves the first case for you. It lets git merge the
hand-written text as usual and keeps this branch's generated block whole, so
the merge stops only for a real conflict. Run `index` afterwards, since the
kept block is likely stale; `check` reports `[generated]` until you do. Turn
it on with two lines in `.gitattributes`:

```text
roadmap/README.md merge=roadmap
roadmap/done.md merge=roadmap
```

and, in each clone (git doesn't take drivers from the repo):

```bash
git config merge.roadmap.driver "python tools/roadmap.py merge-driver %O %A %B %P"
```

decisions.md needs no driver. Each branch only appends entries to it, so
git's built-in union merge keeps both sides:

```text
roadmap/decisions.md merge=union
```

## Decisions

An item's prose records the decisions about that item, such as what was
decided when it left `later`. A decision that cuts across items, such as a
convention, an architecture choice or "we never do X", has no item to live in.
It goes in `decisions.md`, appended by `decide`:

```markdown
## 2026-10-22: Short title of the decision

Why, and what it rules out.
```

Entries are oldest first. The file is append-only, like the archive and for
the same reason: the reasoning has to survive for the next reader. To reverse
a decision, record a new one that names the old one and says what changed.
A dated annotation under an old entry is also allowed. `init` writes the file
empty, and `decide` creates it in a roadmap that predates it. Like the
archive, it is exempt from `links`.

## Frontmatter

Open item (`items/<id>.md`):

```toml
+++
id = "matches-the-filename"       # kebab-case slug
title = "One line, rendered into the index"
bucket = "now"                    # now | next | later
rank = 1                          # positive, unique within the bucket, most valuable first
filed = 2026-09-06                # a bare TOML date, not a string
updated = 2026-09-06              # optional: when the item was last re-argued; `move` to another bucket sets it
gate = "..."                      # optional: the bar the work has to clear
blocked_on = "..."                # required for later (unless depends_on names a later item), forbidden elsewhere
milestone = "beta"                # optional: the milestone the item is due for, declared in roadmap.toml
depends_on = ["other-item"]       # optional: item or milestone ids that must come first; above [refs], or TOML files it under refs
supersedes = "old-item"           # optional: the declined archived item this one tries again

[refs]                            # optional: every entry must resolve
files = ["src/app.py"]            # built in: paths relative to the repo root
specs = ["auth"]                  # any kind declared in roadmap.toml
+++
```

Archived item (`archive/<id>.md`). `close` produces this shape: the queue
fields (`bucket`, `rank`, `blocked_on`) are removed, `depends_on` and
`milestone` stay as history, and these are added:

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
[milestones]                      # kebab-case id = a title and a bare TOML date
beta = { title = "Public beta", date = 2026-12-01 }
```

## Rule tags

Every problem `check` reports ends in one of these tags.

| Tag | Rule | Typical fix |
|---|---|---|
| `config` | roadmap.toml parses, each ref kind is a template containing `{}`, and each milestone has a `title` and a bare `date` | fix the TOML |
| `frontmatter` | the file starts with `+++`-fenced TOML that parses | add or repair the fence; quote strings |
| `schema` | required fields present, none unknown, id = filename = kebab slug; archived items carry no queue fields | rename the file or the id; remove the stray field |
| `bucket` | bucket is `now`, `next` or `later`; `later` ⇔ `blocked_on`, or a dependency in `later` | add `blocked_on`, or `move` the item out of `later` |
| `rank` | positive integer, unique within the bucket | `index --renumber` |
| `depends` | `depends_on` is a list of ids naming open or shipped items or declared milestones, each ahead of the item: in an earlier bucket, or higher in the same one. `milestone` names a declared milestone; items due for it (or an earlier one) come before items waiting on it, and no item waits on a milestone at or after the one it is due for | reorder or `move` the items; drop a declined or missing dependency and re-argue the item; drop a passed milestone from `depends_on` |
| `supersedes` | `supersedes` names a declined archived item, not the item itself | point it at the declined item; for follow-up work on a shipped item use `depends_on` |
| `dates` | bare TOML dates (`2026-09-06`, not `"2026-09-06"`); none earlier than `filed` | unquote the date |
| `body` | the prose says something (HTML comments don't count) | write the argument |
| `refs` | every ref on an open item resolves | update the ref after a rename, or drop it |
| `ids` | an id is used once, across `items/`, `archive/` and the milestones in roadmap.toml | choose a new id |
| `links` | every relative link in open items, README.md and done.md resolves (not the archive or decisions.md) | repoint it |
| `generated` | README.md's index and done.md match the files | run `index` |
| `append-only` | with `--base`: no archived entry is removed, moved, or has a line changed, and neither is decisions.md or one of its lines | revert the change; add a dated annotation or a new decision on new lines instead |

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
