# roadmap-skill

A simple roadmap for your repo, kept by your agent. It is built **KISS style**:
Markdown files sorted into three buckets, **Now**, **Next** and **Later**, and
nothing more.

## Slash commands

Installing the skill adds one slash command, `/roadmap`. What you type after
it picks the action:

| Command | What it does |
|---|---|
| `/roadmap` | Shows what's in Now, Next and Later, and suggests what to pick up. |
| `/roadmap init` | Sets up `roadmap/` in this repo. (For CI, see [Checking your roadmap](#checking-your-roadmap).) |
| `/roadmap new <what>` | Files a new item. The agent suggests a bucket, based on what the item depends on, and **you confirm it**. Then the agent writes the argument and runs the check. |
| `/roadmap move <id> <bucket>` | Reprioritises an item, e.g. from Next into Now when planning the next sprint. |
| `/roadmap close <id>` | Archives finished or declined work, with the reason, and lists it in `done.md`. Do it in the branch that ships the code. |
| `/roadmap check` | Validates the roadmap and fixes what it can, e.g. a stale index. |
| `/roadmap <question>` | Answers from the roadmap and `done.md`, e.g. `/roadmap has anyone tried caching tokens?` |

You don't have to use the slash command. The agent also loads the skill on
its own when you ask what to work on next, or when you propose a cleanup. In
that case it checks `done.md` first, in case the idea was already tried and
declined.

## What it is, and what it isn't

- **Items:** each item is one Markdown file under `roadmap/items/`. A few
  header fields give its bucket, rank and dates, and the rest is plain prose.
- **Buckets:** items are sorted by priority, not by progress:
  - **Now:** the top priority, like a planned sprint. It doesn't mean
    "someone is working on it right now".
  - **Next:** ready, and queued to follow.
  - **Later:** waiting on a decision nobody has made yet.

  You decide the bucket. The agent suggests one, and it usually suggests what
  you'd pick.
- **You are the product owner:** the agent never adds, moves or closes items
  on its own. When it spots something worth tracking, it pitches the item to
  you and files it only if you agree.
- **No work-in-progress tracking:** the roadmap doesn't record who is working
  on what, because that would take a commit every time work starts or stops.
- **Closed work:** an item is closed in the same branch as its code, so it
  moves to `roadmap/archive/` and gets a line in `done.md` when that code
  merges. Declined ideas are archived too, with the reasoning.
- **Checking:** one dependency-free script, `check`, catches mistakes in CI.

There are deliberately **no** issue dependencies, epics, milestones, estimates
or Gantt scheduling. Those may come later (see [`roadmap/`](roadmap/)), but for
now the roadmap stays simple enough to read in one sitting and edit by hand.

Originally extracted from the roadmap of the snakestream project.

## What's in here

| Path | For |
|---|---|
| `SKILL.md`, `references/conventions.md` | the agent: when to use the roadmap, the workflows, the rules |
| `scripts/roadmap.py` | the tool: `init`, `new`, `move`, `close`, `index`, `check` (Python 3.11+, no dependencies) |
| `assets/template/` | what `init` writes into your repo |
| `action.yml` | a GitHub Action that runs `check` |
| `tests/`, `roadmap/` | this repo's own test suite, and its own roadmap (dogfood) |

## Install the skill

Installing has two steps:
1. Put the skill where your agent can load it: globally or in one repo.
2. Run `init` once in each repo that should have a roadmap.

Only step 2's command depends on where you installed the skill. The examples
use Claude Code's skill directories.

**Option A: global (every repo on your machine)**

```bash
git clone <this-repo> ~/.claude/skills/roadmap

# then, from the root of each repo that should have a roadmap:
python ~/.claude/skills/roadmap/scripts/roadmap.py init
```

**Option B: per repo (committed with the repo, so collaborators get it too)**

```bash
# from the root of the repo:
git clone <this-repo> .claude/skills/roadmap      # or add it as a git submodule
python .claude/skills/roadmap/scripts/roadmap.py init
```

Either way, you can also ask the agent to "set up a roadmap here", and it will
run `init` from wherever it loaded the skill.

`init` creates:
- `roadmap/`, containing README.md, done.md, roadmap.toml, `items/` and
  `archive/`
- `tools/roadmap.py`, a copy of the script

Use `--dir` and `--script` to put them somewhere else.

**After `init`, the install location no longer matters.** Every other
command, in the docs, in CI and when the agent runs one, goes through the
repo's own copy, `python tools/roadmap.py ...`. The repo and its CI keep
working even on machines without the skill installed.

## Checking your roadmap

This section is about **your** repo's roadmap. `roadmap.py check` is the whole
client-side test. It needs only Python 3.11+, exits `1` and prints one line per
problem when something is wrong, and exits `0` otherwise.

**Locally:**

```bash
python tools/roadmap.py check      # what CI runs
python tools/roadmap.py index      # regenerates the index in roadmap/README.md and done.md
```

**The most common failure: `[generated]`.** Two parts of the roadmap are
generated by the script, not written by hand:
- the list of open items in `roadmap/README.md`, between the
  `<!-- BEGIN INDEX -->` and `<!-- END INDEX -->` markers
- the list of closed items in `roadmap/done.md`

Suppose you edit an item file by hand (a title, a bucket, a rank) or add,
delete or move one. Those lists no longer match the files, and `check`
reports:

```text
roadmap/README.md: generated block is stale; run `roadmap.py index` [generated]
```

To fix it, run `python tools/roadmap.py index` and commit the result. `new`,
`move` and `close` regenerate the lists themselves, so this only follows hand
edits.

**In CI.** Pick one of these.

GitHub Actions, using this repo's action. It runs your vendored
`tools/roadmap.py`, or falls back to the copy bundled with the action:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0                       # only needed for `base`
      - uses: OWNER/roadmap-skill@v1
        with:
          dir: roadmap
          base: origin/${{ github.base_ref }}  # PRs only: holds archive/ append-only
```

GitHub Actions without the action, or any other CI:

```yaml
      - run: python tools/roadmap.py check
```

GitLab CI:

```yaml
roadmap:
  image: python:3.12-slim
  script:
    - python tools/roadmap.py check
```

pre-commit (`.pre-commit-config.yaml`):

```yaml
  - repo: local
    hooks:
      - id: roadmap
        name: roadmap check
        entry: python tools/roadmap.py check
        language: system
        pass_filenames: false
        files: ^roadmap/
```

**Append-only archive.** Add `--base <ref>`, e.g.
`python tools/roadmap.py check --base origin/main`, to fail when an archived
entry is deleted, moved or has a line changed. Adding lines is still allowed,
which is how dated annotations work. This needs git history, so use
`fetch-depth: 0` in `actions/checkout`.

**Reading a failure.** Each line looks like `path[:line]: message [tag]`, and
the tag names the rule that failed:

| Tag | What's wrong |
|---|---|
| `[frontmatter]`, `[schema]` | an item's `+++` header is missing or broken, or has missing or unknown fields |
| `[bucket]` | the item's fields don't fit its bucket (e.g. a `later` item without `blocked_on`) |
| `[rank]`, `[dates]`, `[ids]` | a duplicate rank, a quoted date, or an id used twice |
| `[body]` | the item has no prose (`new` leaves a placeholder you have to replace) |
| `[refs]`, `[links]` | a ref or a relative link points at a file that doesn't exist |
| `[generated]` | the lists in README.md or done.md are out of date: run `index` |
| `[append-only]` | an archived entry was changed or deleted (only with `--base`) |
| `[config]` | `roadmap.toml` is invalid |

[`references/conventions.md`](references/conventions.md#rule-tags) gives each
rule in full, with its usual fix.

**Refs to things other than files.** By default a ref must name an existing
file. For other ref kinds, declare each kind as a path template in
`roadmap/roadmap.toml`:

```toml
[refs]
specs   = "openspec/specs/{}"
changes = ["openspec/changes/{}", "openspec/changes/archive/*-{}"]
```

**Upgrading the vendored script.** `python tools/roadmap.py --version` shows
which version is vendored. To upgrade, copy the new `scripts/roadmap.py` over
it.

## Developing: running this repo's tests

This section is about **this** repo. The pytest suite tests the tool, the
template, SKILL.md and the docs. It never runs in a client's CI.

```bash
uv sync                                        # dev deps: pytest, ruff
uv run pytest                                  # the full suite
uv run pytest tests/test_rules.py -k bucket    # one rule's cases
uv run ruff check . && uv run ruff format --check .
```

| File | Covers |
|---|---|
| `tests/test_rules.py` | one failing case per rule tag, plus what the rules deliberately allow. `test_every_rule_has_a_failing_case` fails if a tag in `RULES` has no case. |
| `tests/test_render.py` | the generated index and done.md: order, grouping, splicing |
| `tests/test_cli.py` | the script as a subprocess: exit codes, stderr, `--dir`, usage errors |
| `tests/test_workflow.py` | `init → new → move → close` in a fresh repo, with `check` required to pass after every step, and link rewriting |
| `tests/test_append_only.py` | `check --base` against a real temporary git repo |
| `tests/test_skill.py` | SKILL.md frontmatter; every command the agent docs name exists; every rule tag documented; the dogfood roadmap is clean |
| `tests/test_readme.py` | this README: both testing sections exist, and it names real commands and Action inputs |

`tests/fixtures/valid/` is a complete example roadmap. Its README.md and
done.md are the golden output of the renderer. If you change the rendering on
purpose, regenerate them with:

```bash
python scripts/roadmap.py index --dir tests/fixtures/valid/roadmap
```

**Adding a rule:**
1. Add its tag to `RULES` in `scripts/roadmap.py`.
2. Implement it.
3. Add a failing case to `CASES` in `tests/test_rules.py`.
4. Add a row to the rule-tag table in `references/conventions.md`.

The tests fail until all four are done.

**CI** (`.github/workflows/ci.yml`) has two jobs:
- `test`: runs the suite above on Python 3.11 to 3.14.
- `action`: runs the client-side check the way a consuming repo does, through
  `uses: ./`. It checks the fixture, and it checks this repo's own `roadmap/`
  with `--base`.

The script must stay stdlib-only. It gets vendored into other repos.
