+++
id = "rerank-within-bucket"
title = "Re-rank an item within its bucket"
bucket = "now"
rank = 4
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

`move` refuses when the item is already in the target bucket. Raising an item from rank 4 to rank 1 in Now means renumbering several files by hand.

Done looks like: `move <id> --rank 1` or `--above <id>`, shifting the others down and refusing a result that breaks `depends`, as `move` already does between buckets.
