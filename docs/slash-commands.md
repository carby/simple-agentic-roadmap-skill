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
| `/roadmap close <id>` | Archives finished or declined work, with the reason, and lists it in `done.md`. Do it in the branch that ships the code. |
| `/roadmap check` | Validates the roadmap and fixes what it can, e.g. a stale index. |
| `/roadmap <question>` | Answers from the roadmap and `done.md`, e.g. `/roadmap has anyone tried caching tokens?` |

You don't have to use the slash command. The agent also loads the skill on
its own when you ask what to work on next, or when you propose a cleanup. In
that case it checks `done.md` first, in case the idea was already tried and
declined.

---

Related: [Concepts](concepts.md) · [Checking your roadmap](checking.md) · [Home](index.md)
