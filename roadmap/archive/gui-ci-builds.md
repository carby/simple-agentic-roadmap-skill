+++
id = "gui-ci-builds"
title = "CI builds the GUI on Linux, macOS and Windows and keeps the binaries"
filed = 2026-11-27
milestone = ["gui-preview"]
closed = 2026-11-27
outcome = "shipped"
shipped_as = "#46"

[refs]
files = [".github/workflows/ci.yml"]
+++

CI's `gui` job builds the GUI only as a Linux debug build, and throws it away. Nothing checks that the GUI compiles on macOS or Windows, so a platform break would surface only at [gui-release](../items/gui-release.md), after every view has been built on top of it. And nobody can try a commit's GUI without installing Rust.

CI is split in three, and only the last part makes binaries:

- **Check** is local: the format, lint and test commands in `gui/README.md`, run with your own cargo before pushing.
- **The gate** runs on every push and pull request. The `gui` job keeps format, lint and the tests with the real CLI on Linux, under the name the master ruleset requires. A `gui-platforms` job runs `cargo test --locked` on macOS and Windows, building only what the tests need.
- **Delivery** runs on master only, after the gate is green. A `gui-delivery` job (`needs: [gui, gui-platforms]`) builds the GUI in release mode on Linux, macOS and Windows, with the toolchain `gui/rust-toolchain.toml` pins and `--locked`. It runs each binary's `--version` and uploads it as a workflow artifact named for its platform. Branches and pull requests get no binaries.

Done when a green run on master carries three downloadable binaries, one per platform, each of which runs `--version`. [gui-release](../items/gui-release.md) then builds on the delivery job: it adds the tag trigger, attaches the binaries to a release, and writes the install docs.

Decided while doing this:

- **The tests run on all three platforms.** Without `ROADMAP_CLI`, the real-CLI test skips itself on macOS and Windows. On Windows, `cli.rs`'s tests are gated out because their fake CLIs are shell scripts, so on Windows nothing tests spawning the CLI, the timeout or resolving the CLI.
- **The gate tests a debug build; delivery builds release.** A pull request therefore doesn't prove that the release build compiles on each platform. A break only in release mode is rare, and delivery catches it right after the merge.
- **macOS is Apple Silicon only** (`macos-latest`). A build for Intel Macs, or a universal binary, is left to gui-release.
- **CI checks `--version`, not the window.** `--version` returns before eframe starts, so it proves only that the binary loads. Whether the window opens on macOS and Windows is still checked by hand.
- **The gate saves its Rust cache from master only,** so branch builds on three platforms don't push master's caches out of the quota. Delivery artifacts keep GitHub's default retention.

Left for gui-release, all on Windows unless noted:

- `roadmap` on PATH is `roadmap.cmd`, and nothing tests resolving it.
- `kill_group` kills only the direct child, so on a timeout a node process under `npx` survives.
- The GUI opens a console window beside its own, because no `windows_subsystem` is set. Setting one would hide the output of `--help` and `--version`.
- The MSVC build needs the VC++ redistributable unless it is built with `+crt-static`.
- On Linux, the binary needs a glibc as new as ubuntu-latest's.
