+++
id = "reach-command"
title = "A reach command that marks a milestone reached"
bucket = "later"
rank = 6
filed = 2026-11-13
blocked_on = "whether a one-line hand edit of roadmap.toml is enough, or agents need a command like close"
depends_on = ["milestone-reached"]
+++

Marking a milestone reached is a hand edit of roadmap.toml (see [milestone-reached](../archive/milestone-reached.md)). Items get `close`, which writes the change and checks it; milestones have no command. A `roadmap reach <id> [--date D]` would add `reached` to the milestone's entry without reformatting the file, refuse while open items are due for it, and run `index` and `check`. File the decision after milestone-reached has been used for a while.
