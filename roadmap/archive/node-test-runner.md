+++
id = "node-test-runner"
title = "Test with node:test instead of vitest"
filed = 2026-11-02
closed = 2026-11-02
outcome = "shipped"
shipped_as = "#25"

[refs]
files = ["test/helpers.ts", "package.json"]
+++

The suite runs on vitest, which puts a frontend build tool in the dev dependencies: vitest runs the `.ts` test files through vite (via `vite-node`). Nothing from it ships (the published package depends only on `smol-toml`), but the tree is about 60 packages for a CLI's tests, and it has already broken a dependency bump: Dependabot's #21 resolved vite 8, which wants a newer esbuild than the one the zip bundle uses, so `npm ci` failed. The bump went in by hand as #24.

No reason for vitest is recorded. It came in with [typescript-port](../archive/typescript-port.md) as the usual choice for TypeScript tests. The suite uses little of it: `expect` matchers (about 180 calls, mostly `toBe`, `toEqual` and `toContain`), `test.each`, `describe`, one `vi.spyOn` on stdout, `onTestFinished`, and a `globalSetup` that builds `dist/`. Node's built-in `node:test` and `node:assert` cover all of it. The code is already written for Node's type stripping (`erasableSyntaxOnly`, `.ts` import extensions), so Node 22.18+ runs the test files directly, with no loader.

Done looks like:
- `node --test` runs the suite, with assertions from `node:assert`; `npm test` is that command, and a `pretest` script builds `dist/` for the subprocess tests.
- vitest, and with it vite and vite-node, are gone from `package.json` and the lockfile, along with `vitest.config.ts` and `test/global-setup.ts`.
- The CI job on Node 22.0.0, which predates type stripping, still holds the `engines` floor by running the built CLI and the bundle; the suite itself runs on the newest 22.
- Planted bugs still fail tests, as they did for [vitest-suite](../archive/vitest-suite.md).

**Outcome:** shipped in #25. `npm test` runs `node --test`, vitest and its 55 packages are gone, and the 265 tests keep their names. What the work corrected:
- Swapping vitest's stdout spy for subprocesses would have meant rewriting the install tests, whose every path is relative to their `chdir`. A JS-testing review measured instead that mocking stdout inside a test body is safe under `node --test`, while mocking it in a hook can lose the runner's own output. So `capture(t)` mocks in the body.
- Node 22.0.0 can't load `.ts` tests, so CI's floor run keeps the suite on the newest 22 and points the CLI subprocesses at 22.0.0 (`ROADMAP_TEST_NODE`).
- The planted rendering bug fails 12 tests, not the 14 noted in [vitest-suite](../archive/vitest-suite.md). vitest fails the same 12 on today's master, because #23 removed 2 duplicate tests.
