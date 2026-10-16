+++
id = "milestones"
title = "Milestones that items can depend on"
bucket = "later"
rank = 5
filed = 2026-10-16
blocked_on = "what a milestone is: a named point items gather behind, or a tag on items, or an epic by another name"
depends_on = ["dependency-chaining"]
+++

Items could depend on a milestone, not just on other items, e.g. `depends_on = ["v2"]`. That would let a set of items wait on a release or checkpoint without naming each item that makes it up.

This extends [dependency chaining](../archive/dependency-chaining.md), which today only resolves ids against items. A milestone has to be defined somewhere (`roadmap.toml`, or its own file), and `check` has to know when it counts as reached: when every item assigned to it has closed, or when someone marks it so. It overlaps with [epics](epics.md), since a milestone is roughly a parent item that closes when its children do, so the two should probably be decided together.
