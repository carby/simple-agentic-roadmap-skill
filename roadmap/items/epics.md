+++
id = "epics"
title = "Epics: parent items that group others"
bucket = "later"
rank = 3
filed = 2026-09-25
blocked_on = "whether the roadmap grows past KISS to have a hierarchy of items"
+++

A parent item would group several smaller ones, and would close when all of them have.

That adds a hierarchy to what is now a flat list per bucket. It raises questions the flat list never has to answer: can children sit in different buckets from their parent, what does `done.md` show for a half-finished epic, and does closing a parent close its children? It probably builds on [dependency chaining](dependency-chaining.md), since an epic is roughly an item that depends on all of its children.
