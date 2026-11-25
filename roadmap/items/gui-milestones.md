+++
id = "gui-milestones"
title = "The GUI's Milestones tab and milestone page"
bucket = "next"
rank = 3
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-dependency-graph"]
+++

The Milestones tab (Ctrl+2) and the milestone page, as the notes in [gui-breakdown](../archive/gui-breakdown.md) settle them.

- The tab shows every declared milestone in date order, as cards that become a list past a few, with a ✓ for a reached one and "late N d" for a passed one.
- Enter on a card, or a milestone chip in the queue or a graph, opens the milestone's page.
- The page uses the header, breadcrumb and graph of the item page ([gui-dependency-graph](gui-dependency-graph.md)): a graph that runs into the milestone with every item due for it, plus every open item those wait on that isn't due for it, marked as needed first. Items that wait on the milestone show on its right.
- Closed items due for it fold into one "✓ n closed" card: shipped ones count as done, declined ones are greyed out and don't count.
- A progress bar, and the one counting phrase used everywhere: "N due open, N needed first · N closed".
- "Still to land: n", in the order things can land, and the closed ones with their outcome and `shipped_as`.

It reads only what the snapshot from [gui-read-interface](gui-read-interface.md) carries.

Done when the tab and the page draw this roadmap's milestones, including gui-preview, with every case above.
