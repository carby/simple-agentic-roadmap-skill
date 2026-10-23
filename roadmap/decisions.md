# Decisions

Decisions that belong to no single item: conventions, architecture choices,
things this project doesn't do. A decision about one item goes in that item's
prose instead. **Search this file and `done.md` before proposing work.**

Record a decision with `roadmap.py decide`. Entries are appended oldest first,
and the file is **append-only**: `check --base` fails on a changed or removed
line. To reverse a decision, record a new one that says so.

## 2026-10-23: The roadmap sits above OpenSpec: it orders work and chains dependencies; OpenSpec specifies a single change

Roadmap items link to OpenSpec changes and specs through refs, and don't copy their detail. This rules out per-task breakdowns, specs or designs inside roadmap items. An item that needs those gets an OpenSpec change.
