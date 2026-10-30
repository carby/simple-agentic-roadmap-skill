+++
id = "milestone-timeline"
title = "A milestone timeline in the roadmap index"
bucket = "now"
rank = 15
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

Milestones have dates, but the index only shows them as hexagons in the flowchart, with nothing placing them in time. Since [milestone-history](../archive/milestone-history.md), passed milestones stay in roadmap.toml, and done.md lists them with what shipped for them, but no view puts past and coming milestones on one line.

Items can't be bars. Every Mermaid `gantt` task needs a start and an end or a duration, but an item only has a deadline: the milestone it is due for. Drawing it as a bar would invent a start date and an estimate, which the roadmap deliberately doesn't have (see [gantt-scheduling](gantt-scheduling.md)).

Done looks like:
- When roadmap.toml declares milestones, the index adds a Mermaid `gantt` with one dated marker (`milestone`, 0 days) per declared milestone, passed or coming, in date order.
- Under the chart, each milestone lists the open items due for it, linked. A passed milestone links to done.md, whose Milestones list shows what shipped for it. Items appear only in that list, never as bars.
- It uses only declared dates, never today's, so `check` keeps giving the same answer every day. Mermaid's own today marker is drawn by the viewer, not by the generator, so it can stay.
