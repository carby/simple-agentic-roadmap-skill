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

- On every push and pull request, CI builds the GUI in release mode on Linux, macOS and Windows, with the toolchain `gui/rust-toolchain.toml` pins and `--locked`.
- Each build is uploaded as a workflow artifact, named for its platform, so a commit's or PR's binaries can be downloaded from its run.
- Format, lint and the tests with the real CLI keep running on Linux, in the `gui` job, whose name the master ruleset requires. A separate `gui-build` job runs once per platform.

Done when a green run on master carries three downloadable binaries, one per platform, each of which runs `--version`. [gui-release](../items/gui-release.md) then builds on this job: it adds the tag trigger, attaches the binaries to a release, and writes the install docs.

Decided while doing this:

- **The tests run on all three platforms,** in the release profile so that each platform compiles its dependencies once. Without `ROADMAP_CLI`, the real-CLI test skips itself there. On Windows, `cli.rs`'s tests are gated out because their fake CLIs are shell scripts, so on Windows nothing tests spawning the CLI, the timeout or resolving the CLI.
- **macOS is Apple Silicon only** (`macos-latest`). A build for Intel Macs, or a universal binary, is left to gui-release.
- **CI checks `--version`, not the window.** `--version` returns before eframe starts, so it proves only that the binary loads. Whether the window opens on macOS and Windows is still checked by hand.
- **The Rust cache is saved from master only,** so three platforms' release builds don't push master's caches out of the quota. Artifacts are kept for 14 days.

Left for gui-release, all on Windows unless noted:

- `roadmap` on PATH is `roadmap.cmd`, and nothing tests resolving it.
- `kill_group` kills only the direct child, so on a timeout a node process under `npx` survives.
- The GUI opens a console window beside its own, because no `windows_subsystem` is set. Setting one would hide the output of `--help` and `--version`.
- The MSVC build needs the VC++ redistributable unless it is built with `+crt-static`.
- On Linux, the binary needs a glibc as new as ubuntu-latest's.
