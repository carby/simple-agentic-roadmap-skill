# Decisions

Decisions that belong to no single item: conventions, architecture choices,
things this project doesn't do. A decision about one item goes in that item's
prose instead. **Search this file and `done.md` before proposing work.**

Record a decision with `roadmap.py decide`. Entries are appended oldest first,
and the file is **append-only**: `check --base` fails on a changed or removed
line. To reverse a decision, record a new one that says so.

## 2026-09-01: Tokens never leave the auth service

Other services ask it to sign. Rules out a shared token cache.
