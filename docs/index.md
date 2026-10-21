---
tags: [roadmap-skill]
aliases: [Home, roadmap-skill docs]
---

# roadmap-skill docs

A simple roadmap for your repo, kept by your agent: Markdown files sorted into
**Now**, **Next** and **Later**. This folder is an Obsidian vault; open `docs/`
as a vault, or just browse it on GitHub. The [README](../README.md) is the
short version.

## Using it

- [Slash commands](slash-commands.md): what `/roadmap` does
- [Concepts](concepts.md): items, buckets, closing, what the roadmap
  deliberately leaves out

## Setting it up

- [Install](install.md): the skill as a pinned submodule, `init`, and the
  `CLAUDE.md` note
- [Install alternatives](install-alternatives.md): global install, the Claude
  app, and why a plain clone isn't an install
- [Upgrading](upgrading.md): moving the pin and the vendored script together

## Checking it

- [Checking your roadmap](checking.md): `check`, `index` and the `[generated]`
  failure
- [CI](ci.md): GitHub Actions, GitLab CI, pre-commit
- [Rule tags](rule-tags.md): reading a failure line
- [Configuration](configuration.md): `roadmap.toml`, refs and milestones

## Elsewhere in the repo

- [CONTRIBUTING](../CONTRIBUTING.md): working on the skill itself
- [CHANGELOG](../CHANGELOG.md): what changed in each release
- [Conventions](../references/conventions.md): the rules in full, as the
  agent reads them
