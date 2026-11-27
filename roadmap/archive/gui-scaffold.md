+++
id = "gui-scaffold"
title = "The GUI's frame in gui/: open a repo's roadmap through the CLI"
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["monorepo-move", "gui-read-interface"]
closed = 2026-11-27
outcome = "shipped"
shipped_as = "#44"
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

**2026-11-26:** built in gui/ as `roadmap-gui`: eframe 0.37 with glow rather than wgpu, which is lighter and runs on WSLg. Rust is pinned in gui/rust-toolchain.toml, and a `gui` CI job formats, lints, builds and tests it on Linux. The work settled some details:
- **Finding the CLI:** `--cli` or `ROADMAP_CLI`; else `roadmap` on PATH, which hands off to the copy the repo pins; else `npx --no -- roadmap`.
- **A CLI without the schema:** any stdout that isn't one schema-1 document, whether from an old CLI, npx without the package, a crash, or a timeout after 30 s, gets one banner. The banner shows the command, the exit status, stdout and stderr word for word, and keeps the last good snapshot or an empty window. No second probe decides which case it was.
- **State:** the state lives in a pure state machine (gui/src/state.rs) that the later views extend. It keeps the snapshot through a reload, drops stale loads, and holds the selection by id. Its only effect that runs the CLI is `export`.
- **Finding the roadmap:** the first `roadmap/` walking up from the start folder, stopping at a `.git` directory or file. Open folder… takes a typed path, plus Browse… where an xdg portal answers. WSLg may have none.
- **Testing:** the frame is unit-tested without a window: the locator, the CLI runner against fake CLIs, the state machine, the watcher, and the snapshot structs against the CLI's recorded schema. In CI, an export through the real CLI is tested too. gui/README.md lists six manual checks of the drawing.
- **Windows and macOS** are left to [gui-release](../items/gui-release.md), with the known issues: `.cmd` quoting, `CREATE_NO_WINDOW`, and shell-words being POSIX-only.
