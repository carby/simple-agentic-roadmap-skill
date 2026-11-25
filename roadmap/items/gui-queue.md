+++
id = "gui-queue"
title = "The GUI's Queue tab: rows, lanes, milestone chips and the preview strip"
bucket = "now"
rank = 18
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-scaffold"]
+++

The Queue tab (Ctrl+1), the GUI's overview, as the notes in [gui-breakdown](../archive/gui-breakdown.md) settle it. The queue fills the window.

- Items are rows in queue order, with bucket separators that collapse.
- The gutter is the plain gitk graph of dependency lanes; it caps its width and bundles lanes past the cap. Selecting an item highlights its row and nothing else.
- The id column sizes to the longest id.
- States read the same everywhere: a filled dot is ready, a hollow one waiting, a dashed one Later; `blocked_on` gets its own colour and a ⊘.
- One fixed-width column of milestone chips: a filled ◆ for each milestone the item is due for (it can be several, #40), a hollow ◇ for each one its `depends_on` names, a ✓ for a reached one, a red "late N d" for one passed and not reached. Sorted by date, with "+n" past two.
- Gates and `blocked_on` show as a small tag; a file changed on disk gets a yellow "changed" tag.
- A two-line preview strip shows the selected item. It never cuts the reason the item waits: the sentence from the text shortens first. The two-colour line with an ellipsis needs a hand-built `LayoutJob`.
- ↑↓ or j/k select; `/` or Ctrl+F find, with a no-matches state; F filters to a milestone, with a bar Esc clears; Show archived shows in full the archived items open items depend on, and folds the rest.
- Hover text is always reachable without a mouse.

Done when the tab draws a real roadmap, including this one, with every state above, and the keys work.
