---
tags: [roadmap-skill, checking]
aliases: [Reading a failure, Failures]
---

# Rule tags

When [`check`](checking.md) fails, each line looks like `path[:line]: message [tag]`,
and the tag names the rule that failed:

| Tag | What's wrong |
|---|---|
| `[frontmatter]`, `[schema]` | an item's `+++` header is missing or broken, or has missing or unknown fields |
| `[bucket]` | the item's fields don't fit its bucket (e.g. a `later` item without `blocked_on`) |
| `[depends]` | a dependency or milestone doesn't exist, was declined, or doesn't come first (earlier bucket, or higher rank) |
| `[rank]`, `[dates]`, `[ids]` | a duplicate rank, a quoted date, or an id used twice |
| `[body]` | the item has no prose (`new` leaves a placeholder you have to replace) |
| `[refs]`, `[links]` | a ref or a relative link points at a file that doesn't exist |
| `[generated]` | the lists in README.md or done.md are out of date: run `index` |
| `[append-only]` | an archived entry was changed or deleted (only with `--base`) |
| `[config]` | `roadmap.toml` is invalid |

[`references/conventions.md`](../references/conventions.md#rule-tags) gives each
rule in full, with its usual fix.

---

Related: [Checking your roadmap](checking.md) · [Configuration](configuration.md) · [Home](index.md)
