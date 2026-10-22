+++
id = "rerank-within-bucket"
title = "Re-rank an item within its bucket"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#7"

[refs]
files = ["scripts/roadmap.py"]
+++

`move` refuses when the item is already in the target bucket. Raising an item from rank 4 to rank 1 in Now means renumbering several files by hand.

Done looks like: `move <id> --rank 1` or `--above <id>`, shifting the others down and refusing a result that breaks `depends`, as `move` already does between buckets.

**Shipped:** `move <id> --rank <n>` and `move <id> --above <other>`. `--bucket` is now optional: `--above` takes the other item's bucket, and otherwise the item stays in its own. Within a bucket only the items between the old and new place shift, up or down a rank, so a re-rank touches as few files as it can and leaves gaps in the ranks alone. Across buckets, everything from the new rank down shifts, as before. `--above` moving down lands on the rank just above the other item, because that one shifts up into the vacated slot. The `_refuse_if_breaking` guard that `move` already used between buckets now covers re-ranks too, so a rank above an item's dependency is refused and nothing is written.
