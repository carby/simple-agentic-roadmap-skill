+++
id = "parallel-branch-merges"
title = "Parallel branches collide on ranks and the generated indexes"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#6"

[refs]
files = ["scripts/roadmap.py"]
+++

The conventions promise that two agents editing different items never conflict. That holds for the item files, but not for what the commands write around them:
- `new` gives an item the next free rank in its bucket. Two branches that each file an item in the same bucket give both the same rank, and `check` fails with `[rank]` once both merge.
- `new`, `move` and `close` rewrite the index in README.md and done.md. Two branches that each close an item produce a git conflict in done.md.

Done looks like: a documented rule for a conflict in a generated block (take either side, then run `index`), an optional git merge driver (`roadmap.py merge-driver` plus a line in `.gitattributes`) that does that automatically, and a way out of rank collisions, either `index --renumber` or allowing equal ranks with `filed` and id as the tie-break.

**2026-10-22:** shipped in #6. Ranks stay unique within a bucket, and `index --renumber` resolves a collision: it numbers each bucket in its current order, with tied items keeping their dependencies first, then oldest first. `merge-driver` keeps this branch's generated block and lets git merge the text around it. It doesn't render the block itself, because git doesn't guarantee `items/` is merged by the time the driver runs, so `index` still follows the merge. Still open: if one branch closes an item that another branch's item links to, `close` rewrites that link, and the rename/modify conflict in the item file is real.
