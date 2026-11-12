+++
id = "drop-mermaid"
title = "Drop the Mermaid chart from the index"
bucket = "next"
rank = 3
filed = 2026-11-12
gate = "the GUI's read-only view has shipped from its own repo"
depends_on = ["gui-read-interface"]

[refs]
files = ["src/render.ts"]
+++

The README index draws a Mermaid flowchart of the open items and their dependencies. Once the GUI planned in [gui-breakdown](gui-breakdown.md) shows the dependency chain both up and down, the chart has a better replacement, and the index can be plain text only.

Dropping it removes what Mermaid costs to keep: escaping labels, keywords that collide with ids, and a chart whose layout nobody controls. The [milestone-timeline](../archive/milestone-timeline.md) attempt was declined for that kind of upkeep.

The text index stays. It is what agents read and grep, what `check` keeps honest, and what someone browsing the repo on GitHub sees.

Done looks like:
- `renderGraph` and the "no chart" sentence are gone from the index, and the tests that pin them are updated.
- The CHANGELOG has an upgrade note: `update` regenerates every README once, and nothing changes for `check`.

The GUI ships from another repo, which `depends_on` can't name, so the gate holds this item until the GUI's read-only view has shipped.
