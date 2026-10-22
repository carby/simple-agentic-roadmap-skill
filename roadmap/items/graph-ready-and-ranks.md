+++
id = "graph-ready-and-ranks"
title = "Show readiness and rank in the roadmap chart"
bucket = "now"
rank = 9
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

The Mermaid chart in README.md draws one box per item with its full title, and nothing else. It says nothing the list below it doesn't, and long titles make the boxes wide.

Done looks like: `render_graph` gives an item whose dependencies are all satisfied a solid border and one still waiting a thin border, puts the rank in each label ("1 · Parallel branches..."), and shortens long titles. No colours, so the chart still reads in light and dark themes.
