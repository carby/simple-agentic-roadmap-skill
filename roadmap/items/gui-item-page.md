+++
id = "gui-item-page"
title = "The GUI's item page, with history and navigation"
bucket = "next"
rank = 2
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-queue", "gui-dependency-graph"]
+++

The item page, opened with Enter or a double-click on a queue row, as the notes in [gui-breakdown](gui-breakdown.md) settle it. It mirrors the milestone page.

- A toolbar breadcrumb: its root plus the last three crumbs; jumping to one drops the forward history.
- A pinned header: glyph, id, title, a status line, and one summary line ("2 open dependencies, 1 needed first"). The page scrolls as one document under it.
- The graph from [gui-dependency-graph](gui-dependency-graph.md): what it depends on → the item → what needs it, with the milestones it is due for.
- The frontmatter in a grey panel with a "raw" toggle, then the text, capped near 75 characters at 14px and line height 1.55.
- Markdown renders properly with a crate such as egui_commonmark: lists and inline code in the mono font, each dated note set off by a rule and a date label, item links walk to that item, external links open the browser. egui_commonmark renders paragraphs as separate labels, so a selection can't span them; a "Copy text" action covers that.
- Beside the text, "Still to land: n", in the order things can land.
- One global history with the milestone page: Alt+← back, Alt+→ forward. Back to an overview restores its scroll and selection. Ctrl+↓ / Ctrl+↑ open the next or previous item in queue order, replacing the history entry ("Queue (6 of 8)"). L shows the item in the queue. Esc closes a menu, find or the raw view before it goes back.
- States: an item with no dependencies shows one line; after F5 the page stays on the item, with its archived look if it was closed; a history entry for an item that's gone says so.

Done when every item in this roadmap opens on a page with all of the above.
