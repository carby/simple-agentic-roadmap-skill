+++
id = "gui-release"
title = "Release the GUI as prebuilt binaries per platform"
bucket = "next"
rank = 4
filed = 2026-11-25
milestone = ["gui-preview"]
depends_on = ["gui-scaffold"]
+++

The GUI ships as prebuilt binaries per platform, as [gui-breakdown](../archive/gui-breakdown.md) leans, from its own release pipeline in this repo (see [decisions.md](../decisions.md), 2026-11-23).

- A release on the GUI's tag prefix, set up by [monorepo-move](monorepo-move.md), builds and attaches binaries for macOS, Linux and Windows, never moving the CLI's `v` tags.
- Install docs say how to get the binary, and that it needs the CLI installed, since it drives the CLI as a subprocess.

Done when a tagged GUI release attaches the binaries and the docs are published. This release is what reaches the gui-preview milestone.
