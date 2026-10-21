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
- **A picture of it:** `roadmap/README.md` lists the open items, and above the
  list is a generated Mermaid diagram that GitHub draws in place: one box per
  bucket, with an arrow from each item to the items that depend on it.
- **You are the product owner:** the agent never adds, moves or closes items
  on its own. When it spots something worth tracking, it pitches the item to
  you and files it only if you agree.
- **No work-in-progress tracking:** the roadmap doesn't record who is working
  on what, because that would take a commit every time work starts or stops.
- **Closed work:** an item is closed in the same branch as its code, so it
  moves to `roadmap/archive/` and gets a line in `done.md` when that code
  merges. Declined ideas are archived too, with the reasoning.
- **Checking:** one dependency-free script, `check`, catches mistakes in CI.

An item can list the items that must come first (`depends_on`), and `check`
keeps them in order. Milestones are named dates declared in `roadmap.toml`: an
item can be due for one (`milestone`) or wait on one (`depends_on`), and
`check` keeps those in order too, without ever comparing against today's date.
There are deliberately **no** epics, estimates or Gantt scheduling. Those may come later (see [`roadmap/`](roadmap/)), but for
now the roadmap stays simple enough to read in one sitting and edit by hand.

Originally extracted from the roadmap of the snakestream project.

## What's in here

| Path | For |
|---|---|
| `SKILL.md`, `references/conventions.md` | the agent: when to use the roadmap, the workflows, the rules |
| `scripts/roadmap.py` | the tool: `init`, `new`, `move`, `close`, `index`, `check` (Python 3.11+, no dependencies) |
| `assets/template/` | what `init` writes into your repo |
| `action.yml` | a GitHub Action that runs `check` |
| `tests/`, `roadmap/`, `CONTRIBUTING.md` | for working on the skill: its test suite, its own roadmap, and how to develop and release |

## Install the skill

A roadmap leans on two things that can drift apart: the **skill**, which holds
the rules your agent follows, and the **vendored script**, `tools/roadmap.py`,
which enforces them and lives in your repo. Install them so that both are
pinned to a release and both are committed, and so the repo says what to do
when the skill is missing. That takes three steps, once per repo. The commands
are bash; on Windows use WSL or Git Bash.

### 1. Add the skill as a pinned submodule

```bash
# from the root of the repo:
git submodule add https://github.com/carby/simple-agentic-roadmap-skill.git .claude/skills/roadmap
git -C .claude/skills/roadmap checkout "$(git -C .claude/skills/roadmap describe --tags --abbrev=0 --match 'v*.*.*')"
git add .gitmodules .claude/skills/roadmap
```

