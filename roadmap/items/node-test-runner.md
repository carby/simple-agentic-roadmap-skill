+++
id = "node-test-runner"
title = "Test with node:test instead of vitest"
bucket = "next"
rank = 3
filed = 2026-11-02

[refs]
files = ["test/helpers.ts", "vitest.config.ts"]
+++

The suite runs on vitest, which puts a frontend build tool in the dev dependencies: vitest runs the `.ts` test files through vite (via `vite-node`). Nothing from it ships (the published package depends only on `smol-toml`), but the tree is about 60 packages for a CLI's tests, and it has already broken a dependency bump: Dependabot's #21 resolved vite 8, which wants a newer esbuild than the one the zip bundle uses, so `npm ci` failed. The bump went in by hand as #24.

No reason for vitest is recorded. It came in with [typescript-port](../archive/typescript-port.md) as the usual choice for TypeScript tests. The suite uses little of it: `expect` matchers (about 180 calls, mostly `toBe`, `toEqual` and `toContain`), `test.each`, `describe`, one `vi.spyOn` on stdout, `onTestFinished`, and a `globalSetup` that builds `dist/`. Node's built-in `node:test` and `node:assert` cover all of it. The code is already written for Node's type stripping (`erasableSyntaxOnly`, `.ts` import extensions), so Node 22.18+ runs the test files directly, with no loader.

Done looks like:
- `node --test` runs the suite, with assertions from `node:assert`; `npm test` is that command, and a `pretest` script builds `dist/` for the subprocess tests.
- vitest, and with it vite and vite-node, are gone from `package.json` and the lockfile, along with `vitest.config.ts` and `test/global-setup.ts`.
- The CI job on Node 22.0.0, which predates type stripping, still holds the `engines` floor by running the built CLI and the bundle; the suite itself runs on the newest 22.
- Planted bugs still fail tests, as they did for [vitest-suite](../archive/vitest-suite.md).
