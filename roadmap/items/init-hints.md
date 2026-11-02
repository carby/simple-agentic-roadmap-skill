+++
id = "init-hints"
title = "init hints only at steps still to do"
bucket = "now"
rank = 1
filed = 2026-11-02

[refs]
files = ["src/install.ts"]
+++

After `init`, the CLI always prints `Add <tool dirs> to .gitignore, and pin the package: npm install -D simple-agentic-roadmap-skill` (`src/install.ts`). Following the README's quick start, a repo has already done both: the package is a dev dependency, since that's how `npx --no -- roadmap init` runs at all, and the `.gitignore` line comes before or right after. So everyone who follows the docs is told to repeat two steps, which reads as if something went wrong.

It's also the first change since 2.0.0, so shipping it as 2.0.1 tests the release path end to end: `release.yml` publishing to npm through the trusted publisher, which 2.0.0 skipped because that version was published by hand.

Done looks like:
- `init` prints the `.gitignore` hint only for tool directories that `git check-ignore` doesn't already ignore, and always outside a git repo.
- It prints the pin hint only when `package.json` doesn't list the package.
- Tests cover a bare directory (both hints), a repo that did both (neither), and each on its own.
- 2.0.1 is published by `release.yml`, npm shows provenance for it, and the trusted publisher is validated, before `v2` moves.
