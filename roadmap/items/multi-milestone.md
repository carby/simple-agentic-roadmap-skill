+++
id = "multi-milestone"
title = "Let an item be due for several milestones"
bucket = "now"
rank = 16
filed = 2026-11-24
+++

An item's `milestone` field holds a single id, so an item can be due for only one milestone. `depends_on` can already name several milestones; being *due for* several is the part that's missing. The question came up while designing the GUI in [gui-breakdown](gui-breakdown.md), whose queue and item page draw items that depend on several items and milestones. Work that has to land for both a beta and a release can today only name one of them, and the other milestone's list in done.md and the index leaves it out.

Questions to settle:
- Is `milestone` an array, or does a new field sit next to it? Either way, existing roadmaps have to keep validating, or `update` has to migrate them.
- Which milestone sets the item's lateness, its order relative to items that wait on a milestone, and the rule that it waits on no milestone at or after the one it is due for (the `[depends]` rule): the earliest one, or each one separately?
- How the README index, done.md's Milestones list, `list --json` and the GUI's read interface ([gui-read-interface](gui-read-interface.md)) show an item that is due for more than one milestone.

Done when an item can name several milestones it is due for, `check` enforces the ordering rules against each of them, every index lists the item under each milestone, and conventions.md documents the field.

This is not [epics](epics.md): it adds no hierarchy of items, which is still the open question there.
