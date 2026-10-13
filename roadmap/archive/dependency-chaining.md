+++
id = "dependency-chaining"
title = "Dependency chaining between items"
filed = 2026-09-25
closed = 2026-10-13
outcome = "shipped"
+++

An item would name the items it waits on, e.g. a `depends_on` list of ids. `check` would reject cycles and dangling ids, and the index could show what is unblocked.

Of the three structure ideas this is the cheapest. It fits the existing checker as one more ref kind, pointing at item ids instead of files. Today dependency order lives in the agent's bucket suggestion and in the prose, and a human confirms it. Making it a field would let `check` enforce it, at the cost of one more field everyone has to keep correct.

**Decided 2026-10-13:** the roadmap records dependencies. `depends_on` is a list of ids, and a new `depends` rule holds each dependency ahead of the item: in an earlier bucket, or higher in the same one. Three further choices:
- A `later` item that depends on another `later` item counts as blocked by it, and may leave out `blocked_on`.
- Depending on a declined item fails `check`, so the dependent item gets re-argued. `close --outcome declined` refuses while anything still depends on the item.
- `move` lands an item just above its first dependent in the target bucket and shifts the rest down, rather than at the bottom. `new`, `move` and `close` refuse, writing nothing, when the result would break `bucket` or `depends`.

It was implemented as decided. Rather than being a ref kind, `depends_on` is a top-level field, because it resolves against items rather than paths and has to tell open items from archived ones.
