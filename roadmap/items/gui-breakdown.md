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
