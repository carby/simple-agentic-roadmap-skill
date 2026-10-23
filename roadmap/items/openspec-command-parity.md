+++
id = "openspec-command-parity"
title = "Survey OpenSpec's CLI commands for ones the roadmap lacks"
bucket = "next"
rank = 1
filed = 2026-10-23
depends_on = ["npm-installer"]
+++

OpenSpec's CLI has commands the roadmap may lack. `list` and `split` already shipped (#13), and `check` and `close` cover roughly what `validate` and `archive` do, but `show`, `view` and anything else in its command set haven't been compared.

Once the npm installer exists, the roadmap has a CLI surface that sits next to OpenSpec's, and gaps will show. Done looks like a short comparison in this item's prose and a pitch for each command worth adding, each filed as its own item. Commands that don't fit KISS are recorded here as rejected, with the reason. This item doesn't build any of them.
