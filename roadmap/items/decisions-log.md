+++
id = "decisions-log"
title = "A decisions log for decisions that belong to no single item"
bucket = "now"
rank = 2
filed = 2026-10-22
+++

Decisions are written into an item's prose today ("**Decided 2026-10-13:** ..."), and `move` out of `later` drops `blocked_on` and asks for the decision to be recorded there. That works for a decision about one item. A decision that cuts across items, such as a convention, an architecture choice or "we never do X", has nowhere to go. snakestream keeps one in `roadmap/decisions.md` for this reason.

Done looks like: an optional, append-only `decisions.md` of dated entries, held by the same `check --base` rule as the archive, and a SKILL.md that searches both done.md and decisions.md before proposing work.

**Outcome:** shipped. `decide --title --body` appends a dated `## YYYY-MM-DD: title` entry to `roadmap/decisions.md`, oldest first, and creates the file if a roadmap predates it. `init` writes it empty. `check --base` holds it append-only with the archive's rule, so a decision is reversed by a new entry. Like the archive, it is exempt from `links`. It merges with git's built-in `merge=union`, since branches only append. Writing entries through a command rather than by hand was the product owner's call: it keeps the date and position right. A `--body` is required, because the reasoning is what the log is for.
