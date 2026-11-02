+++
id = "vitest-suite"
title = "Port the Python test suite to vitest"
bucket = "now"
rank = 3
filed = 2026-11-02
depends_on = ["npm-installer"]

[refs]
files = ["test/helpers.ts", "CONTRIBUTING.md"]
+++

Split from [npx-ci-migration](npx-ci-migration.md) on 2026-11-02, so that PR doesn't also carry the whole test port. The Python suite (about 2.5k lines, 224 tests) is still the TypeScript CLI's spec: with `ROADMAP_IMPL=ts` it runs against the bin. It can't stay once the Python script goes, and porting it is internal work that needs no release.

Done looks like:
- Every Python test has a vitest counterpart under `test/`, or is dropped with a reason. The `python_only` tests cover Python's `init`, `upgrade` and vendoring, which `test/install.test.ts` already replaces.
- Planted bugs in a message and in the renderer still fail tests, as they did for the port.
- `tests/`, `pyproject.toml`, `uv.lock` and the Python CI job are gone, and CONTRIBUTING describes an npm-only dev loop.
- `scripts/roadmap.py` stays, untested here but still run by CI's `action` job, until npx-ci-migration moves the action to Node and deletes it. Until then, rule changes wait, since only the TypeScript side would get them.
