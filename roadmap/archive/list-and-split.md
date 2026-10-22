+++
id = "list-and-split"
title = "list and split commands"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#13"

[refs]
files = ["scripts/roadmap.py"]
+++

Two small commands the workflows already imply:
- `list [--bucket now] [--json]` (or `show <id>`) gives the agent the roadmap's state without reading README.md, and makes the roadmap easy to script against.
- `split <id> <new-id>...` copies the frontmatter and dependencies into new items. Hard rule 4 says an item that turned out to be two pieces of work is split, but there is no tool for it.

**Outcome:** shipped.
- `list [--bucket] [--json]` prints the open items in queue order, with what holds each one: blocked on, gate, due for, depends on. `--json` gives each item's frontmatter and path, with dates as ISO strings. There's no `show`: the item file is the detail view.
- `split <id> <new-id> --title` adds the other part directly below the original. It copies the bucket, gate, blocked_on, depends_on, milestone and refs, and the items under it shift down a rank. The original keeps its id, its dependents and its links, so splitting is just narrowing its prose and never needs a close. Both are the product owner's calls. `supersedes` isn't copied, since only one attempt retries a declined idea.
