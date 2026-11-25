+++
id = "handoff-override"
title = "Say when a global roadmap hands off to the pinned copy, and allow skipping it"
bucket = "next"
rank = 8
filed = 2026-11-24
+++

Raised as [#34](https://github.com/carby/simple-agentic-roadmap-skill/issues/34). A globally installed `roadmap` silently re-runs itself as the copy the repo's package.json pins (`bin/roadmap.js`, `src/handoff.ts`). That keeps everyone in the repo on the version its lockfile names. But the person running it can't tell which copy ran, and has no supported way to run their global one instead, for example to try a newer release against the repo before bumping the pin. An internal `ROADMAP_NO_HANDOFF` variable already skips the handoff, but it exists to stop a handed-off run from handing off again, and it isn't documented.

Done when:
- a handoff prints one line on stderr naming the copy and version it hands off to. It goes on stderr so it never mixes with `list --json` and other output a script reads.
- there is a documented way to skip the handoff, either a flag or that variable, made public. docs/install.md says what it does, and that `check` may then disagree with CI, which runs the pinned version.
