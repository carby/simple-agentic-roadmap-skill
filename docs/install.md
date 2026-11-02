---
tags: [roadmap-skill, setup]
aliases: [Install the skill]
---

# Install

A roadmap leans on two things that can drift apart: the **skill**, which holds
the rules your agent follows, and the **CLI**, `roadmap`, which enforces them.
Both come from one npm package, `simple-agentic-roadmap-skill`, so a single
version in your `package.json` pins both, the way
[OpenSpec](https://github.com/Fission-AI/OpenSpec/) is installed. Setting it up
takes three steps, once per repo. It needs Node 22.18 or later.

Other ways to install are in [Install alternatives](install-alternatives.md).

## 1. Add the package as a dev dependency

```bash
# from the root of the repo:
npm install -D simple-agentic-roadmap-skill
```

The lockfile pins the exact version, so every developer, CI run and agent
session gets the same rules, and upgrades go through your normal dependency
updates (see [Upgrading](upgrading.md)). Every command runs as
`npx --no -- roadmap ...`.

## 2. Run `init`

```bash
npx --no -- roadmap init --tools claude,agents
```

`init` creates:
- `roadmap/`, containing README.md, done.md, decisions.md, roadmap.toml,
  `items/` and `archive/`
- the skill, in each tool's skills directory: `.claude/skills/roadmap` for
  Claude Code, and `.agents/skills/roadmap`, which Codex, Amp and others read.
  `--tools` defaults to `claude`.

The skill copies are generated from the package, so don't commit them. Each
developer runs `init` or `update` in their own clone:

```bash
printf '.claude/skills/\n.agents/skills/\n' >> .gitignore
git add package.json package-lock.json .gitignore roadmap
```

Use `--dir` to put the roadmap somewhere other than `roadmap/`. You can also ask
the agent to "set up a roadmap here".

## 3. Tell your agent the skill is required

Put this in your repo's `CLAUDE.md` (or `AGENTS.md`). It is what makes a missing
or stale skill a visible failure instead of an agent quietly improvising:

```markdown
### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill from
the `simple-agentic-roadmap-skill` dev dependency. Use `/roadmap` for any
change to it. If the skill isn't available, run `npm install` and
`npx --no -- roadmap update`, or stop and tell the user. Don't edit `roadmap/items/` or
`roadmap/archive/` by hand without it. Verify with `npx --no -- roadmap check`.
```

## After `init`

`npx --no -- roadmap update` refreshes every tool directory that already has the skill,
from whichever version `package.json` pins. Run it after `npm install` in a
fresh clone, and after every upgrade of the package.

Next: set up [CI](ci.md).

---

Related: [Install alternatives](install-alternatives.md) · [Upgrading](upgrading.md) · [Home](index.md)
