+++
id = "list-and-split"
title = "list and split commands"
bucket = "now"
rank = 7
filed = 2026-10-22

[refs]
files = ["scripts/roadmap.py"]
+++

Two small commands the workflows already imply:
- `list [--bucket now] [--json]` (or `show <id>`) gives the agent the roadmap's state without reading README.md, and makes the roadmap easy to script against.
- `split <id> <new-id>...` copies the frontmatter and dependencies into new items. Hard rule 4 says an item that turned out to be two pieces of work is split, but there is no tool for it.
