+++
id = "decisions-log"
title = "A decisions log for decisions that belong to no single item"
bucket = "now"
rank = 2
filed = 2026-10-22
+++

Decisions are written into an item's prose today ("**Decided 2026-10-13:** ..."), and `move` out of `later` drops `blocked_on` and asks for the decision to be recorded there. That works for a decision about one item. A decision that cuts across items, such as a convention, an architecture choice or "we never do X", has nowhere to go. snakestream keeps one in `roadmap/decisions.md` for this reason.

Done looks like: an optional, append-only `decisions.md` of dated entries, held by the same `check --base` rule as the archive, and a SKILL.md that searches both done.md and decisions.md before proposing work.
