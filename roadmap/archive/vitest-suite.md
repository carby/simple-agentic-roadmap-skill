+++
id = "vitest-suite"
title = "Port the Python test suite to vitest"
filed = 2026-11-02
depends_on = ["npm-installer"]
closed = 2026-11-02
outcome = "shipped"
shipped_as = "#19"

[refs]
files = ["test/helpers.ts", "CONTRIBUTING.md"]
+++

Split from [npx-ci-migration](../items/npx-ci-migration.md) on 2026-11-02, so that PR doesn't also carry the whole test port. The Python suite (about 2.5k lines, 224 tests) is still the TypeScript CLI's spec: with `ROADMAP_IMPL=ts` it runs against the bin. It can't stay once the Python script goes, and porting it is internal work that needs no release.

Done looks like:
- Every Python test has a vitest counterpart under `test/`, or is dropped with a reason. The `python_only` tests cover Python's `init`, `upgrade` and vendoring, which `test/install.test.ts` already replaces.
- Planted bugs in a message and in the renderer still fail tests, as they did for the port.
- `tests/`, `pyproject.toml`, `uv.lock` and the Python CI job are gone, and CONTRIBUTING describes an npm-only dev loop.
- `scripts/roadmap.py` stays, untested here but still run by CI's `action` job, until npx-ci-migration moves the action to Node and deletes it. Until then, rule changes wait, since only the TypeScript side would get them.

**Outcome:** shipped in #19. The suite is 12 vitest files under `test/`, 252 tests, most of them running the built bin as a subprocess. Of the 142 Python test functions, 132 have a counterpart: 124 under the same name, 8 renamed. The 10 dropped ones tested Python's `upgrade`, vendoring and drift warning, which no longer exist. What the work corrected:
- The planted rendering bug fails 14 tests now, not 101. The Python suite had re-checked every roadmap it built through the TypeScript bin, so any rendering difference surfaced as `[generated]` everywhere. Now the golden fixture and the explicit render assertions catch it, which is what they are for.
- CONTRIBUTING's dev commands run the CLI as `node bin/roadmap.js`, so the docs test that every named command exists learned that form too.
