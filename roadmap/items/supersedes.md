+++
id = "supersedes"
title = "Link a re-proposed item to the declined item it supersedes"
bucket = "now"
rank = 3
filed = 2026-10-22
+++

The rules say a declined idea isn't proposed again without new evidence, and that ids are never reused. Nothing links the new item to the declined one, so the next reader can't see that it is a second attempt, or check what evidence changed.

Done looks like: a `supersedes = "old-id"` field and `new --supersedes`. `check` requires it to name an archived item, and the index shows the link.

**Outcome:** shipped. `new --supersedes <id>` writes `supersedes = "<id>"`, and a new `[supersedes]` rule requires it to name a declined archived item. The product owner chose declined-only: follow-up work on something that shipped already has `depends_on`. An archived item keeps the field as history and isn't checked against it. The link shows both ways: the index shows "Supersedes" on the new item, and done.md shows "superseded by" on the declined one. done.md is generated, so the archive stays append-only. `new` refuses a bad target before writing anything, as it does for a bad dependency.
