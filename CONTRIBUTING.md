# Contributing

This file is for working on the skill itself. To *use* the skill in your
repo, see the [README](README.md).

The skill's own plans are in [`roadmap/`](roadmap/), kept with the skill
itself. The same rule applies here as everywhere: the maintainer is the
product owner. Pitch an idea in an issue before filing it as an item.

**`scripts/roadmap.py` must stay stdlib-only.** `init` vendors it into other
repos, which must not need to install anything to run it.

## Running the tests

The pytest suite tests the tool, the template, SKILL.md and the docs. It
never runs in a client's CI. Clients only run `roadmap.py check`, as described
in [Checking your roadmap](docs/checking.md).

```bash
uv sync                                        # dev deps: pytest, ruff
uv run pytest                                  # the full suite
uv run pytest tests/test_rules.py -k bucket    # one rule's cases
uv run ruff check . && uv run ruff format --check .
```

| File | Covers |
|---|---|
| `tests/test_rules.py` | one failing case per rule tag, plus what the rules deliberately allow. `test_every_rule_has_a_failing_case` fails if a tag in `RULES` has no case. |
| `tests/test_render.py` | the generated index and done.md: order, grouping, splicing |
| `tests/test_cli.py` | the script as a subprocess: exit codes, stderr, `--dir`, usage errors |
| `tests/test_workflow.py` | `init → new → move → close` in a fresh repo, with `check` required to pass after every step, and link rewriting; `upgrade` and the drift warning |
| `tests/test_append_only.py` | `check --base` against a real temporary git repo |
| `tests/test_skill.py` | SKILL.md frontmatter; every command the agent docs name exists; every rule tag documented; the dogfood roadmap is clean |
| `tests/test_readme.py` | README.md, the `docs/` vault and this file: the right notes and sections exist, they name real commands and Action inputs, and every relative link resolves |

`tests/fixtures/valid/` is a complete example roadmap. Its README.md and
done.md are the golden output of the renderer. If you change the rendering on
purpose, regenerate them with:

```bash
python scripts/roadmap.py index --dir tests/fixtures/valid/roadmap
```

## Adding a rule

1. Add its tag to `RULES` in `scripts/roadmap.py`.
2. Implement it.
3. Add a failing case to `CASES` in `tests/test_rules.py`.
4. Add a row to the rule-tag table in `references/conventions.md`.

The tests fail until all four are done.

## CI

`.github/workflows/ci.yml` has two jobs:
- `test`: runs the suite above on Python 3.11 to 3.14.
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
# 1. Bump the version in both places (a test fails if they differ):
#    __version__ in scripts/roadmap.py, and version in pyproject.toml.
#    Rename CHANGELOG.md's "Unreleased" heading to "1.0.1 — <date>" (a test
#    fails if the current version has no entry).
uv lock && uv run pytest && git commit -am "chore: release 1.0.1"

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
