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
