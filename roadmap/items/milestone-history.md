+++
id = "milestone-history"
title = "Keep passed milestones, and show what shipped for them"
bucket = "now"
rank = 12
filed = 2026-10-30

[refs]
files = ["scripts/roadmap.py", "references/conventions.md"]
+++

Once a milestone passes, the convention says to drop the `depends_on` entries that name it and then delete it from `roadmap.toml`. `review` keeps flagging it until you do. Archived items still say `milestone = "beta"`, but that id no longer resolves to a title or a date, and `done.md` never mentions milestones. Nothing answers "what shipped for beta, and when was it?"

The deletion isn't needed. `check` never reads today's date, so a passed milestone that stays declared costs nothing. Only the `depends_on` entries that point at it have to go, because they keep imposing an ordering that no longer matters.

Done looks like:
- The convention keeps passed milestones in `roadmap.toml` as history. You re-date one, or re-target the open items due for it, and drop the `depends_on` entries that name it.
- `review` flags a passed milestone only while an open item still names it.
- `done.md` lists each milestone that archived items name, with its date and how many shipped or were declined. Each closed line that names a milestone says which one, so `grep beta done.md` finds everything that shipped for it.
- An archived item naming a milestone that is no longer declared shows the bare id and isn't a `check` failure, so roadmaps that followed the old convention stay green.
