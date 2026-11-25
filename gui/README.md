# roadmap GUI

A graphical client for the roadmap, modelled on gitk: launched from inside a
repo, it shows that repo's `roadmap/` as a queue with dependency lanes, and
pages for each item and milestone. It reads and writes only through the
`roadmap` CLI in [`../cli/`](../cli/README.md), and never commits.

Nothing is built yet. The work is planned in the repo's
[roadmap](../roadmap/README.md), starting with `gui-scaffold`, for the
`gui-preview` milestone.
