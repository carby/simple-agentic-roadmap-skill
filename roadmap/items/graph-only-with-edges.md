+++
id = "graph-only-with-edges"
title = "Leave out the roadmap chart when it has no arrows"
bucket = "now"
rank = 10
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

Without dependencies or milestones the chart has no arrows, and is just the list below it drawn as boxes. That is the case for this roadmap today.

Done looks like: `render_graph` renders nothing when no open item has an arrow to draw, and the index says so in one line instead, e.g. "No dependencies between open items."
