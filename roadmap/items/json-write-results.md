+++
id = "json-write-results"
title = "JSON results from the write commands, and check --json"
bucket = "next"
rank = 9
filed = 2026-11-25
depends_on = ["gui-read-interface"]
+++

The GUI planned in [gui-breakdown](../archive/gui-breakdown.md) edits through the CLI's write commands and shows check problems per row. [gui-read-interface](../archive/gui-read-interface.md) gives it a snapshot to read, but leaves the write commands and `check` out, as its 2026-11-12 note says. This item is that part.

It needs:
- **JSON results from the write commands** (`new`, `move`, `split`, `close`, `decide`): what changed, and which other items shifted rank. A refusal carries its rule tag and the ids it names, so the GUI can show the CLI's message word for word and link to the item that blocks the edit.
- **`check --json`**: every problem with its rule tag, and the item it belongs to, if any, so the GUI can mark rows and list the problems that belong to no row.

Both follow the `--json` contract gui-read-interface sets: one document on stdout whatever happens, with `schema` and `ok`, warnings in the document, and an exit code that agrees with `ok`. Scripts and agents get the same benefit.

Done when every write command and `check` take `--json`, the output is documented under the same schema version, and tests fail when its shape changes without the version moving. The GUI's editing ([gui-editing](gui-editing.md)) and its check panel ([gui-check-panel](gui-check-panel.md)) depend on it; its read-only view doesn't.
