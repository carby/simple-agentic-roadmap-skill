+++
id = "multi-milestone"
title = "Let an item be due for several milestones"
filed = 2026-11-24
closed = 2026-11-24
outcome = "shipped"
shipped_as = "#40"
+++

An item's `milestone` field holds a single id, so an item can be due for only one milestone. `depends_on` can already name several milestones; being *due for* several is the part that's missing. The question came up while designing the GUI in [gui-breakdown](../items/gui-breakdown.md), whose queue and item page draw items that depend on several items and milestones. Work that has to land for both a beta and a release can today only name one of them, and the other milestone's list in done.md and the index leaves it out.

Questions to settle:
- Is `milestone` an array, or does a new field sit next to it? Either way, existing roadmaps have to keep validating, or `update` has to migrate them.
- Which milestone sets the item's lateness, its order relative to items that wait on a milestone, and the rule that it waits on no milestone at or after the one it is due for (the `[depends]` rule): the earliest one, or each one separately?
- How the README index, done.md's Milestones list, `list --json` and the GUI's read interface ([gui-read-interface](../items/gui-read-interface.md)) show an item that is due for more than one milestone.

Done when an item can name several milestones it is due for, `check` enforces the ordering rules against each of them, every index lists the item under each milestone, and conventions.md documents the field.

This is not [epics](../items/epics.md): it adds no hierarchy of items, which is still the open question there.

**Outcome (2026-11-24): shipped in #40.** `milestone` became a list on open items, and `update` migrates the old string; archived items keep the string as history. Of several milestones, the earliest one binds: it sets the order relative to items that wait on a milestone, and the `[depends]` rule that an item waits on no milestone at or after the one it is due for. Every milestone in the list must be declared and not reached. The index, chart, `list` and done.md name each milestone, earliest first; done.md counts the item under each, and `review` lists it under each passed, unreached one.
