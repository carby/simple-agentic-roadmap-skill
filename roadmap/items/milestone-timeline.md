+++
id = "milestone-timeline"
title = "A milestone timeline in the roadmap index"
bucket = "now"
rank = 11
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

Milestones have dates, but the index only shows them as hexagons in the flowchart, with nothing placing them in time.

Done looks like: when roadmap.toml declares milestones that open items name, the index adds a Mermaid `gantt` with each milestone as a dated marker and the items due for it under it. It uses only declared dates, never today's, so `check` keeps giving the same answer every day.
