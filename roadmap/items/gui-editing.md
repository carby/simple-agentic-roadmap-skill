+++
id = "gui-editing"
title = "Edit from the GUI: context menu, dialogs and refusals"
bucket = "next"
rank = 13
filed = 2026-11-25
depends_on = ["json-write-results", "close-body", "gui-item-page"]
+++

Editing from the GUI, after the read-only view, as the notes in [gui-breakdown](../archive/gui-breakdown.md) settle it. Every edit runs a CLI command and then reloads; the GUI never writes a file itself.

- **The context menu** (right-click, Shift+F10 or the Menu key) on a queue row or an item page shows every entry's command: move, rank above, split, close, "Open item page" (Enter), and on an item page "Show in queue" (L) and "Open milestone". Copy id is Ctrl+Shift+C, so Ctrl+C copies selected text.
- **Dialogs** show the command they will run. Later asks for its `blocked_on` question. Rank above picks from a list that greys out the items it can't go above. Split asks for the new id and title.
- **The close dialog** asks shipped or declined, `shipped_as`, and the reasoning, previews the paragraph the CLI will append with its date and outcome, and keeps Close disabled until the reasoning is filled in. It passes the reasoning through `--body` ([close-body](close-body.md)).
- While a command runs, edits are disabled and the status bar says so after 300 ms.
- **A refused edit** shows the CLI's refusal word for word with its rule tag, plus a link to the item that blocks it, from [json-write-results](json-write-results.md). The GUI never suggests a fix.

Done when every edit above works against this roadmap, and a refused move shows its refusal as described.
