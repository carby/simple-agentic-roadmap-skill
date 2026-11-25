+++
id = "gui-breakdown"
title = "Break the gitk-style GUI into implementation items"
bucket = "now"
rank = 2
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
- **One pinned header row across the top.** It replaces the earlier tab strip, which cost a second row of chrome. It carries:
  - the id and title;
  - why the item waits ("waiting on 2 items · ◇ gui-preview · gate");
  - the milestone it's due for (◆ v3 · 02-01);
  - its bucket and rank, and when its file last changed ("changed 11 d ago"), since spotting stale items is part of the job;
  - a ⤢ button for maximise.
- **Under it, two columns:**
  - on the left, a column of 420–680px: the frontmatter in its own panel with a grey background, pinned at the top, and the text under it, scrolling on its own with lines capped near 75 characters;
  - on the right, the dependency graph alone, at least 360px and taking all the remaining width and the full height of the pane. It stays in view while you read.
  
  The GUI draws the frontmatter and the text before the graph, so Tab, screen readers and the stacked layout follow the order on screen. In egui, focus order is drawing order.
- **The graph lists every direct dependency each way.** With the column's full height to itself, it no longer stops at three a side with "+n more", as the earlier note had it; past the column's height, the column scrolls.
- **A wider window gives the graph column the extra width**, so it can show a second level of dependencies each way, instead of making the text lines longer.
- **The graph's centre node is just the item's id**, since the header carries its state. It keeps a fixed position, and further levels grow outward from it, so opening a level or walking the graph never makes it jump.
- **The frontmatter block has a "raw" toggle** that shows the TOML as written, in place of a separate Raw frontmatter tab.
- **Below about 800px wide the columns stack:** the frontmatter, then the graph collapsed, then the text. Whether the graph is collapsed is remembered once per layout, wide or stacked, so collapsing it in one doesn't change the other.
- **Only the splitter between the queue and the item remains.** Z, ⤢ or a double-click on it maximises the item pane: the queue hides, and both columns keep their place, with the graph still collapsible. Doing it again restores the layout.
- **When check reports problems, a Check panel opens on the right**, listing the ones that belong to no row, and closes again when they're fixed.

**2026-11-23:** the product owner replaced the pane under the queue with a page per item, after a UX review of the plan. The Queue tab now works like the Milestones tab: an overview you open details from. This supersedes the earlier notes' detail pane: its header row, columns, splitter, Z maximise and mini-graph, and the rule that the graph lists every direct dependency.
- **The queue fills the window.** A click or ↑↓ selects a row, and the context menu and Space act on the selection. A two-line strip at the bottom shows the selected item:
  - line 1: state, id, title, the ◆ milestone, bucket and rank, and "changed N d ago";
  - line 2: the full reason it waits, the gate or `blocked_on` text, and the first sentence of the text.
  
  Hover text stays reachable without a mouse. Enter or a double-click opens the item's page, and a milestone chip opens the milestone's page.
- **The item page mirrors the milestone detail.** The toolbar carries a breadcrumb. A header stays pinned while the page scrolls as one document. Under it:
  - a left-to-right graph: what it depends on → the item → what needs it, with the milestone it is due for;
  - a collapsed legend;
  - the grey frontmatter panel and the text, capped near 75 characters;
  - beside the text, "Still to land first", in the order things can land.
- **The graph is capped so the text stays readable.** It shows at most three cards a column, with "+n more in this level" past that, and G collapses it to one line ("↑ 3 · ↓ 2 · ◆ v3"). At 1280×800 that leaves about 11 lines of text in view, or about 24 with the graph collapsed.
- **Levels are fixed, not "as many as fit".** One level each way by default. The ends of the graph count what is cut off, without duplicates, and say what it is: "← +3 further up (2 open, 1 ◇)". A click, or `[` / `]`, adds a level up or down, and `{` / `}` remove one. The number of open levels is kept in the history entry. A wider window only adds margin; the centre card never moves.
- **Milestones are end points in an item's graph,** so a milestone never pulls in everything due for it; clicking one opens its page. An item reached by several paths sits at its longest-path level, so edges always run left to right. Closed upstream items fold into one "✓ n done" card that unfolds on a click; Show archived, which stays a queue toggle, sets that default.
- **Both detail pages share one language:**
  - the breadcrumb;
  - the header: glyph, id, title, a status line, and one summary line in the agreed counting phrase ("2 due open, 2 needed first", "2 open dependencies, 1 needed first");
  - 180×64 cards on a 240px pitch, and a centre node spanning the rows;
  - the edge styles, the collapsed legend, and section headings written "Label: count".
  
  Only the progress bar (milestone page) and the frontmatter and text (item page) are their own. The milestone page follows the same cap: its closed items fold into one "✓ n closed" card.
