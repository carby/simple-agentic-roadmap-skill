+++
id = "close-body"
title = "close requires --body and appends the outcome and reasoning itself"
bucket = "next"
rank = 10
filed = 2026-11-25
+++

Decided in [gui-breakdown](gui-breakdown.md) (2026-11-12): `close` gains a `--body` flag, and it is required. Today an agent has to edit an item's prose by hand before closing it, because the archive is append-only and the reasoning can't be added afterwards. Nothing makes it do so, and the GUI's close dialog would have to write the prose itself.

What changes:
- `close` appends the text to the item's prose as a dated paragraph before archiving it: `**<date>: shipped in <shipped_as>.** <text>`, or `**<date>: declined.** <text>`. The CLI writes the date and outcome, so they can't disagree with the frontmatter.
- `--body` is required on every close, shipped or declined.
- `--body -` reads the text from stdin, so long prose doesn't depend on shell quoting.
- SKILL.md's close workflow passes `--body` instead of telling agents to edit the prose by hand.

A script that calls `close` without `--body` starts failing, so this ships as a major version (3.0.0) with an upgrade note in the CHANGELOG.

Done when `close` refuses without `--body`, writes the paragraph as above, reads stdin for `-`, SKILL.md and conventions.md say so, and tests cover each.
