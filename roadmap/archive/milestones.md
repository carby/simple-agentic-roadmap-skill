+++
id = "milestones"
title = "Milestones that items can depend on"
filed = 2026-10-16
depends_on = ["dependency-chaining"]
closed = 2026-10-16
outcome = "shipped"
+++

Items could depend on a milestone, not just on other items, e.g. `depends_on = ["v2"]`. That would let a set of items wait on a release or checkpoint without naming each item that makes it up.

This extends [dependency chaining](../archive/dependency-chaining.md), which today only resolves ids against items. A milestone has to be defined somewhere (`roadmap.toml`, or its own file), and `check` has to know when it counts as reached: when every item assigned to it has closed, or when someone marks it so. It overlaps with [epics](../items/epics.md), since a milestone is roughly a parent item that closes when its children do, so the two should probably be decided together.

**Decided 2026-10-16:** a milestone is what it is in a Gantt chart: a single point in time with a name. It is not a group of items, so it stays separate from [epics](../items/epics.md). Three further choices:
- Milestones are declared in `roadmap.toml` as `[milestones] beta = { title = "...", date = 2026-12-01 }`. A milestone has a title and a date and nothing else, so it needs no file or prose of its own.
- Items relate to a milestone in both directions. `depends_on = ["beta"]` waits on it, and `milestone = "beta"` is due for it, with one milestone per item, as in GitHub. `check` puts items due for a milestone, or for an earlier one, ahead of the items waiting on it. It also rejects an item that waits on a milestone at or after the one it is due for, or that depends on an item due for a later milestone.
- No rule compares against today's date, so `check` gives the same answer every day. A milestone that has passed is retired by hand: drop the `depends_on` entries that name it, then delete it from `roadmap.toml`.
