# roadmap-skill

A simple roadmap for your repo, kept by your agent: Markdown files sorted into
**Now**, **Next** and **Later**, with every rule checked in CI. You stay the
product owner: the agent suggests, you decide.

This repo holds:

| Folder | What |
|---|---|
| [`cli/`](cli/README.md) | the `roadmap` CLI and the agent skill, published to npm as `simple-agentic-roadmap-skill`. **Start here:** install, quick start and the full docs. |
| [`gui/`](gui/README.md) | a graphical client modelled on gitk, which drives the CLI. Early: it opens a roadmap, read-only. |
| [`roadmap/`](roadmap/README.md) | the project's own roadmap, kept with the skill |
| [`action.yml`](action.yml) | the GitHub Action that runs `check`: `uses: carby/simple-agentic-roadmap-skill@v2` (see [CI](cli/docs/ci.md)) |

Install the CLI once per machine (Node 22 or later), then set up a repo from
its root:

```bash
npm install -g simple-agentic-roadmap-skill
roadmap init --tools claude,agents
```

The [CLI's README](cli/README.md) covers the rest. Working on this repo? See
[CONTRIBUTING.md](cli/CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Tommy Derngren
