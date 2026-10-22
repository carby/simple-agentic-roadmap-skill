# roadmap-skill

A simple roadmap for your repo, kept by your agent. It is built **KISS style**:
Markdown files sorted into three buckets, **Now**, **Next** and **Later**, and
nothing more. You stay the product owner: the agent suggests, you decide.

The full documentation is in [`docs/`](docs/index.md), which you can also open
as an Obsidian vault.

## Quick start

Once per repo, from its root (bash; on Windows use WSL or Git Bash). This adds
the skill as a submodule pinned to the newest release, then sets up `roadmap/`
and vendors the checker to `tools/roadmap.py`:

```bash
git submodule add https://github.com/carby/simple-agentic-roadmap-skill.git .claude/skills/roadmap
git -C .claude/skills/roadmap checkout "$(git -C .claude/skills/roadmap describe --tags --abbrev=0 --match 'v*.*.*')"
python .claude/skills/roadmap/scripts/roadmap.py init
git add .gitmodules .claude/skills/roadmap roadmap tools/roadmap.py
```

Then put this in your repo's `CLAUDE.md` (or `AGENTS.md`), so a missing skill
is a visible failure instead of an agent quietly improvising:

```markdown
### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill, which
this repo carries as a submodule at `.claude/skills/roadmap`. Use `/roadmap` for
any change to it. If the skill isn't available (try `git submodule update
--init`), stop and tell the user. Don't edit `roadmap/items/` or `roadmap/archive/`
by hand without it. Verify with `python tools/roadmap.py check`.
```

Why each step matters, and other ways to install, are in
[Install](docs/install.md) and [Install alternatives](docs/install-alternatives.md).

## Slash commands

| Command | What it does |
|---|---|
| `/roadmap` | Shows what's in Now, Next and Later, and suggests what to pick up. |
| `/roadmap init` | Sets up `roadmap/` in this repo. |
| `/roadmap new <what>` | Files a new item, in a bucket you confirm. |
| `/roadmap move <id> <bucket>` | Reprioritises an item. `move <id> <rank>` re-ranks it within its bucket. |
| `/roadmap close <id>` | Archives finished or declined work, with the reason. |
| `/roadmap check` | Validates the roadmap and fixes what it can. |
| `/roadmap <question>` | Answers from the roadmap and `done.md`. |

More in [Slash commands](docs/slash-commands.md).

## Documentation

| Note | What's in it |
|---|---|
| [Concepts](docs/concepts.md) | items, buckets, closing, and what the roadmap deliberately leaves out |
| [Slash commands](docs/slash-commands.md) | every `/roadmap` action, in detail |
| [Install](docs/install.md) | the pinned submodule, `init`, and the `CLAUDE.md` note |
| [Install alternatives](docs/install-alternatives.md) | global install, the Claude app zip, and why a plain clone isn't an install |
| [Upgrading](docs/upgrading.md) | moving the pin and the vendored script together; spotting drift |
| [Checking your roadmap](docs/checking.md) | `check`, `index`, the `[generated]` failure, append-only archives |
| [CI](docs/ci.md) | GitHub Actions, GitLab CI, pre-commit |
| [Rule tags](docs/rule-tags.md) | reading a `check` failure |
| [Configuration](docs/configuration.md) | `roadmap.toml`: refs and milestones |

## What's in here

| Path | For |
|---|---|
| `SKILL.md`, `references/conventions.md` | the agent: when to use the roadmap, the workflows, the rules |
| `scripts/roadmap.py` | the tool: `init`, `new`, `move`, `close`, `index`, `check` (Python 3.11+, no dependencies) |
| `assets/template/` | what `init` writes into your repo |
| `action.yml` | a GitHub Action that runs `check` |
| `docs/` | the documentation, as an Obsidian vault |
| `tests/`, `roadmap/`, `CONTRIBUTING.md` | for working on the skill: its test suite, its own roadmap, and how to develop and release |

Originally extracted from the roadmap of the snakestream project.

## Contributing

Working on the skill itself? [CONTRIBUTING.md](CONTRIBUTING.md) covers running
this repo's tests, adding a rule, CI and releasing.

## License

[MIT](LICENSE) © 2026 Tommy Derngren
