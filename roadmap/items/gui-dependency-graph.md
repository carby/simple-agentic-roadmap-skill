+++
id = "gui-dependency-graph"
title = "The GUI's left-to-right dependency graph, shared by both detail pages"
bucket = "next"
rank = 1
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-scaffold"]
+++

The left-to-right graph that both detail pages draw ([gui-item-page](gui-item-page.md) and [gui-milestones](gui-milestones.md)), built once as a shared widget in the one visual language [gui-breakdown](../archive/gui-breakdown.md) settles.

- 180×64 cards on a 240px pitch, and a centre node that spans the rows and never moves.
- An item reached by several paths sits at its longest-path level, so edges always run left to right.
- One level each way by default. The ends count what is cut off, without duplicates ("← +3 further up (2 open, 1 ◇)"). Enter on the "+n further" end card adds a level and a "− fewer" card removes one; `[ ] { }` do the same, but need AltGr on Nordic and German layouts, so the end cards are the main way.
- At most three cards a column, then "+n more in this level".
- Milestones are end points: one never pulls in everything due for it.
- Closed upstream items fold into one "✓ n done" card that unfolds on a click.
- A needed-first item is a tinted card with a tag; a dashed card always means Later.
- A collapsed legend, and G collapses the graph to one line ("↑ 3 · ↓ 2 · ◆ v3").

**Risk:** egui doesn't move focus with the arrow keys. Moving between cards needs its own key handling, a visible focus ring, and AccessKit nodes in reading order.

Done when the widget draws a node's neighbourhood from the snapshot with every case above, arrow keys and Enter work, and a screen reader reads the cards in order.