- **Navigation and keys:**
  - clicking a card in either graph opens that node's page, and links in an item's text do the same;
  - one global history covers both page kinds, with Alt+← back and Alt+→ forward;
  - Ctrl+1 and Ctrl+2 push the overview as a new entry, and the tab toggle highlights the root of the current trail;
  - the breadcrumb shows its root plus the last three crumbs, and jumping to one drops the forward history;
  - back to an overview restores its scroll position and selection;
  - Ctrl+↓ / Ctrl+↑ on an item page open the next or previous item in queue order, replacing the history entry, so Back returns to the queue in one step; the breadcrumb shows "Queue (6 of 8)";
  - Tab moves into the graph, arrows move between cards with a visible focus ring, and Enter opens a card or expands a "+n" label; this retires Alt+↑/↓;
  - Esc first closes a menu, find, a dialog or the raw view, and only then goes back;
  - L shows the current item in the queue.
- **Check problems:** an item's own problems show as a red band between its header and its graph. While check reports problems, the queue gets a Check panel on the right (about 300px) that lists all of them, including those that belong to no row; "check: n problems" in the status bar focuses it from anywhere.
- **States the pages must cover:**
  - an item with no dependencies shows one line ("No dependencies; nothing waits on it");
  - the context menu on the item page acts on the item shown;
  - after an edit and F5 the page stays on the item, and switches to its archived look if the item was closed;
  - a history entry for an item that no longer exists says so, with Back available;
  - the "changed on disk" banner overlays the page.

**2026-11-23:** the product owner decided to make this repo a monorepo instead of starting a GUI repo (see [decisions.md](../decisions.md), 2026-11-23). The current codebase moves down into cli/, the GUI goes in gui/, and one roadmap/ stays at the top for both. That changes what done looks like: the GUI's implementation items go in this roadmap, not in a roadmap of the GUI's own, and they can `depends_on` the CLI-side items directly. Where the earlier notes say "the GUI repo's items", read "the GUI's items in this roadmap".

The move into cli/ is the first item to file, ahead of any GUI code. It has to keep working what the root layout supports today:
- the GitHub Action, whose `action.yml` users reach as `uses: <owner>/<repo>@v2` at the root, so moving it breaks them unless a root `action.yml` stays or the change ships as a major version;
- the npm package and its trusted publishing workflow, which run from cli/;
- the release tags: the GUI needs its own tag prefix, so the `v` tags and the floating `v2` stay the CLI's;
- CLAUDE.md, the `npm run dogfood` skill links, and the `node bin/roadmap.js check` command it documents;
- CI, and the `refs` of open items that point at src/ paths, which `check` validates.

**2026-11-23:** a UX review of the whole canvas, with every fix applied to the sketches. For the GUI's items:
- **One visual language.** A dashed card always means Later. An item that is needed first but not due for the milestone is a tinted card with a "needed first" tag. A file changed on disk gets a yellow "changed" tag, not a ● (which means ready) or amber (which is for milestones). Every count uses one phrase, "N due open, N needed first · N closed", and both detail pages head their list "Still to land: n".
- **The preview strip never cuts the reason an item waits.** The sentence from the item's text shortens first, then the reason, with the full line as a tooltip and on the item page.
- **Edits go through one flow.**
  - Later asks for its `blocked_on` question, Rank above picks from a list that greys out the items it can't go above, and Split asks for the new id and title. Each dialog shows its command.
  - While a command runs, edits are disabled and the status bar says so after 300 ms.
  - A CLI that fails or isn't found shows its output word for word, like a refusal.
  - A CLI without the JSON schema gets a banner and an empty window, never a guess.
  - Launched outside a repo, the GUI offers to open another folder, and never runs `init`.
- **The close dialog previews the paragraph the CLI will append**, with the date and outcome the CLI writes, and keeps Close disabled until the reasoning is filled in.
- **The context menu** shows every entry's command and offers "Open item page" (Enter). On an item page it acts on the item shown, and adds "Show in queue" (L) and "Open milestone" for an item due for one.
- **States the GUI must draw:**
  - a ✓ chip for a reached milestone, and a red "late N d" chip for one whose date has passed without being reached;
  - the queue filtered to a milestone (F), with a bar that Esc clears;
  - find results, and no matches;
  - an item with no dependencies;
  - closed upstream items folded into one card;
  - an item page after its item is closed;
  - a history entry for an item that's gone.
- **Keys:**
  - Copy id is Ctrl+Shift+C, so Ctrl+C copies selected text;
  - `[ ] { }` need AltGr on Nordic and German layouts, so Enter on the "+n further" end card is the main way to add a level, with a "− fewer" end card to take one away;
  - the selected queue row carries the focus ring;
  - Esc on an overview does nothing.
- **Hard parts in egui, as risks for the GUI's items:**
  - moving between graph cards with the arrow keys needs its own key handling, plus AccessKit nodes in reading order, since egui doesn't move focus by arrow keys;
  - egui_commonmark renders paragraphs as separate labels, so a text selection can't span them: accept that, or offer "Copy text";
  - the strip's two-colour line with an ellipsis needs a hand-built `LayoutJob`.
