---
tags: [roadmap-skill, setup]
aliases: [Install the skill]
---

# Install

A roadmap leans on two things that can drift apart: the **skill**, which holds
the rules your agent follows, and the **CLI**, `roadmap`, which enforces them.
Both come from one npm package, `simple-agentic-roadmap-skill`, installed the
way [OpenSpec](https://github.com/Fission-AI/OpenSpec/) is: one global CLI
that sets up each repo and keeps it current. It needs Node 22 or later.

Other ways to install are in [Install alternatives](install-alternatives.md).

## 1. Install the CLI

```bash
npm install -g simple-agentic-roadmap-skill
roadmap --version
```

Once per machine. Upgrading is covered in [Upgrading](upgrading.md).

## 2. Run `init` in the repo

```bash
cd your-repo
roadmap init --tools claude,agents
```

`init` creates:
- `roadmap/`, containing README.md, done.md, decisions.md, roadmap.toml,
  `items/` and `archive/`
- the skill, in each tool's skills directory: `.claude/skills/roadmap` for
  Claude Code, and `.agents/skills/roadmap`, which Codex, Amp and others read.
  `--tools` defaults to `claude`.

It also **pins the version** this repo runs, as `version = "x.y.z"` in
`roadmap/roadmap.toml`. Every command warns when it runs a different release,
the GitHub Action runs the pinned one, and `roadmap update` moves the pin when
you upgrade. That works in any repo, Node or not.

The skill copies are generated from the package, so don't commit them. Each
developer runs `init` or `update` in their own clone:

```bash
printf '.claude/skills/\n.agents/skills/\n' >> .gitignore
git add .gitignore roadmap
```

Use `--dir` to put the roadmap somewhere other than `roadmap/`. You can also ask
the agent to "set up a roadmap here".

### Or pin it as a dev dependency

In a Node repo you may rather let the lockfile pin the version, next to your
other tools:

```bash
npm install -D simple-agentic-roadmap-skill
npx --no -- roadmap init --tools claude,agents
git add package.json package-lock.json .gitignore roadmap
```

`init` sees the pin in package.json and leaves roadmap.toml unpinned. Upgrades
then go through your normal dependency updates, and commands run as
`npx --no -- roadmap ...`. A global `roadmap` works here too: it **hands off**
to the copy the repo's package.json pins, so it always runs that version.

In a repo with no `package.json` yet, run `npm init -y` first. Without one, npm
quietly installs into the nearest parent directory that has a `package.json`
(often your home directory), and the pin never reaches the repo.

## 3. Tell your agent the skill is required

Put this in your repo's `CLAUDE.md` (or `AGENTS.md`). It is what makes a missing
or stale skill a visible failure instead of an agent quietly improvising:

```markdown
### Roadmap

The roadmap lives in `roadmap/` and is managed with the `roadmap` skill from
the `simple-agentic-roadmap-skill` package. Use `/roadmap` for any change to
it. If the skill isn't available, run `roadmap update` (installing the CLI
with `npm install -g simple-agentic-roadmap-skill` first if needed), or stop
and tell the user. Don't edit `roadmap/items/` or `roadmap/archive/` by hand
without it. Verify with `roadmap check`.
```

## After `init`

`roadmap update` refreshes every tool directory that already has the skill.
Run it in a fresh clone, and after every upgrade of the CLI. In a repo that
pins the package as a dev dependency, run `npm install` first, or use
`npx --no -- roadmap update`.

Next: set up [CI](ci.md).

---

Related: [Install alternatives](install-alternatives.md) · [Upgrading](upgrading.md) · [Home](index.md)