That checks out the newest release tag. Commit it, and your repo records that
exact commit of the skill. A submodule is pinned to a commit, not a branch, so
every collaborator, CI run and agent session gets the same rules until someone
deliberately moves the pin (see [Upgrading](#upgrading)). Claude Code loads
skills from `.claude/skills/`, so there is nothing else to configure.

People who clone the repo need the submodule too: `git clone --recurse-submodules`,
or `git submodule update --init` afterwards. If your CI or cloud agents check out
the repo, make sure they fetch submodules. An empty `.claude/skills/roadmap`
means no skill.

### 2. Run `init`

```bash
python .claude/skills/roadmap/scripts/roadmap.py init
git add roadmap tools/roadmap.py
```

`init` creates:
- `roadmap/`, containing README.md, done.md, roadmap.toml, `items/` and
  `archive/`
- `tools/roadmap.py`, a copy of the script

Use `--dir` and `--script` to put them somewhere else. You can also ask the
agent to "set up a roadmap here", and it will run `init` from wherever it
loaded the skill.

### 3. Tell your agent the skill is required

Put this in your repo's `CLAUDE.md` (or `AGENTS.md`). It is what makes a missing
or stale skill a visible failure instead of an agent quietly improvising:

```markdown
### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill, which
this repo carries as a submodule at `.claude/skills/roadmap`. Use `/roadmap` for
any change to it. If the skill isn't available (try `git submodule update
--init`), stop and tell the user. Don't edit `roadmap/items/` or `roadmap/archive/`
by hand without it. Verify with `python tools/roadmap.py check`.
```

**After `init`, the tooling no longer depends on where the skill is installed.**
Every command, in the docs, in CI and when the agent runs one, goes through the
repo's own copy, `python tools/roadmap.py ...`, so the repo and its CI keep
working on machines without the skill. What the skill still supplies is the
agent's behaviour, which is why step 3 exists.

### Alternatives

**Global, for yourself (every repo on your machine).** Nothing is committed, so
collaborators and CI don't get the skill, and you have to keep it current
yourself. Pin the clone to a release, and still add the note from step 3.

```bash
git clone https://github.com/carby/simple-agentic-roadmap-skill.git ~/.claude/skills/roadmap
git -C ~/.claude/skills/roadmap checkout "$(git -C ~/.claude/skills/roadmap describe --tags --abbrev=0 --match 'v*.*.*')"

# then, from the root of each repo that should have a roadmap:
python ~/.claude/skills/roadmap/scripts/roadmap.py init
```

**A plain clone into the repo is not an install.** `git clone ... .claude/skills/roadmap`
isn't tracked by your repo, so collaborators get nothing and each machine ends
up on whichever commit it cloned that day. Use the submodule, or commit a
copy at a known release.

**Chats and Projects in the Claude app (claude.ai, desktop).** The app's Code
tab is Claude Code, so use the submodule there. This option is for chats,
which read the roadmap but can't change the repo.

Download
[`roadmap.zip`](https://github.com/carby/simple-agentic-roadmap-skill/releases/latest/download/roadmap.zip)
from the latest release (or from a specific one, by replacing `latest/download`
in the link with `download/<tag>`) and upload it in the app's Skills settings.
To use it on a repo, add the repo to a Project and include the `roadmap/`
folder in the files it syncs. The app reads that copy but can't write to your
repo, so `/roadmap` and questions work as usual. `new`, `move` and `close` give
you the changed files to download and commit yourself; run `python
tools/roadmap.py index` and `check` locally afterwards.

## Upgrading

The skill and the vendored script move together, in one commit. Read the
[CHANGELOG](CHANGELOG.md) first: it says when a release changes the rules, since
a stricter rule can turn a passing `check` red.

```bash
git -C .claude/skills/roadmap fetch --tags
git -C .claude/skills/roadmap checkout <tag>             # the release you want
python .claude/skills/roadmap/scripts/roadmap.py upgrade # --script <path> if not tools/roadmap.py
git add .claude/skills/roadmap tools/roadmap.py
git commit -m "chore: upgrade the roadmap skill to <tag>"
```

`upgrade` replaces the vendored script, prints `old → new`, and leaves
`roadmap/` alone. It then runs `check` with the new version, so any rule
changes show up straight away. It refuses a downgrade, or a copy with local
edits, unless you pass `--force`.

**How drift shows up.** `python tools/roadmap.py --version` says which release
is vendored.
- The skill's copy warns on stderr whenever it runs next to an older
  `tools/roadmap.py`.
- Once per session the agent compares the two versions. If the vendored script
  is older it offers `upgrade`. If the skill is older than the script, it tells
  you to update the skill, because someone upgraded the repo without the
  checkout you are using.
- With the submodule, `git submodule status` shows the pinned commit, and a
  commit that moves it is easy to spot in review. Git may label that commit
  `v1` rather than `v1.3.1`, because the floating tag sits on the same commit.
  The commit is what is pinned, so the label doesn't matter.

The GitHub Action's floating `@v1` tag is the only thing that follows new
releases on its own. It runs your vendored `tools/roadmap.py` when there is one,
and falls back to the copy bundled with the action when there isn't.

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
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0                       # only needed for `base`
      - uses: carby/simple-agentic-roadmap-skill@v1
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
| `[depends]` | a dependency or milestone doesn't exist, was declined, or doesn't come first (earlier bucket, or higher rank) |
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

**Milestones.** Declare each one in `roadmap/roadmap.toml` with a title and a
date, then file items with `--milestone beta` (due for it) or
`--depends-on beta` (waits on it):

```toml
[milestones]
beta = { title = "Public beta", date = 2026-12-01 }
```

## Contributing

Working on the skill itself? [CONTRIBUTING.md](CONTRIBUTING.md) covers running
this repo's tests, adding a rule, CI and releasing.

## License

[MIT](LICENSE) © 2026 Tommy Derngren
