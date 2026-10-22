+++
id = "review-command"
title = "A review command for upkeep that check deliberately skips"
filed = 2026-10-22
closed = 2026-10-22
outcome = "shipped"
shipped_as = "#12"
+++

`check` never compares against today's date, so it gives the same answer every day. As a result nothing flags a milestone that has passed but is still in roadmap.toml, or a Now item nobody has touched in months.

Done looks like: a separate `review` command, never run in CI, that may look at today's date and git history and lists passed milestones and stale items. The agent runs it when the user asks what to work on next.

**Outcome:** shipped. `review [--days 60] [--date]` lists two things. The first is milestones dated before today, with the open items due for or waiting on each. The second is Now and Next items untouched for `--days`. Later is left out because those items are parked on a decision on purpose. An item's last touch is the latest of `filed`, `updated` and the last commit to its file, all read from one `git log`. It uses the *author* date: this repo's own history showed that a rebase or rebase-merge resets committer dates to the day it runs, which made every item look freshly touched. Outside git, only the frontmatter dates count, and review says so. It always exits 0, so nobody is tempted to put a date-dependent command in CI. Plain `/roadmap` now runs it too.
