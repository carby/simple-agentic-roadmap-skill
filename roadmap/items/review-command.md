+++
id = "review-command"
title = "A review command for upkeep that check deliberately skips"
bucket = "now"
rank = 6
filed = 2026-10-22
+++

`check` never compares against today's date, so it gives the same answer every day. As a result nothing flags a milestone that has passed but is still in roadmap.toml, or a Now item nobody has touched in months.

Done looks like: a separate `review` command, never run in CI, that may look at today's date and git history and lists passed milestones and stale items. The agent runs it when the user asks what to work on next.
