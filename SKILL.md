---
name: roadmap
description: Keep a Now/Next/Later project roadmap as one Markdown file per item, with closed items archived and indexed in done.md, and every rule checked in CI. Use when the user asks what to work on next, wants to file, reprioritise or close a roadmap item, proposes a cleanup or refactor (check done.md first: it may already have been declined), or wants to set up a roadmap in a repo.
license: MIT
metadata:
  author: Tommy Derngren <tommy.derngren@hiq.se>
---

# Roadmap

A simple roadmap, built **KISS style**: Markdown files in three buckets, with
`depends_on` to say which items must come first. Don't add structure the
roadmap doesn't have, such as epics, milestones, estimates or schedules. If one of those seems necessary,
file it as a roadmap item instead of improvising it in the files.

## When invoked as `/roadmap [arguments]`

| Arguments | Do |
|---|---|
| none | Read `roadmap/README.md`. Summarise Now, Next and Later in a few lines, and suggest what to pick up. |
| `init` | Set up a roadmap (see Workflows). |
| `new <description>` | Choose an id and title. **Suggest a bucket, give the reason in one line, and wait for the user to confirm or change it.** Then run `new`, write the prose (what is wrong, why it matters, what done looks like), and run `check`. |
| `move <id> <bucket>` | Run `move`. For `later`, ask what decision it is blocked on. |
| `close <id> [reason]` | Ask whether it shipped or was declined, unless that is clear. Add the outcome and reasoning to the item's prose *before* running `close`, because after that it is append-only. Then run `check`. |
| `check` | Run `check`. Fix what can be fixed (run `index` for `[generated]`), and report the rest. |
| anything else | Treat it as a question. Answer from the roadmap, searching `done.md` first. |

## Layout

A roadmap directory (default `roadmap/`) holds:

- `items/<id>.md`: one open item per file. TOML frontmatter between `+++`
  fences, then the prose argument.
- `archive/<id>.md`: closed items (shipped or declined). Same format, and
  **append-only**.
- `README.md`: conventions plus a **generated** index of the open items.
- `done.md`: a **generated** one-line-per-item index of the archive, newest first.
- `roadmap.toml`: optional; declares extra ref kinds, e.g. openspec specs.

All commands go through `roadmap.py`. Use the repo's vendored copy
(`tools/roadmap.py` by default) if there is one, otherwise this skill's
`scripts/roadmap.py`. Run them from the repo root; pass `--dir` if the roadmap
is somewhere other than `roadmap/`.

When both copies exist, compare their `--version` once per session. If the
vendored copy is older, tell the user and offer to run
`python <skill>/scripts/roadmap.py upgrade`. Don't run it unasked.

## Before proposing work

Search done.md first. Then open only the matching `archive/<id>.md`. Don't
read the whole archive.

```bash
grep -i "<keyword>" roadmap/done.md
```

If a matching entry says **declined**, don't propose the same thing again
without new evidence. Explain what has changed since then.

## Workflows

| Want to | Run |
|---|---|
| Set up a roadmap in a repo | `python <skill>/scripts/roadmap.py init`, where `<skill>` is the directory this SKILL.md was loaded from (e.g. `~/.claude/skills/roadmap` or `.claude/skills/roadmap`). It writes `roadmap/` and vendors the script to `tools/roadmap.py`. Every later command uses `tools/roadmap.py`. For CI setup, point the user at this skill's README. |
| File an item | `python tools/roadmap.py new <id> --title "..." --bucket now [--gate "..."] [--depends-on <id>] [--ref files:path]`, then replace the placeholder body with the argument |
| File an undecided item | `python tools/roadmap.py new <id> --title "..." --bucket later --blocked-on "the open question"` |
| Reprioritise an item | `python tools/roadmap.py move <id> --bucket next` (add `--blocked-on "..."` for `later`). It lands just above the items there that depend on it, shifting them down, or else at the bottom; edit `rank` to place it higher. It refuses a move that would put an item ahead of its dependencies. |
| Close shipped work | `python tools/roadmap.py close <id> --outcome shipped --as <pr-or-change>`, **in the same branch as the code**, so it moves to done.md when that merges |
| Close declined work | `python tools/roadmap.py close <id> --outcome declined` |
| Regenerate the indexes after a hand edit | `python tools/roadmap.py index` |
| Verify | `python tools/roadmap.py check` |
| Upgrade the vendored script, once the user says yes | `python <skill>/scripts/roadmap.py upgrade`. It replaces `tools/roadmap.py` with the skill's copy and runs `check`. Fix or report what the new rules reject. |

**Always finish a roadmap edit with `python tools/roadmap.py check`,** and fix
every problem it reports. Each problem ends with a rule tag in brackets, such
as `[bucket]`. references/conventions.md explains every tag.

Re-ranking within a bucket and editing prose are plain file edits. Run `index`
and `check` afterwards.

## Hard rules

0. **The human is the product owner.** Never file, move or close an item on
   your own initiative. If you spot something worth tracking, **pitch it**:
   - a title,
   - a few lines on what is wrong and why it matters,
   - a suggested bucket.

   Then wait for a yes. Only a yes lets you run `new`, `move` or `close`. An
   explicit request (`/roadmap new ...`, "close this") counts as that yes for
   the item it names, and nothing else.
1. **Never hand-edit the generated blocks** in README.md or done.md. Edit the
   item files and run `index`.
2. **The human decides the bucket.** Suggest one, ask, and then file it.
   Suggest in dependency order. An item goes no earlier than what it depends
   on: if its dependencies are in `now`, suggest `next`, and record them with
   `--depends-on`. An unmade decision means `later`, with `blocked_on` naming
   that decision; an item waiting on a `later` item's decision may rely on its
   `depends_on` instead. The bucket reflects
   priority and blockers, not size.
3. **`now` is the top priority, not "in progress".** Think of it as the
   planned sprint. Don't record who is working on what or when work started:
   that is a commit per status change. The item stays put until its work
   merges.
4. **Scaffolding is not closing.** Writing a design doc or spec for an item
   leaves the item open. Instead, edit the item in place:
   - split it,
   - restate its `gate` as what the work still has to clear,
   - record what the analysis corrected.
5. **Close only when the work is implemented or declined.** Close shipped work
   in the same branch as the code, not in a separate commit. The prose of a
   declined item should say *why*, with measurements if there were any. That
   reasoning is the reason the archive exists.
6. **Never edit an archived entry.** The only exception is to add new lines: a
   dated annotation such as `**2026-10-01:** this claim was falsified by ...`.
   `check --base` fails on any changed or removed line.
7. **Fix roadmap mistakes forward.** Never `reset`, `amend` or rebase to tidy
   a roadmap commit, because other agents may be committing to the same files.
   Commit the correction on top.
8. **Ids are never reused**, including ids of closed items.

See [references/conventions.md](references/conventions.md) for the
frontmatter schema, the rule tags and the reasoning behind each rule.
