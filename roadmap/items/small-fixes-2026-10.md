+++
id = "small-fixes-2026-10"
title = "Small fixes to docs, templates and defaults"
bucket = "now"
rank = 8
filed = 2026-10-22
+++

Small things found in a review of the skill on 2026-10-22, collected in one item:
- roadmap/README.md says "a missing feature such as dependencies, hierarchy or dates is just a difference". Dependencies and dates (milestones) exist now, so the sentence is stale.
- The frontmatter examples in roadmap/README.md and assets/template/README.md leave out `milestone`, so a new repo gets an incomplete reference.
- The tool never sets `updated`. `move`, and a move out of `later` above all, is when an item is re-argued, so it could set it.
- `close --outcome shipped` without `--as` is allowed. Suggesting the change or PR name would make the archive more useful.
- SKILL.md's description mentions neither milestones nor OpenSpec, so a question like "what has to be done for beta?" may not trigger the skill.
