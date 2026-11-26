+++
id = "check-missing-dir"
title = "check fails on a --dir that holds no roadmap"
bucket = "next"
rank = 14
filed = 2026-11-26
depends_on = ["gui-read-interface"]

[refs]
files = ["cli/src/cli.ts"]
+++

`roadmap check --dir nope` passes with "Roadmap OK: 0 open, 0 archived" and exits 0. A `--dir` that holds no roadmap reads as an empty one, so a mistyped `dir` in a CI job, or a roadmap moved without updating the workflow, turns the check green while checking nothing. `check` is the one command that exists to fail loudly, which makes this the worst place for the hole.

[gui-read-interface](../archive/gui-read-interface.md) closed it for `list` and `export`: a `--dir` without an `items/` directory is a `no-roadmap` error, exit 2. That change left `check` alone to stay in scope. `index`, `review` and the write commands have the same gap, and are worth deciding in the same change, though `init` must keep accepting a missing directory.

Done looks like: `check` and the other commands that read an existing roadmap refuse a `--dir` with no `items/`, with the same message and exit 2. A test covers each one, the CHANGELOG says so, and the rules note says it can turn a misconfigured CI job red.
