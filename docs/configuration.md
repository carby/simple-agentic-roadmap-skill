---
tags: [roadmap-skill, checking]
aliases: [roadmap.toml, Milestones, Refs]
---

# Configuration

`roadmap/roadmap.toml` holds the settings `check` needs beyond the item files.

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

How milestones relate to buckets and `depends_on` is in [Concepts](concepts.md).

---

Related: [Concepts](concepts.md) · [Rule tags](rule-tags.md) · [Home](index.md)
