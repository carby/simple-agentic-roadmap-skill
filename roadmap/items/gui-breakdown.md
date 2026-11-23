+++
id = "gui-breakdown"
title = "Break the gitk-style GUI into implementation items"
bucket = "now"
rank = 1
filed = 2026-11-12
+++

A graphical client for the roadmap, modelled on gitk, is planned as a separate program in its own repo that drives the CLI (see [decisions.md](../decisions.md), 2026-11-12). It is too large to build in one go, so this item breaks it down before anything is built.

What the GUI is meant to do, as agreed so far:
- Launched from inside a repo, like gitk, it opens that repo's `roadmap/`. F5 reloads, and it never commits.
- Items are rows in queue order, with bucket separators. Dependency lanes run down the left, the way gitk draws commit lanes; this works because `check` already holds every dependency ahead of what waits on it. Milestones are rows at their date, and archived items can be toggled on.
- A detail pane shows the selected item's prose and frontmatter, with *Depends on* and *Needed by* links to walk the chain both up and down. A third pane could show the `git log` of the item's file.
- Edits (move, rank above, split, close with outcome and reasoning) go through a context menu that runs the CLI command, then reloads.
- The leaning is Rust with egui, shipped as prebuilt binaries per platform.

Done looks like:
- The GUI repo exists, with a roadmap of its own (`roadmap init`) holding the GUI's implementation items, read-only view first and editing after, each small enough to ship on its own.
- This roadmap holds the CLI-side items the GUI needs, starting with [gui-read-interface](gui-read-interface.md), refined or split to match.
- Each item's bucket was agreed with the product owner. Items, not task lists: per-task detail goes in an OpenSpec change, as the 2026-10-23 decision says.

**2026-11-12:** UX sketches of the GUI exist as a private design canvas the product owner holds. They raised one question that changes the CLI, now decided: `close` gains a `--body` flag, and the breakdown should file it as a CLI-side item in this roadmap.
- `close` appends the text to the item's prose as a dated paragraph before archiving it: `**<date>: shipped in <shipped_as>.** <text>`, or `**<date>: declined.** <text>`. The CLI writes the date and outcome, so they can't disagree with the frontmatter.
- `--body` is required on every close, shipped or declined, because the archive is append-only and the reasoning can't be added afterwards. This is a stricter rule: a script that calls `close` without it starts failing, so it needs an upgrade note, and probably a major version.
- `--body -` reads the text from stdin, so long prose doesn't depend on shell quoting.
- SKILL.md's close workflow, which today tells agents to edit the prose by hand before closing, changes to pass `--body` instead.

The GUI's close dialog then passes the reasoning through `--body`, and doesn't write prose itself. The canvas's other open questions (milestone rows, archived scope, reload, row tags, refused edits) belong to the GUI repo's items.

**2026-11-12:** the sketches' other open questions, decided by the product owner for the GUI repo's items:
- **Milestones get their own strip** along the right edge of the queue, ordered by date, with due-for lines drawn across from each item. The queue rows hold only items, and dates read top to bottom.
- **Show archived** shows in full the archived items that open items depend on, and folds the rest into rows that expand.
- **Reload** waits for F5, like gitk. The GUI watches the files and shows a "changed on disk" banner, but never redraws while someone reads or edits.
- **Gates and `blocked_on`** show as a small tag on the row, with the full text on hover and in the detail pane.
- **A refused edit** shows the CLI's refusal word for word, with its rule tag, plus a link to the item that blocks it. The GUI never suggests a fix.

**2026-11-12:** the GUI should also have a **milestone detail view**, opened from a milestone in the strip or the milestone view, showing everything that has to be completed for the milestone and what already has been:
- A graph that runs left to right into the milestone. It holds every item due for the milestone, plus every open item those wait on through `depends_on` that isn't due for it, marked as needed first, so the whole path to the date shows.
- Closed items due for the milestone stay on the graph: shipped ones as done, declined ones greyed out and not counted as progress.
- A progress line ("2 of 4 due items closed: 1 shipped, 1 declined"), the open items in the order they can land, and the closed ones with their outcome and `shipped_as`.

It reads only what [gui-read-interface](gui-read-interface.md) already lists: milestones, open and archived items with their `milestone` field, and dependencies in both directions. Archived items name their milestone, as done.md's Milestones list already uses.

**2026-11-12:** a second UX review of the sketches. Its fixes to the sketches are made on the canvas. These parts belong in the GUI repo's items:
- **States read the same everywhere.** A filled dot means ready, a hollow one waiting, and a dashed one in Later, in the queue, the detail pane, the milestone view and the milestone detail. `blocked_on` gets its own colour and a ⊘, because amber is kept for milestones.
- **The milestone strip has a lane per milestone**, every declared one in date order, passed ones included. A filled hexagon marks an item due for the milestone, and a hollow one an item that waits on it through `depends_on`. Waiting on a milestone is drawn too: in the strip, and on the right of the milestone detail graph.
- **One way to count a milestone's work**, everywhere: "2 due open, 2 needed first", next to what's closed.
- **A keymap, written down and complete:**
  - rows: ↑↓ or j/k;
  - views: Ctrl+1 for the queue, Ctrl+2 for milestones;
  - `/` or Ctrl+F to find;
  - Enter opens a milestone's detail from a card or its lane, and F filters the queue to its items;
  - Shift+F10 or the Menu key opens the context menu;
  - Space highlights the chain;
  - Alt+↑/↓ walk the chain, Alt+← or Esc go back;
  - F5 reloads;
  - Tab moves focus into the strip.
  
  Text shown on hover is always in the detail pane too, so nothing needs a mouse.
