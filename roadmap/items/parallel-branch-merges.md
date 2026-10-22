+++
id = "parallel-branch-merges"
title = "Parallel branches collide on ranks and the generated indexes"
bucket = "now"
rank = 1
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

The conventions promise that two agents editing different items never conflict. That holds for the item files, but not for what the commands write around them:
- `new` gives an item the next free rank in its bucket. Two branches that each file an item in the same bucket give both the same rank, and `check` fails with `[rank]` once both merge.
- `new`, `move` and `close` rewrite the index in README.md and done.md. Two branches that each close an item produce a git conflict in done.md.

Done looks like: a documented rule for a conflict in a generated block (take either side, then run `index`), an optional git merge driver (`roadmap.py merge-driver` plus a line in `.gitattributes`) that does that automatically, and a way out of rank collisions, either `index --renumber` or allowing equal ranks with `filed` and id as the tie-break.
