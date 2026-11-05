+++
id = "standalone-binary"
title = "Ship the CLI as a standalone binary, with Homebrew, like OpenSpec"
bucket = "later"
rank = 5
filed = 2026-11-05
blocked_on = "whether an install without Node is worth a per-platform release pipeline"
+++

Since [global-install](../archive/global-install.md), the CLI installs once per machine with `npm install -g`, but that still needs Node 22. [OpenSpec](https://github.com/Fission-AI/OpenSpec/) leads with a single-file binary per platform instead: `curl … | sh` (or `irm … | iex` on Windows) installs it to `~/.local/bin`, after checking it against the release's `SHA256SUMS`. It also has a Homebrew formula. Python and other non-Node teams could then keep a roadmap on their machines without installing Node at all.

It isn't free. It adds a build per platform (macOS, Linux glibc and musl, Windows, each for x64 and arm64), an install script, checksums and a formula to every release. The binary also has to behave like the npm install: read roadmap.toml's `version` pin, warn when it runs another release, and hand off to a copy that a repo's package.json pins. CI is unaffected, since it runs through the action or `npx`.

Done looks like a release that attaches the binaries and `SHA256SUMS`, an install script, a Homebrew formula, and install docs that lead with whichever install the decision above settles on.
