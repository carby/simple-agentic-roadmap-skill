# Contributing

This file is for working on the skill itself. To *use* the skill in your
repo, see the [README](README.md).

The skill's own plans are in [`roadmap/`](roadmap/), kept with the skill
itself. The same rule applies here as everywhere: the maintainer is the
product owner. Pitch an idea in an issue before filing it as an item.
`npm run dogfood` symlinks `.claude/skills/roadmap` to this working copy, so
an agent session in this repo runs `/roadmap` with the rules as you are editing
them. `.claude/skills/` is gitignored, so run it once per clone.
`.gitattributes` merges `roadmap/README.md` and `done.md` with the skill's own
merge driver; turn it on in your clone with
`git config merge.roadmap.driver "node bin/roadmap.js merge-driver %O %A %B %P"`
(after `npm run build`).

## Running the tests

The test suite tests the CLI, the template, SKILL.md and the docs. It never
runs in a client's CI. Clients only run `check`, as described in
[Checking your roadmap](docs/checking.md).

It runs on Node's own test runner, `node:test`, with `node:assert`: no test
framework to install. The test files are TypeScript, which Node runs directly
from 22.18, so working on the skill needs Node 22.18 or later, though the CLI
itself runs on 22.0.

```bash
npm ci
npx biome ci . && npx tsc --noEmit
npm test                               # the full suite; it builds dist/ first
npm run build && node --test --test-name-pattern bucket test/rules.test.ts   # one rule's cases
```

Most tests run the built `bin/roadmap.js` as a subprocess, the way CI and
agents do, which is why `npm test` builds `dist/` first (`pretest`). Set
`ROADMAP_TEST_NODE` to another `node` binary to run those subprocesses on it.
Assertions come from `node:assert/strict`, plus `contains`, `excludes`,
`throwsWith` and `each` in `test/helpers.ts`. Code that writes to stdout is
tested in-process with `capture(t)`, called first in the test body, never in
a hook.

| File | Covers |
|---|---|
| `test/rules.test.ts` | one failing case per rule tag, plus what the rules deliberately allow. "every rule has a failing case" fails if a tag in `RULES` has no case. |
| `test/render.test.ts` | the generated index and done.md: order, grouping, splicing, the chart, and the golden fixture rendered in-process |
| `test/cli.test.ts` | the CLI as a subprocess: exit codes, stderr, `--dir`, usage errors, `new`, `move`, `close`, `decide`, `index --renumber` |
| `test/list-split.test.ts` | `list` and `split` |
| `test/workflow.test.ts` | `init → new → move → close` in a fresh repo, with `check` required to pass after every step, and link rewriting |
| `test/install.test.ts` | `init --tools` and `update`: the skill copies and their version stamp |
| `test/append-only.test.ts` | `check --base` against a real temporary git repo |
| `test/merge.test.ts` | two branches merged, with and without the merge driver |
| `test/review.test.ts` | `review`: passed milestones and stale items |
| `test/docs.test.ts` | SKILL.md, README.md, the `docs/` vault and this file: they name real commands and Action inputs, document every rule tag, and every relative link resolves |
| `test/py.test.ts` | the Python-compatible helpers the output depends on, with expected values printed by CPython |
| `test/action-spec.test.ts` | which package the GitHub Action runs: its input, the lockfile pin, the `package.json` range, its own version |

`test/fixtures/valid/` is a complete example roadmap. Its README.md and
done.md are the golden output of the renderer. If you change the rendering on
purpose, regenerate them with:

```bash
npm run build && node bin/roadmap.js index --dir test/fixtures/valid/roadmap
```

## Adding a rule

1. Add its tag to `RULES` in `src/model.ts`.
2. Implement it in `src/rules.ts`.
3. Add a failing case to `CASES` in `test/rules.test.ts`.
4. Add a row to the rule-tag table in `references/conventions.md`.

The tests fail until all four are done.

## CI

`.github/workflows/ci.yml` has two jobs:
- `node`: lint, types and the test suite above, then the CLI bundled the way
  `roadmap.zip` carries it, run against this repo's roadmap and the fixture.
  It runs twice: `latest` on the newest Node 22, and `floor`, where the tests
  that run the CLI as a subprocess, and the bundle, run on Node 22.0.0, the
  oldest that `engines` allows.
- `action`: runs the client-side check the way a consuming repo does, through
  `uses: ./`, with this commit packed into a tarball and passed as the action's
  `package` input. It checks the fixture, and it checks this repo's own
  `roadmap/` with `--base`.

## Releasing

Releases use two kinds of tag:
- a fixed `vX.Y.Z` tag for each release, which never moves
- a floating major tag, `v2`, which always points at the newest 2.x release.
  `v1` stays on the last 1.x release.

The tags serve the GitHub Action (`uses: carby/simple-agentic-roadmap-skill@v2`).
The skill and the CLI are installed from npm, where the repo's lockfile pins
the exact version.

```bash
# 1. Bump the version: `npm version 2.0.1 --no-git-tag-version` for
#    package.json and its lockfile, and VERSION in src/model.ts (a test fails
#    if those two differ).
#    Rename CHANGELOG.md's "Unreleased" heading to "2.0.1 — <date>" (a test
#    fails if the current version has no entry).
npm test && git commit -am "chore: release 2.0.1"

# 2. Tag the release and push it
git tag v2.0.1
git push github master v2.0.1

# 3. Publish the GitHub release; the workflow publishes to npm (see below)
gh release create v2.0.1 --title "v2.0.1: <summary>" --notes-file <notes>

# 4. Once the npm publish has finished, move the major tag, so a repo that
#    doesn't pin the package never gets a version that isn't on npm yet
git tag -f v2 v2.0.1
git push -f github v2                  # force: v2 already exists on the remote
```

Publishing the GitHub release runs `.github/workflows/release.yml`:
- `npm-publish` publishes the package through npm trusted publishing: no
  token, and npm adds provenance. It skips a version that is already on npm.
- `skill-zip` attaches `roadmap.zip`, the skill packaged for upload to the
  Claude app. `scripts/stage-zip.mjs` lays it out: a stamped `SKILL.md`,
  `LICENSE`, `references/`, `assets/`, and the CLI bundled into
  `scripts/roadmap.mjs` by `npm run bundle`. If the skill gains a directory
  the agent needs, add it there.

**The first publish was by hand,** because npm only lets you set up a trusted
publisher for a package that exists: `npm login && npm publish` (`prepack`
builds `dist/`), then, on npmjs.com, the package's settings → Trusted
publishing → GitHub Actions, with repository
`carby/simple-agentic-roadmap-skill` and workflow `release.yml`.

Bump the major version, e.g. to `v3.0.0` with a new `v3` tag, for any change
that breaks existing users:
- renaming or removing a command
- changing the frontmatter schema
- turning something `check` accepted into an error
- removing or renaming an Action input

Leave the old major tag on its last release.

`update` runs `check` straight after refreshing the skill, so a rule that
got stricter shows up as soon as someone upgrades. Say what changed about
the rules in CHANGELOG.md, under **Upgrade notes** or **Rules**, and in the
release notes. People read it before they bump the package.
