+++
id = "supersedes"
title = "Link a re-proposed item to the declined item it supersedes"
bucket = "now"
rank = 3
filed = 2026-10-22
+++

The rules say a declined idea isn't proposed again without new evidence, and that ids are never reused. Nothing links the new item to the declined one, so the next reader can't see that it is a second attempt, or check what evidence changed.

Done looks like: a `supersedes = "old-id"` field and `new --supersedes`. `check` requires it to name an archived item, and the index shows the link.
