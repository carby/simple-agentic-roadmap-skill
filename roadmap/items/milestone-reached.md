+++
id = "milestone-reached"
title = "Mark milestones reached, and keep passed ones in depends_on"
bucket = "now"
rank = 14
filed = 2026-11-13

[refs]
files = ["src/rules.ts", "references/conventions.md"]
+++

The convention from [milestone-history](../archive/milestone-history.md) said: once a milestone passes, drop the `depends_on` entries that name it, and `review` listed every waiting item until you did. That rewrites the dependency chain because time passed. A shipped item may stay in `depends_on` forever, but a passed milestone may not. Why an item waited is lost from its record, and every passed check-in date means hand edits in several items. A date passing is also not the milestone being met: `check` never reads today's date, so nothing could tell.

Reported from a real roadmap (2026-11-13): a three-week check-in milestone had to be dropped from five items' `depends_on` after it was done, and the user said: "we should not change the dependency chain because a single milestone or task is moved into done".

Done looks like:
- A milestone takes an optional `reached = <date>` in roadmap.toml, set by a person once it is met, like closing an item.
- A reached milestone is satisfied, like a shipped item: it orders nothing, makes nothing Later, the chart leaves it out, and the index notes when it was reached. No open item may still be due for it (`[depends]`).
- `review` lists a passed milestone only while it is not reached and open items name it, and never says to drop `depends_on` entries.
- conventions.md, SKILL.md (hard rule 0 and a Workflows row), docs and the template say so; `update` adds the template comment; CHANGELOG has the upgrade note that older releases reject the key.
- The plan was reviewed by a second agent before implementing; its changes (no arrows for reached milestones, `pending` in the late-item message, the older-CLI note, the template migration) are in.
