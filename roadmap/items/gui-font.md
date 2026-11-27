+++
id = "gui-font"
title = "Choose the GUI's font and text size"
bucket = "next"
rank = 16
filed = 2026-11-26
depends_on = ["gui-scaffold"]

[refs]
files = ["gui/src/main.rs"]
+++

The GUI draws everything in egui's built-in fonts at one fixed size. That's hard to read on a high-density screen or from a distance, and it isn't what someone used to their own editor or terminal font expects. The mono font matters most: ids, ranks and inline code in the prose are set in it.

The choice lasts for one launch, because the GUI keeps no state outside roadmap/ ([decisions.md](../decisions.md), 2026-11-12). So:
- `--font <file or family>` and `--mono-font <...>` pick the proportional and the monospace font, with matching environment variables for a shell profile. A font that can't be loaded falls back to the built-in one, with a warning in the status bar.
- `--font-size <pt>` sets the base size, and Ctrl+= / Ctrl+- / Ctrl+0 zoom for the session, as egui's own zoom does.

Remembering the choice between runs would need a decision to allow GUI preferences outside roadmap/, and is out of scope here.

Done looks like: the flags, the environment variables and the zoom keys work; a font that fails to load falls back with a warning; gui/README.md documents them; and the parsing and the fallback are unit-tested.
