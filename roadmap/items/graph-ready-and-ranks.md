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

**Outcome:** shipped.
- **Labels:** each item's box reads "{rank} · {title}". A title over 40 characters is cut at a word break with "…"; the list below keeps the full title.
- **Readiness:** an item nothing holds up gets a thick border. That means it isn't in Later and waits on no open item and no milestone. Later keeps its dashed border, and no colours were added.
- **Milestones:** they always count as waiting, even after their date. Telling whether one has passed would need today's date, and `check` must give the same answer every day; `review` flags passed milestones instead.
- **Upgrade:** while planning it became clear that every rendering change, this one and #9, would leave upgraded repos failing `[generated]` until someone ran `index`. So `upgrade` now regenerates the index itself when the roadmap is otherwise valid.
