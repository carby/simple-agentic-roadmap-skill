---
tags: [roadmap-skill, checking]
aliases: [roadmap.toml, Milestones, Refs]
---

# Configuration

`roadmap/roadmap.toml` holds the settings `check` needs beyond the item files.

## The pinned version

A repo that runs the global CLI pins the release it runs here. `roadmap init`
writes it when package.json doesn't pin the package, and `roadmap update`
moves it:

```toml
version = "2.1.0"
```

Every command warns when it runs a different release, and the GitHub Action
runs this one. It goes above the first `[table]`. A repo that pins the package
in package.json leaves it out.

## Refs to things other than files

By default a ref must name an existing file. For other ref kinds, declare each
kind as a path template:

```toml
[refs]
specs   = "openspec/specs/{}"
changes = ["openspec/changes/{}", "openspec/changes/archive/*-{}"]
```

## Milestones

Declare each one with a title and a date, then file items with
`--milestone beta` (due for it) or `--depends-on beta` (waits on it):

```toml
[milestones]
beta = { title = "Public beta", date = 2026-12-01 }
```

Keep a milestone after its date passes. `done.md` lists it, with the
archived items that were due for it. Once it is met, mark it so; it then
counts as done, like a shipped item, and the items that waited on it keep
naming it as history:

```toml
[milestones]
beta = { title = "Public beta", date = 2026-12-01, reached = 2026-12-03 }
```

`review` flags a passed milestone only while it isn't marked `reached` and an
open item still names it. `reached` needs release 2.2.0 or later; older ones
reject the key, so upgrade everyone, CI included, first.

How milestones relate to buckets and `depends_on` is in [Concepts](concepts.md).

---

Related: [Concepts](concepts.md) · [Rule tags](rule-tags.md) · [Home](index.md)
