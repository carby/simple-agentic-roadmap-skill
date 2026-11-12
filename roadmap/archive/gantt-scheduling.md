+++
id = "gantt-scheduling"
title = "Gantt scheduling: estimates and dates on a timeline"
filed = 2026-09-25
depends_on = ["dependency-chaining"]
closed = 2026-11-12
outcome = "declined"
+++

Items would carry estimates and start or due dates, rendered as a timeline.

This is the furthest from the current design. The buckets deliberately say *what* stands between an item and starting it, not *when* it happens, and the roadmap avoids tracking work in progress because every status change is a commit. Scheduling needs both. It likely also needs [dependency chaining](../archive/dependency-chaining.md) to order the timeline.

**2026-10-16:** named milestones now exist (see [milestones](../archive/milestones.md)): dates declared in `roadmap.toml` that items are due for or wait on. Estimates, and start or due dates on the items themselves, are still open.

**2026-11-12: declined.** The roadmap says *what* comes first and *what* blocks it, never *when* work happens. Scheduling would need a start date per item, which is tracking work in progress (a commit per status change), plus estimates the roadmap has never had, plus today's date in the generator, which would make `check` answer differently each day. What the item set out to show is covered without those: [dependency-chaining](../archive/dependency-chaining.md) orders the work, the flowchart draws the chain, [milestones](../archive/milestones.md) give dated deadlines, and [milestone-timeline](../items/milestone-timeline.md) places them on a gantt as markers. This rules out estimates, start or due dates on items, and items drawn as bars. Revisit only with evidence that teams using the roadmap need dates per item and would keep estimates current.
