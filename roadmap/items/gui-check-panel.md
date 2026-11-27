+++
id = "gui-check-panel"
title = "Show check problems in the GUI"
bucket = "next"
rank = 14
filed = 2026-11-25
depends_on = ["json-write-results", "gui-item-page"]
+++

Showing `check` problems in the GUI, as the notes in [gui-breakdown](../archive/gui-breakdown.md) settle it, from `check --json` ([json-write-results](json-write-results.md)).

- An item's own problems show as a red band between its header and its graph on the item page, and as a mark on its queue row.
- While check reports problems, the queue gets a Check panel on the right, about 300px, listing all of them, including those that belong to no row. It closes again when they're fixed.
- "check: n problems" in the status bar focuses the panel from anywhere.

Done when a roadmap with problems of each kind (an item's own, and one that belongs to no row) shows them as above, and a clean one shows nothing.
