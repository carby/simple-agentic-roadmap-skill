---
tags: [roadmap-skill, usage]
aliases: [/roadmap]
---

# Slash commands

Installing the skill adds one slash command, `/roadmap`. What you type after
it picks the action:

| Command | What it does |
|---|---|
| `/roadmap` | Shows what's in Now, Next and Later, and suggests what to pick up. |
| `/roadmap init` | Sets up `roadmap/` in this repo. (For CI, see [CI](ci.md).) |
| `/roadmap new <what>` | Files a new item. The agent suggests a bucket, based on what the item depends on, and **you confirm it**. Then the agent writes the argument and runs the check. |
| `/roadmap move <id> <bucket>` | Reprioritises an item, e.g. from Next into Now when planning the next sprint. |
| `/roadmap split <id>` | Splits an item that turned out to be two pieces of work. The new part copies its place in the queue and its dependencies, and the original keeps the rest. |
| `/roadmap move <id> <rank>` | Re-ranks an item within its bucket, e.g. to the top of Now. `move <id> above <other>` places it directly above another item. |
| `/roadmap close <id>` | Archives finished or declined work, with the reason, and lists it in `done.md`. Do it in the branch that ships the code. |
| `/roadmap decide <decision>` | Logs a decision that belongs to no single item in `decisions.md`, with its reasoning, e.g. `/roadmap decide we never track who is working on what`. |
| `/roadmap review` | Lists milestones that have passed while open items still name them, and Now/Next items nobody has touched for 60 days, with a suggested fix for each. Plain `/roadmap` runs it too. |
| `/roadmap check` | Validates the roadmap and fixes what it can, e.g. a stale index. |
| `/roadmap <question>` | Answers from the roadmap, `done.md` and `decisions.md`, e.g. `/roadmap has anyone tried caching tokens?` |

You don't have to use the slash command. The agent also loads the skill on
its own when you ask what to work on next, or when you propose a cleanup. In
that case it checks `done.md` and `decisions.md` first, in case the idea was
already tried and declined, or ruled out.

---

Related: [Concepts](concepts.md) · [Checking your roadmap](checking.md) · [Home](index.md)
