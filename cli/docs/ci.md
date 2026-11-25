---
tags: [roadmap-skill, checking]
aliases: [Continuous integration, GitHub Action]
---

# CI

Run `check` (see [Checking your roadmap](checking.md)) on every push or PR.
Pick one of these.

## GitHub Actions, using this repo's action

It runs the version your repo pins, so CI checks with the same rules as
everyone else: the exact version in `package-lock.json`, else a plain semver
range in `package.json`, else the `version` in `roadmap.toml` (in the `dir` you
pass), and only then the action's own version.
It reads only npm's lockfile; with pnpm or yarn it uses the range in
`package.json`. It sets up Node itself unless the runner already has Node 22 or
newer.

```yaml
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0                       # only needed for `base`
      - uses: carby/simple-agentic-roadmap-skill@v2
        with:
          dir: roadmap
          base: origin/${{ github.base_ref }}  # PRs only: holds archive/ append-only
```

The floating `@v2` tag follows new 2.x releases of the action; the rules it
checks with still come from your pin. See [Upgrading](upgrading.md).

## GitHub Actions without the action, or any other CI

In a repo that pins the package as a dev dependency, after `npm ci`:

```yaml
      - run: npx --no -- roadmap check
```

The `--no --` keeps npx from installing the unrelated `roadmap` package on npm
if this one is missing.

In a repo that pins it in `roadmap.toml`, name the same version:

```yaml
      - run: npx --yes --package=simple-agentic-roadmap-skill@2.1.0 -- roadmap check
```

`roadmap update` moves the pin in `roadmap.toml` but doesn't touch CI files,
so bump the version here in the same commit.

### When the CI image has no Node

A Python or other non-Node image can't run `npx`. Run the check as its own
job or step on a `node:22` image (or with your CI's Node setup step), so the
rest of the pipeline keeps its image:

```yaml
# GitLab CI; the same shape works in Bitbucket Pipelines
roadmap:
  image: node:22
  script:
    - npm ci
    - npx --no -- roadmap check
```

If the repo has no `package.json`, drop `npm ci` and run the version
`roadmap.toml` pins with `npx --yes --package=simple-agentic-roadmap-skill@<version> -- roadmap check`,
as above.

## GitLab CI

```yaml
roadmap:
  image: node:22
  script:
    - npm ci
    - npx --no -- roadmap check
```

## pre-commit

In `.pre-commit-config.yaml`:

```yaml
  - repo: local
    hooks:
      - id: roadmap
        name: roadmap check
        entry: npx --no -- roadmap check
        language: system
        pass_filenames: false
        files: ^roadmap/
```

---

Related: [Checking your roadmap](checking.md) · [Rule tags](rule-tags.md) · [Home](index.md)
