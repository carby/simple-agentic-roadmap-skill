# Decisions

Decisions that belong to no single item: conventions, architecture choices,
things this project doesn't do. A decision about one item goes in that item's
prose instead. **Search this file and `done.md` before proposing work.**

Record a decision with `npx --no -- roadmap decide`. Entries are appended
oldest first, and each entry is **append-only**: `check --base` fails on a
changed or removed line from the first entry on. To reverse a decision, record
a new one that says so.

## 2026-10-23: The roadmap sits above OpenSpec: it orders work and chains dependencies; OpenSpec specifies a single change

Roadmap items link to OpenSpec changes and specs through refs, and don't copy their detail. This rules out per-task breakdowns, specs or designs inside roadmap items. An item that needs those gets an OpenSpec change.

## 2026-11-12: A GUI is a separate program in its own repo that drives the CLI, the way gitk drives git

A graphical client for the roadmap reads and writes only through the roadmap CLI, as a subprocess, the way gitk calls git. The CLI keeps every rule, so the GUI can't drift from what check enforces; the files stay the only source of truth. The GUI adds no frontmatter fields and keeps no state outside roadmap/, and it never commits: it writes through CLI commands, reloads, and leaves git to the person, because several agents may be editing the same files. It lives in its own repo with its own release pipeline (the leaning is Rust, with egui), so this repo's work for it is the CLI's machine-readable interface. This rules out a GUI that parses or edits the Markdown files itself, a database or cache that holds roadmap state, and building the GUI inside this repo.
