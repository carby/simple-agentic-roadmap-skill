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

`scripts/roadmap.py` is the Python CLI that 1.x releases vendor, and what the
Action still runs. It is frozen: rules change only in `src/` until
[npx-ci-migration](roadmap/items/npx-ci-migration.md) moves the Action to Node
and deletes it.

## Running the tests

The vitest suite tests the CLI, the template, SKILL.md and the docs. It never
runs in a client's CI. Clients only run `check`, as described in
[Checking your roadmap](docs/checking.md).

```bash
npm ci
npx biome ci . && npx tsc --noEmit
npx vitest run                         # the full suite; it builds dist/ first
npx vitest run test/rules.test.ts -t bucket   # one rule's cases
```

Most tests run the built `bin/roadmap.js` as a subprocess, the way CI and
agents do, so `test/global-setup.ts` runs `npm run build` before the suite.

| File | Covers |
|---|---|
| `test/rules.test.ts` | one failing case per rule tag, plus what the rules deliberately allow. "every rule has a failing case" fails if a tag in `RULES` has no case. |
| `test/render.test.ts` | the generated index and done.md: order, grouping, splicing, the chart |
| `test/cli.test.ts` | the CLI as a subprocess: exit codes, stderr, `--dir`, usage errors, `new`, `move`, `close`, `decide`, `index --renumber` |
| `test/list-split.test.ts` | `list` and `split` |
| `test/workflow.test.ts` | `init → new → move → close` in a fresh repo, with `check` required to pass after every step, and link rewriting |
| `test/install.test.ts` | `init --tools` and `update`: the skill copies and their version stamp |
| `test/append-only.test.ts` | `check --base` against a real temporary git repo |
| `test/merge.test.ts` | two branches merged, with and without the merge driver |
| `test/review.test.ts` | `review`: passed milestones and stale items |
| `test/docs.test.ts` | SKILL.md, README.md, the `docs/` vault and this file: they name real commands and Action inputs, document every rule tag, and every relative link resolves |
| `test/py.test.ts`, `test/port.test.ts` | the Python-compatible helpers the output depends on, and the golden fixture rendered in-process |

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
- `node`: lint, types and the vitest suite above.
- `action`: runs the client-side check the way a consuming repo does, through
  `uses: ./`. It checks the fixture, and it checks this repo's own `roadmap/`
  with `--base`.

## Releasing

Releases use two kinds of tag:
- a fixed `vX.Y.Z` tag for each release, which never moves
- a floating major tag, `v1`, which always points at the newest 1.x release

The README tells users `uses: carby/simple-agentic-roadmap-skill@v1`, so every
compatible release moves `v1` forward. It installs the skill itself differently:
as a submodule pinned to the newest fixed `vX.Y.Z` tag, which `v1` must never
stand in for, because a pin that moves is not a pin.

```bash
# 1. Bump the version: `npm version 1.0.1 --no-git-tag-version` for
#    package.json and its lockfile, and VERSION in src/model.ts (a test fails
#    if those two differ). Until 2.0.0, also __version__ in
#    scripts/roadmap.py, which the Action runs.
#    Rename CHANGELOG.md's "Unreleased" heading to "1.0.1 — <date>" (a test
#    fails if the current version has no entry).
npx vitest run && git commit -am "chore: release 1.0.1"

# 2. Tag the release and move the major tag onto it
git tag v1.0.1
git tag -f v1 v1.0.1
git push github master v1.0.1
git push -f github v1                  # force: v1 already exists on the remote
```

Publishing the GitHub release runs `.github/workflows/release.yml`, which
attaches `roadmap.zip`, the skill packaged for upload to the Claude app. It
holds `SKILL.md`, `LICENSE`, `references/`, `scripts/` and `assets/`; if the
skill gains a directory the agent needs, add it to the workflow's
`git archive` line.

Bump the major version, e.g. to `v2.0.0` with a new `v2` tag, for any change
that breaks existing users:
- renaming or removing a command
- changing the frontmatter schema
- turning something `check` accepted into an error

Leave `v1` on the last 1.x release.

`upgrade` runs `check` straight after replacing a vendored copy, so a rule
that got stricter shows up as soon as someone upgrades. Say what changed about
the rules in CHANGELOG.md, under **Upgrade notes** or **Rules**, and in the
release notes. People read it before they move their pin.
