+++
id = "gui-scaffold"
title = "The GUI's frame in gui/: open a repo's roadmap through the CLI"
bucket = "now"
rank = 17
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["monorepo-move", "gui-read-interface"]
+++

The first GUI item planned in [gui-breakdown](../archive/gui-breakdown.md): the Rust and egui program in gui/, before it draws any view. Everything after it builds on this frame.

It covers:
- the crate, its CI build, and the GUI's own tag prefix, as [monorepo-move](../archive/monorepo-move.md) sets up;
- launched from inside a repo, like gitk, it finds `roadmap/` and reads it through the snapshot from [gui-read-interface](../archive/gui-read-interface.md);
- a CLI without the JSON schema gets a banner and an empty window, never a guess;
- a CLI that fails or isn't found shows its output word for word;
- launched outside a repo, it offers to open another folder, and never runs `init`;
- F5 reloads; the GUI watches the files and overlays a "changed on disk" banner, but never redraws on its own;
- a status bar.

It never commits and keeps no roadmap state, as the 2026-11-12 and 2026-11-23 decisions say.

Done when the binary builds in CI, opens a repo's roadmap and shows the snapshot's items in a plain list, and every case above has a test or a documented manual check.
