+++
id = "gui-read-interface"
title = "A versioned JSON read interface a GUI can drive"
bucket = "now"
rank = 14
filed = 2026-11-12
depends_on = ["gui-breakdown"]

[refs]
files = ["src/commands.ts"]
+++

A GUI that drives the CLI as a subprocess, as [gui-breakdown](gui-breakdown.md) plans, has to read everything it shows through the CLI. Today `roadmap list --json` covers only the open items, and only their frontmatter.

The GUI needs, from one command or a few:
- the open and the archived items, with their frontmatter and prose,
- the declared milestones,
- each item's dependencies in both directions: what it depends on, and what depends on it,
- a schema version, so a GUI can tell which CLI it is talking to and refuse one it doesn't understand.

Scripts and agents get the same benefit, so this is worth having even if the GUI never ships.

Done looks like: the output is documented, carries a schema version, and is covered by tests that fail when its shape changes without the version moving. The breakdown may refine or split this item before it is built.