- **Scaling to 50+ items and many milestones:**
  - the id column sizes to the longest id, because ids are the key;
  - bucket separators collapse;
  - the lane gutter caps its width and bundles lanes past the cap;
  - the strip scrolls sideways past a few lanes;
  - timeline labels that collide stack;
  - the milestone cards become a list.
- **What the GUI needs from the CLI beyond [gui-read-interface](gui-read-interface.md):** JSON results from the write commands, with refusals carrying their rule tag, and `check --json`. Editing (the refused move) and the problems display (check results per row) depend on them, so the breakdown should file them as their own CLI-side item, ahead of the GUI's editing items.

**2026-11-23:** the main window, reworked for items with several dependencies and several milestones. This replaces the strip with a lane per milestone, which grew a column with every milestone declared:
- **Milestones in the queue are one fixed-width column of chips.** A filled ◆ marks the one milestone an item is due for (`milestone` holds a single id), and a hollow ◇ each milestone its `depends_on` names. They're sorted by date, and "+n" stands in past two, so the column never widens. The milestone view and the milestone detail stay the place for the overview.
- **The gutter stays the plain gitk graph.** Selecting an item highlights its row and nothing else, so a crowded chain never tangles the queue.
- **The selected item's dependencies are drawn in the detail pane** as a small left-to-right graph: what it depends on (items and milestones) → the item → what needs it (items, and the milestone it is due for). It shows direct links only, with "+n further up/down" to expand a level in place. Clicking a node selects it and redraws the graph around it, with a breadcrumb and Alt+← back. It uses the same visual language as the milestone detail.
- **Reached milestones**, since [milestone-reached](../archive/milestone-reached.md) shipped in 2.2.0, show as satisfied, like a shipped item: a ✓ chip that doesn't make an item wait. A milestone whose date has passed without being reached shows as late. The GUI may compare the date with today's, which the generated index never does. The snapshot in [gui-read-interface](gui-read-interface.md) has to carry `reached`.

**2026-11-23:** a UX review of the main window found that a long item couldn't be read: at 1280×800 the queue, the graph and the frontmatter left 3–4 lines for the text, and a bigger window made lines longer rather than adding more. The sketches are fixed. For the GUI repo's items:
- **The detail pane scrolls as one document.** A header with the id, title, state and dependency counts stays pinned. The dependency graph sizes to its rows (at most three a side, then "+n more") and can be collapsed, and the choice is remembered.
- **Reading typography:** 14px text at line height 1.55, with lines capped near 75 characters (about 640px).
- **Two splitters, as in gitk**, each remembered per repo as a fraction:

  | Splitter | Default | Minimums |
  |---|---|---|
  | Queue / panes below | queue 35% of the height | queue 5 rows; below 240px |
  | Detail / git log | 62 / 38 | detail 420px; log 280px |

  Z, or a double-click on a splitter, maximises the detail pane for reading; doing it again restores the layout.
- **What grows with the window:**
  - extra height goes to the panes below the queue, which is capped at its own rows;
  - extra width goes to the detail pane until the text reaches its cap, then to the git log;
  - under about 1100px wide, the git log folds into a History tab next to Item and Raw frontmatter.
- **Markdown renders properly:**
  - lists and inline code in the mono font;
  - each dated note set off by a thin rule and a date label;
  - links to other items walk to them like a graph node, with Back and Forward on Alt+←/→, and external links open the browser;
  - the text can be selected and copied (egui needs a crate such as egui_commonmark).
- **The git log diffs word by word** (`--word-diff`), wrapped. A paragraph is one long line, so a line diff would mark all of it as changed.
- **Walking to another item scrolls to the top; Back restores the scroll position.** The "changed on disk" banner overlays the pane instead of pushing the text down.

**2026-11-23:** the product owner dropped the git log pane: this is a roadmap tool, not a git browser. That reverses the earlier notes' git log pane, its History tab and the word diff. Below the queue, the item now has the whole width:
- **A pinned header across the top** carries the id, title and state.
- **Under it, two columns:**
  - on the left, next to the queue's gutter, the dependency graph and the frontmatter, at least 360px and about 600px by default;
  - on the right, the text, at least 420px, scrolling on its own and capped near 75 characters, so the graph stays in view while you read.
- **A wider window gives the graph column the extra width**, so it can show a second level of dependencies each way, instead of making the text lines longer.
- **Below about 800px wide the columns stack:** the graph on top, collapsed by default, then the text.
- **Only the splitter between the queue and the item remains.** Z, or a double-click on it, maximises the item pane.
- **When check reports problems, a Check panel opens on the right**, listing the ones that belong to no row, and closes again when they're fixed.
