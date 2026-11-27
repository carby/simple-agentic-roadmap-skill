+++
id = "gui-queue"
title = "The GUI's Queue tab: rows, lanes, milestone chips and the preview strip"
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-scaffold"]
closed = 2026-11-27
outcome = "shipped"
shipped_as = "#48"
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

**2026-11-27:** built in #48. What the work settled, for the items after it:
- **The queue as data:** `gui/src/queue.rs` builds the rows, tags, chips and the strip's text from the snapshot, and `gui/src/lanes.rs` lays out the lanes. Both are pure and tested; `gui/src/ui/` only draws. gui-item-page and gui-milestones reuse `queue::strip`, `queue::chips` and the glyphs in `ui/gutter.rs`.
- **Lanes:** the gutter is capped at eight lanes, and anything beyond is bundled into the last one, drawn double. A dependency that sits below what needs it (an archived item that depends on an open one, or a roadmap that fails check) becomes a ↑ stub, never a crash. An archived dependency hidden while Show archived is off isn't flagged at all. Only an *open* one hidden by a collapse or the filter gets a `↑id` tag.
- **Show archived** lists the linked items oldest first, so a dependency sits above what needs it. Unfolding lists every archived item in that order.
- **Find** highlights rows and never hides them, so the lanes stay true. A match inside a collapsed bucket or the fold is counted, and Enter or F3 opens what hides it. **F** filters to the earliest unreached milestone the selection is due for, with a picker when it has none. "Needed first" is the transitive set of open dependencies.
- **Keys:** the rows aren't focusable, because egui would move focus with the arrow keys as well as the selection. The queue draws its own focus ring, and keys are read before anything draws. Bucket separators and the fold take the selection and toggle with Enter or Space.
- **Fonts:** egui's default fonts have no ✓ of any kind, so a reached milestone shows √. Proportional text falls back to the monospace font for the arrows, ◆ ◇ ⊘ and ⋯. A test fails on any drawn glyph the default fonts lack. [gui-font](../items/gui-font.md) has to keep that test passing with the fonts people choose.
- **Theme:** light only, with every colour in `gui/src/ui/palette.rs`.
- **Left for the pages:** Enter or a double-click opening an item, a chip opening its milestone, Ctrl+2, Space and the context menu.
- **Testing:** `gui/tests/fixtures/queue-states/` is a roadmap that passes `check` and holds every state the tab draws. The real-CLI test builds the queue from it and from this repo's roadmap. The manual checks in gui/README.md run against it too.
