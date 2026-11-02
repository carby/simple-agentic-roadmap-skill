---
tags: [roadmap-skill, checking]
aliases: [Continuous integration, GitHub Action]
---

# CI

Run `check` (see [Checking your roadmap](checking.md)) on every push or PR.
Pick one of these.

## GitHub Actions, using this repo's action

It runs the version your `package-lock.json` pins, so CI checks with the same
rules as everyone's `npx --no -- roadmap`. Without a pin it falls back to a
plain semver range in `package.json`, and then to the action's own version.
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

After `npm ci`:

```yaml
      - run: npx --no -- roadmap check
```

The `--no --` keeps npx from installing the unrelated `roadmap` package on npm
if this one is missing.

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
