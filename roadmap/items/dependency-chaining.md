+++
id = "dependency-chaining"
title = "Dependency chaining between items"
bucket = "later"
rank = 2
filed = 2026-09-25
blocked_on = "whether the roadmap grows past KISS to record dependencies, instead of leaving them to prose and bucket order"
+++

An item would name the items it waits on, e.g. a `depends_on` list of ids. `check` would reject cycles and dangling ids, and the index could show what is unblocked.

Of the three structure ideas this is the cheapest. It fits the existing checker as one more ref kind, pointing at item ids instead of files. Today dependency order lives in the agent's bucket suggestion and in the prose, and a human confirms it. Making it a field would let `check` enforce it, at the cost of one more field everyone has to keep correct.
