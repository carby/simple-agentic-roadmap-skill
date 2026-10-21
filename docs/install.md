---
tags: [roadmap-skill, setup]
aliases: [Install the skill]
---

# Install

A roadmap leans on two things that can drift apart: the **skill**, which holds
the rules your agent follows, and the **vendored script**, `tools/roadmap.py`,
which enforces them and lives in your repo. Install them so that both are
pinned to a release and both are committed, and so the repo says what to do
when the skill is missing. That takes three steps, once per repo. The commands
are bash; on Windows use WSL or Git Bash.

Other ways to install are in [Install alternatives](install-alternatives.md).

## 1. Add the skill as a pinned submodule

```bash
# from the root of the repo:
git submodule add https://github.com/carby/simple-agentic-roadmap-skill.git .claude/skills/roadmap
git -C .claude/skills/roadmap checkout "$(git -C .claude/skills/roadmap describe --tags --abbrev=0 --match 'v*.*.*')"
git add .gitmodules .claude/skills/roadmap
```

That checks out the newest release tag. Commit it, and your repo records that
exact commit of the skill. A submodule is pinned to a commit, not a branch, so
every collaborator, CI run and agent session gets the same rules until someone
deliberately moves the pin (see [Upgrading](upgrading.md)). Claude Code loads
skills from `.claude/skills/`, so there is nothing else to configure.

People who clone the repo need the submodule too: `git clone --recurse-submodules`,
or `git submodule update --init` afterwards. If your CI or cloud agents check out
the repo, make sure they fetch submodules. An empty `.claude/skills/roadmap`
means no skill.

## 2. Run `init`

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

## 3. Tell your agent the skill is required

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

## After `init`

**The tooling no longer depends on where the skill is installed.** Every
command, in the docs, in CI and when the agent runs one, goes through the
repo's own copy, `python tools/roadmap.py ...`, so the repo and its CI keep
working on machines without the skill. What the skill still supplies is the
agent's behaviour, which is why step 3 exists.

Next: set up [CI](ci.md).

---

Related: [Install alternatives](install-alternatives.md) · [Upgrading](upgrading.md) · [Home](index.md)
