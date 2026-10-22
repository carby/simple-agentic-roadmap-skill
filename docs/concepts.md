---
tags: [roadmap-skill, concepts]
aliases: [What it is, Buckets]
---

# Concepts

What the roadmap is, and what it isn't.

- **Items:** each item is one Markdown file under `roadmap/items/`. A few
  header fields give its bucket, rank and dates, and the rest is plain prose.
- **Buckets:** items are sorted by priority, not by progress:
  - **Now:** the top priority, like a planned sprint. It doesn't mean
    "someone is working on it right now".
  - **Next:** ready, and queued to follow.
  - **Later:** waiting on a decision nobody has made yet.

  You decide the bucket. The agent suggests one, and it usually suggests what
  you'd pick.
- **A picture of it:** `roadmap/README.md` lists the open items. Once items
  depend on each other or on milestones, a generated Mermaid diagram above the
  list shows it, and GitHub draws it in place: one box per bucket, with an
  arrow from each item to the items that depend on it.
- **You are the product owner:** the agent never adds, moves or closes items
  on its own. When it spots something worth tracking, it pitches the item to
  you and files it only if you agree.
- **No work-in-progress tracking:** the roadmap doesn't record who is working
  on what, because that would take a commit every time work starts or stops.
- **Closed work:** an item is closed in the same branch as its code, so it
  moves to `roadmap/archive/` and gets a line in `done.md` when that code
  merges. Declined ideas are archived too, with the reasoning.
- **Decisions:** a decision that belongs to no single item, such as a
  convention or something the project doesn't do, is logged in
  `roadmap/decisions.md`. Like the archive, it is only ever added to.
- **Checking:** one dependency-free script, `check`, catches mistakes in CI.
  See [Checking your roadmap](checking.md).

An item can list the items that must come first (`depends_on`), and `check`
keeps them in order. Milestones are named dates declared in `roadmap.toml` (see
[Configuration](configuration.md)): an item can be due for one (`milestone`) or
wait on one (`depends_on`), and `check` keeps those in order too, without ever
comparing against today's date.

There are deliberately **no** epics, estimates or Gantt scheduling. Those may
come later (see the skill's own [`roadmap/`](../roadmap/)), but for now the
roadmap stays simple enough to read in one sitting and edit by hand.

---

Related: [Slash commands](slash-commands.md) · [Rule tags](rule-tags.md) · [Home](index.md)
