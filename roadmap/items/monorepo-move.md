+++
id = "monorepo-move"
title = "Move the CLI into cli/ so the repo can hold the GUI in gui/"
bucket = "now"
rank = 1
filed = 2026-11-25
+++

The repo becomes a monorepo (see [decisions.md](../decisions.md), 2026-11-23): the current codebase moves down into cli/, the GUI goes in gui/, and one roadmap/ stays at the top. This is the first item planned in [gui-breakdown](gui-breakdown.md), ahead of any GUI code, because every GUI item builds in gui/ and the CLI's paths change under every open branch.

The move has to keep working everything the root layout supports today:
- **The GitHub Action.** Users reach `action.yml` as `uses: <owner>/<repo>@v2` at the root. Either a root `action.yml` stays and runs the CLI from cli/, or the move ships as a major version. Deciding which is part of this item.
- **The npm package and trusted publishing.** release.yml publishes from cli/, and the skill zip it builds still has SKILL.md at its top.
- **Release tags.** The `v` tags and the floating `v2` stay the CLI's. The GUI gets its own prefix, such as `gui-v`, so a GUI release never moves the action's tag.
- **The dogfood setup.** CLAUDE.md, the `npm run dogfood` skill links, and the `node bin/roadmap.js check` command CLAUDE.md documents.
- **CI**, for both the CLI and an empty gui/.
- **Refs.** Open items whose `refs` point at src/ paths, which `check` validates, point at cli/src/ instead.

Done when the CLI builds, tests and releases from cli/, the action works for an existing `@v2` user (or the major version and its upgrade note are out), and `check` passes.
