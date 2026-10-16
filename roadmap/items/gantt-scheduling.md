+++
id = "gantt-scheduling"
title = "Gantt scheduling: estimates and dates on a timeline"
bucket = "later"
rank = 4
filed = 2026-09-25
depends_on = ["dependency-chaining"]
blocked_on = "whether the roadmap should say when work happens, not just what is blocking it"
+++

Items would carry estimates and start or due dates, rendered as a timeline.

This is the furthest from the current design. The buckets deliberately say *what* stands between an item and starting it, not *when* it happens, and the roadmap avoids tracking work in progress because every status change is a commit. Scheduling needs both. It likely also needs [dependency chaining](../archive/dependency-chaining.md) to order the timeline.

**2026-10-16:** named milestones now exist (see [milestones](../archive/milestones.md)): dates declared in `roadmap.toml` that items are due for or wait on. Estimates, and start or due dates on the items themselves, are still open.
