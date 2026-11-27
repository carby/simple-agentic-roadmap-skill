# roadmap GUI

A graphical client for the roadmap, modelled on gitk. Launched from inside a
repo, it shows that repo's `roadmap/`. It reads and writes only through the
`roadmap` CLI in [`../cli/`](../cli/README.md), keeps no state of its own
between runs, and never commits.

This is the frame (the roadmap's `gui-scaffold` item). It finds the
roadmap, reads it through `roadmap export` (see
[JSON output](../cli/docs/json.md)), and shows the open items in a plain list
with a status bar. The real views come next: the queue, the dependency graph,
item and milestone pages, then editing. They are planned in the repo's
[roadmap](../roadmap/README.md) for the `gui-preview` milestone.

## Building and running

You need Rust. `rust-toolchain.toml` pins the version, and rustup installs it
on the first build. From `gui/`:

```bash
cargo run -- [PATH] [--cli "<command>"]
```

- `PATH` is the folder to start in. It defaults to the current one. The GUI
  walks up from there to the first `roadmap/`, stopping at the repository's
  root. A roadmap folder itself, or a folder inside it, works too.
- `--cli` names the roadmap CLI to run. You can also set `ROADMAP_CLI`.
  Without either, the GUI runs `roadmap` from PATH, which hands off to the
  copy the repo pins, or failing that `npx --no -- roadmap`. The CLI needs
  `export`, which arrives in release 2.3.0. Until that is released, run this
  repo's own build:

  ```bash
  (cd ../cli && npm run build) && cargo run -- --cli "node $PWD/../cli/bin/roadmap.js" ..
  ```

| Key | Does |
|---|---|
| F5 | Reload: run `export` again |
| File › Open folder… | Open another repo or roadmap folder |

### Builds from CI

To try the GUI without Rust, take a binary from CI. After each merge to
master, once the tests pass, CI builds the GUI in release mode and keeps it
as an artifact on the run's page (Actions › the run on master › Artifacts,
which needs a GitHub login): `roadmap-gui-linux-x86_64`,
`roadmap-gui-macos-arm64` (Apple Silicon) and `roadmap-gui-windows-x86_64`.
Branches and pull requests get no binaries.

- The artifact is a zip, which drops the execute bit: on Linux and macOS,
  run `chmod +x roadmap-gui` first.
- The macOS binary is unsigned. Run
  `xattr -d com.apple.quarantine roadmap-gui`, or right-click it and choose
  Open.
- CI checks only that each binary runs `--version`, not that its window
  opens.

These are development builds. Releases come with the roadmap's
`gui-release` item.

## What it does, and doesn't

- **It reloads only when you ask.** It watches the roadmap's files, and when
  one changes it shows "Files changed on disk" over the window, but it
  redraws only on F5, as gitk does.
- **It shows the CLI's own words when something goes wrong:**
  - when the CLI can't be found;
  - when the CLI refuses, as `[rule] message`;
  - when the CLI answers without JSON, which an older CLI does: you get
    the command, the exit status, stdout and stderr as printed;
  - when the CLI answers with a schema this GUI doesn't read;
  - when the CLI hangs: it is killed after 30 s.

  In each case it keeps the last good snapshot on screen, or shows nothing.
  It never guesses.
- **Outside a repo,** it offers Open folder… and never runs `roadmap init`.
- **The status bar** shows the counts, git's branch and state, any warnings
  (hover over them to list them), when the roadmap was loaded, and which
  CLI ran. The git state comes from the CLI's snapshot, and the GUI never
  runs git itself. A commit doesn't touch `roadmap/`, so the git state goes
  stale until the next F5.

## Tests

```bash
cargo fmt --check && cargo clippy --all-targets -- -D warnings
cargo test                                                  # skips the real-CLI test
ROADMAP_CLI="node $PWD/../cli/bin/roadmap.js" cargo test    # as CI runs it
```

Run these before you push. CI runs all of them on Linux, on every push and
pull request. It also runs the tests on macOS and Windows, with no real CLI. On Windows the tests that run a CLI are left
out, because their fake CLIs are shell scripts, so nothing there tests
running the CLI.

The tests need no window. They cover:
- finding the roadmap;
- choosing and running the CLI, against fake CLIs for every answer it can
  give;
- the state machine behind the window: reloads, stale loads, failures,
  selection and the changed-on-disk flag;
- the file watcher;
- the snapshot structs, checked against the schema the CLI records.

Drawing is checked by hand, before a release and after changing `ui.rs`:

1. **This repo:** `cargo run -- --cli "node $PWD/../cli/bin/roadmap.js" ..`
   shows the open items in queue order, "Archived · N", and a status bar
   with counts, the git branch, the load time and the CLI.
2. **Changed on disk:** edit an item file in another window. The yellow
   banner appears over the list, and the list doesn't change. F5 reloads
   and the banner goes.
3. **No roadmap:** `cargo run -- /tmp` says "No roadmap here", with Open
   folder…. Opening a folder without a roadmap says so in a banner and
   keeps what was open.
4. **Open folder…:** typing a path works. Browse… opens a system dialog
   where an xdg portal runs. Under WSLg there may be none, and then the
   path field still works.
5. **An old CLI:** `cargo run -- --cli "npx -y
   simple-agentic-roadmap-skill@2.2.0 roadmap" ..` shows the "didn't answer
   with JSON schema 1" banner, an empty window, and the CLI's usage error
   word for word.
6. **No CLI:** `cargo run -- --cli "nope" ..`, or a PATH without `roadmap`
   and `npx`, shows "The roadmap CLI wasn't found", listing what was tried.

Under WSL, inotify gets no events for files under `/mnt/c`, so the
changed-on-disk banner works only for repos on the Linux file system.

Only Linux is built and tested so far. Windows and macOS builds come with
the release item, `gui-release`.
