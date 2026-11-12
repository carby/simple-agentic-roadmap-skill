+++
id = "milestone-timeline"
title = "A milestone timeline in the roadmap index"
bucket = "now"
rank = 20
filed = 2026-10-22

[refs]
files = ["src/render.ts"]
+++

Milestones have dates, but the index only shows them as hexagons in the flowchart, with nothing placing them in time. Since [milestone-history](../archive/milestone-history.md), passed milestones stay in roadmap.toml, and done.md lists them with what shipped for them, but no view puts past and coming milestones on one line.

Items can't be bars. Every Mermaid `gantt` task needs a start and an end or a duration, but an item only has a deadline: the milestone it is due for. Drawing it as a bar would invent a start date and an estimate, which the roadmap deliberately doesn't have (see [gantt-scheduling](../archive/gantt-scheduling.md)).

Done looks like:
- When roadmap.toml declares milestones, the index adds a Mermaid `gantt` with one dated marker (`milestone`, 0 days) per declared milestone, passed or coming, in date order.
- Under the chart, each milestone lists the open items due for it, linked. A passed milestone links to done.md, whose Milestones list shows what shipped for it. Items appear only in that list, never as bars.
- It uses only declared dates, never today's, so `check` keeps giving the same answer every day. Mermaid's own today marker is drawn by the viewer, not by the generator, so it can stay.

**2026-11-12:** planning corrected two points, after a UX review of the plan:
- "A passed milestone links to done.md" can't hold, because knowing a milestone has passed takes today's date, which the generator never reads. A milestone links to done.md instead when archived items name it, which is the same set in practice and comes from the files alone. The dates, "nothing open" and Mermaid's viewer-drawn today line still show which milestones are behind.
- A gantt whose markers all share one date has an axis spanning no time, and Mermaid clips the marker, so the chart is drawn only for two or more distinct dates. The list under it is always there.

The gantt grammar ends a task's name only at a colon, so a title's colon becomes a lookalike (`∶`), and a title that starts like a gantt keyword or a comment (`Call for papers`, `5% rollout`) is quoted.
