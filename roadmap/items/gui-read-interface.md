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

**2026-11-12:** the files stay Markdown, and the CLI emits JSON. Storing items as JSON was considered and rejected: prose would become single-line escaped strings, unreadable on GitHub and conflicting on every concurrent edit to a paragraph; `check --base`'s line-by-line append-only rule would stop making sense; and every install would need a migration. The GUI never parses Markdown anyway, because it reads only through the CLI.

The shape: one snapshot command (`list --json --all` or a dedicated `export --json`) that returns everything in a single consistent read, rather than `--json` on each read command, since a GUI reloads all at once and separate calls could see the files change between them. Machine-readable results from the write commands (what changed, what shifted, and refusals with their rule tag) and `check --json` are outside this item; [gui-breakdown](gui-breakdown.md) should split them into their own item, which GUI editing depends on and the read-only view doesn't.

**2026-11-12:** the contract for `--json`, which today's `list --json` doesn't keep:
1. With `--json`, stdout holds exactly one JSON document whatever happens: success, refusal, usage error or missing roadmap. Each carries `schema` and `ok`, and a failure carries `rule` and `message`.
2. `--json` is detected before the other arguments are parsed, so a bad argument still gets a JSON error. Today `list --json --bucket bogus` prints the plain-text usage error and exits 2.
3. Warnings, such as the version-pin mismatch every command prints to stderr, go into a `warnings` array in the document.
4. The exit code agrees with `ok`: 0 on success, non-zero otherwise.
5. It never prompts; a missing input is an error.
6. Stderr is only for real crashes, such as a stack trace from a bug.

This item also fixes a bug found on the way: `list --dir nope` (with or without `--json`) prints an empty result and exits 0, so a roadmap directory that doesn't exist reads as an empty roadmap. It should fail, and in JSON say so with `"ok": false`.
