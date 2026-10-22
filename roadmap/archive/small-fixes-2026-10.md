+++
id = "small-fixes-2026-10"
title = "Small fixes to docs, templates and defaults"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#8"
+++

Small things found in a review of the skill on 2026-10-22, collected in one item:
- roadmap/README.md says "a missing feature such as dependencies, hierarchy or dates is just a difference". Dependencies and dates (milestones) exist now, so the sentence is stale.
- The frontmatter examples in roadmap/README.md and assets/template/README.md leave out `milestone`, so a new repo gets an incomplete reference.
- The tool never sets `updated`. `move`, and a move out of `later` above all, is when an item is re-argued, so it could set it.
- `close --outcome shipped` without `--as` is allowed. Suggesting the change or PR name would make the archive more useful.
- SKILL.md's description mentions neither milestones nor OpenSpec, so a question like "what has to be done for beta?" may not trigger the skill.

**Outcome:** all five shipped. `move` sets `updated` only on a change of bucket: a re-rank isn't the item being re-argued, and the items shifted aside never are. `close --outcome shipped` without `--as` still closes and prints a hint, rather than refusing, so existing scripts don't break; SKILL.md now tells the agent to always pass `--as`. The guiding principle now names hierarchy, estimates and schedules as the missing features, matching the epics and Gantt items in Later.
