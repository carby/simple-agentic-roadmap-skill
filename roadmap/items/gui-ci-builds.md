+++
id = "gui-ci-builds"
title = "CI builds the GUI on Linux, macOS and Windows and keeps the binaries"
bucket = "next"
rank = 1
filed = 2026-11-27
milestone = ["gui-preview"]

[refs]
files = [".github/workflows/ci.yml"]
+++

CI's `gui` job builds the GUI only as a Linux debug build, and throws it away. Nothing checks that the GUI compiles on macOS or Windows, so a platform break would surface only at [gui-release](gui-release.md), after every view has been built on top of it. And nobody can try a commit's GUI without installing Rust.

- On every push and pull request, CI builds the GUI in release mode on Linux, macOS and Windows, with the toolchain `gui/rust-toolchain.toml` pins and `--locked`.
- Each build is uploaded as a workflow artifact, named for its platform, so a commit's or PR's binaries can be downloaded from its run.
- Format, lint and the tests keep running on Linux as now. Whether they also run on the other two platforms is decided while doing this, and recorded here.

Done when a green run on master carries three downloadable binaries, one per platform, each of which starts. [gui-release](gui-release.md) then builds on this job: it adds the tag trigger, attaches the binaries to a release, and writes the install docs.
