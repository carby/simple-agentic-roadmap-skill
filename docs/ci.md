---
tags: [roadmap-skill, checking]
aliases: [Continuous integration, GitHub Action]
---

# CI

Run `check` (see [Checking your roadmap](checking.md)) on every push or PR.
Pick one of these.

## GitHub Actions, using this repo's action

It runs your vendored `tools/roadmap.py`, or falls back to the copy bundled
with the action:

```yaml
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0                       # only needed for `base`
      - uses: carby/simple-agentic-roadmap-skill@v1
        with:
          dir: roadmap
          base: origin/${{ github.base_ref }}  # PRs only: holds archive/ append-only
```

The floating `@v1` tag follows new releases; see [Upgrading](upgrading.md).

## GitHub Actions without the action, or any other CI

```yaml
      - run: python tools/roadmap.py check
```

## GitLab CI

```yaml
roadmap:
  image: python:3.12-slim
  script:
    - python tools/roadmap.py check
```

## pre-commit

In `.pre-commit-config.yaml`:

```yaml
  - repo: local
    hooks:
      - id: roadmap
        name: roadmap check
        entry: python tools/roadmap.py check
        language: system
        pass_filenames: false
        files: ^roadmap/
```

---

Related: [Checking your roadmap](checking.md) · [Rule tags](rule-tags.md) · [Home](index.md)
