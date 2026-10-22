+++
id = "graph-only-with-edges"
title = "Leave out the roadmap chart when it has no arrows"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#9"

[refs]
files = ["scripts/roadmap.py"]
+++

Without dependencies or milestones the chart has no arrows, and is just the list below it drawn as boxes. That is the case for this roadmap today.

Done looks like: `render_graph` renders nothing when no open item has an arrow to draw, and the index says so in one line instead, e.g. "No dependencies between open items."

**Outcome:** shipped. `render_graph` returns nothing unless some open item depends on another or on a milestone, and the index says "No open item depends on another or on a milestone, so there is no chart." in its place. A milestone is only drawn when an item names it, which always gives it an arrow, so an arrowless chart was always just boxes. Repos without arrows see a `[generated]` problem after upgrading, until they run `index`.
