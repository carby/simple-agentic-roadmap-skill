# roadmap GUI

A graphical client for the roadmap, modelled on gitk. Launched from inside a
repo, it shows that repo's `roadmap/`. It reads and writes only through the
`roadmap` CLI in [`../cli/`](../cli/README.md), keeps no state of its own
between runs, and never commits.

So far it has the frame (the roadmap's `gui-scaffold` item) and the Queue
tab (`gui-queue`). It finds the roadmap, reads it through `roadmap export`
(see [JSON output](../cli/docs/json.md)), and shows the queue: items in queue
order, with gitk-style dependency lanes, milestone chips, tags and a preview
strip. The dependency graph, the item and milestone pages, and then editing
come next. They are planned in the repo's [roadmap](../roadmap/README.md) for
the `gui-preview` milestone.

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
| ↑ ↓, j k | Select the row above or below |
| PgUp PgDn, Home End | Move a page, or to the top or bottom |
| ← → | Collapse or expand the selection's bucket |
| Enter, Space | On a bucket separator or the archived fold: collapse or expand it |
| `/`, Ctrl+F | Find in ids, titles and text |
| Enter, F3 | Go to the next match, opening a collapsed bucket or the fold if need be |
| F | Filter to the earliest milestone the selection is due for; with none, pick one |
| Esc | Close find, then the picker, then clear the filter. With none of them open, it does nothing |
| Ctrl+1 | The Queue tab |
| F5 | Reload: run `export` again |
| File › Open folder… | Open another repo or roadmap folder |

## The Queue tab

Each row is one item, in queue order, under a separator per bucket.

- **The lanes on the left** run from an item down to the items that depend
  on it, the way gitk draws commits.
  - A node is filled when the item is ready, hollow when it's waiting, and
    dashed in Later. It's purple with a stroke (⊘) when the item is blocked
    on a question, and grey when it's archived.
  - The gutter is at most eight lanes wide. Past that, the last lane is drawn
    double and holds the rest.
  - A small ↑ means the item depends on something that isn't drawn here.
- **Tags:**
  - `gate` and `⊘ blocked_on`;
  - `↑id`, for an open dependency that a collapsed bucket or the filter
    hides;
  - `needed first`, in a filtered view;
  - a yellow `changed` when the item's file changed on disk since the last
    load;
  - `shipped #n` or `declined` on archived items.
- **The milestone column:**
  - ◆ for each milestone the item is due for, and ◇ for each one its
    `depends_on` names;
  - √ when that milestone was reached (the default fonts have no ✓), and red with "late N d" when its date
    passed without it being reached.
  - Sorted by date, two at most, then "+n".
- **Show archived** lists the archived items that open items depend on,
  oldest first, and folds the rest into one row. Unfolding it lists them
  all.
- **The strip at the bottom** describes the selected item:
  - the first line has its state, id, title, every milestone with its date,
    its bucket and rank, and how long ago its file last changed;
  - the second line has why it waits, its gate or `blocked_on` text, and the
    first sentence of its text. The sentence is cut short first, so the
    reason always shows.

  Anything a row shows on hover is in the strip too, so nothing needs the
  mouse.

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
  selection and moving it, collapsing, find, the filter, Esc, and the
  changed-on-disk flag and paths;
- the queue: lanes, separators, glyphs, tags, chips, the archived fold, the
  filter, find and the strip's text;
- the file watcher;
- the snapshot structs, checked against the schema the CLI records;
- with `ROADMAP_CLI` set, the queue built from this repo's roadmap and from
  [`tests/fixtures/queue-states/`](tests/fixtures/queue-states/roadmap/),
  a roadmap with every state the tab draws.

Drawing is checked by hand, before a release and after changing `ui/`:

1. **This repo:** `cargo run -- --cli "node $PWD/../cli/bin/roadmap.js" ..`
   shows the queue, a separator per bucket, lanes, the strip, and a status
   bar with counts, the git branch, the load time and the CLI.
2. **Every state:** `cargo run -- --cli "node $PWD/../cli/bin/roadmap.js"
   tests/fixtures/queue-states` shows:
   - a ready, a waiting, a Later and a blocked node;
   - the fork from `base` and the merge into `merge`;
   - a late chip on `base`, "+1" on `fork-b`, ◇ v3 on `needs-old`, and √ on
     `reached-only`;
   - a `gate` tag on `merge`, and `⊘ blocked_on` on `question`.

   Show archived lists `old-done` and folds the other two. Unfolding lists
   `old-root` above `old-done`, with a grey lane between them and into
   `needs-old`.
3. **Keys:**
   - ↑ moves exactly one row, and j and k work the same way;
   - PgDn and End keep the selection in view;
   - ← on an item collapses its bucket and selects the separator, and →
     expands it;
   - `/` then "branch" shows "2 matches", and Enter steps through them;
   - "zzz" shows "No matches";
   - F on `fork-b` filters to "overdue" with its bar, and Esc clears it;
   - F on `merge` opens the picker.
4. **Changed on disk:** edit an item file in another window. The yellow
   banner appears over the queue, the item's row gets a yellow `changed` tag,
   and the queue doesn't change. F5 reloads, and the banner and the tag go.
5. **No roadmap:** `cargo run -- /tmp` says "No roadmap here", with Open
   folder…. Opening a folder without a roadmap says so in a banner and
   keeps what was open.
6. **Open folder…:** typing a path works. Browse… opens a system dialog
   where an xdg portal runs. Under WSLg there may be none, and then the
   path field still works.
7. **An old CLI:** `cargo run -- --cli "npx -y
   simple-agentic-roadmap-skill@2.2.0 roadmap" ..` shows the "didn't answer
   with JSON schema 1" banner, an empty window, and the CLI's usage error
   word for word.
8. **No CLI:** `cargo run -- --cli "nope" ..`, or a PATH without `roadmap`
   and `npx`, shows "The roadmap CLI wasn't found", listing what was tried.

Under WSL, inotify gets no events for files under `/mnt/c`, so the
changed-on-disk banner works only for repos on the Linux file system.

The window has only been checked by hand on Linux, under WSLg.
