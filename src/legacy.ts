/** Text that older templates wrote into a roadmap and today's no longer
 * does, frozen so migrations can recognise it exactly. Never edit an entry,
 * since migrations match them byte for byte. When a release changes the
 * template, append the outgoing text here; a test fails if today's template
 * text appears among them.
 *
 * Generated once from `git show <tag>:assets/template/` for 1.0.0, 1.1.0
 * (unchanged through 1.3.1) and 1.4.0 (unchanged in 1.5.0). README sections
 * are stored the way the `cli-command` migration leaves them, with
 * `npx --no -- roadmap` in place of `python <script>`, and with the parts a
 * user owns replaced by the masks below. */

/** What stands in for README.md's generated index when sections are compared. */
export const INDEX_MASK = "<!-- INDEX -->";

/** What stands in for the guiding-principle paragraph, which every user is
 * asked to rewrite. */
export const GUIDING_MASK = "<!-- GUIDING PRINCIPLE -->";

/** README.md sections an older template wrote, keyed by their heading line.
 * Each runs from its heading to the line before the next heading. */
export const README_SECTIONS: Record<string, readonly string[]> = {
  "# Roadmap": [
    `# Roadmap

The Now/Next/Later queue of open work, kept KISS: Markdown files in three
buckets, and nothing more. Each item is one file under
[\`items/\`](items/). The index below is **generated** from those files by
\`npx --no -- roadmap\`, so don't edit it by hand.

Closed items, whether shipped or measured and declined, move to
[\`archive/\`](archive/). [\`done.md\`](done.md) is their one-line-per-item index.
**Search \`done.md\` before proposing work.** It answers "has this been tried?"

<!-- GUIDING PRINCIPLE -->
`,
  ],
  "## The buckets": [
    `## The buckets

| Bucket | What it means | Enforced as |
|---|---|---|
| **Now** | The top priority, the way a planned sprint is. It is *not* "being worked on right now". | no \`blocked_on\` |
| **Next** | Ready, and queued to follow once Now is done. | no \`blocked_on\` |
| **Later** | Blocked on a *decision*, not on effort. Size or lack of scoping doesn't put an item here. Being **undecided** does. | \`blocked_on\` required |

\`rank\` orders items within a bucket, most valuable first, and is unique within
its bucket. When an item depends on another, the one it depends on goes first:
either in an earlier bucket or higher in the same one. People decide the
bucket. An agent may suggest one, but it asks before filing.

The roadmap doesn't track who is working on what, because that would take a
commit every time work starts or stops. An item stays where it is until the
work is done. **Close it in the same branch as the code**, so it moves to
\`done.md\` when that code merges.
`,
  ],
  "## Working on this": [
    `## Working on this

\`\`\`bash
npx --no -- roadmap new <id> --title "..." --bucket now   # file an item
npx --no -- roadmap move <id> --bucket now                # reprioritise (lands at the bottom of the bucket)
npx --no -- roadmap close <id> --outcome shipped --as <change-or-pr>   # in the same branch as the code
npx --no -- roadmap index                                 # regenerate this index and done.md
npx --no -- roadmap check                                 # what CI runs
\`\`\`

\`check\` runs in CI, so a broken roadmap fails the build instead of rotting.
It checks that:
- every item's frontmatter is well-formed TOML carrying only known fields
- each bucket's entry criterion actually holds
- every \`refs\` entry and every relative link resolves in the tree
- this index and \`done.md\` match what the generator renders
`,
    `## Working on this

\`\`\`bash
npx --no -- roadmap new <id> --title "..." --bucket now   # file an item
npx --no -- roadmap move <id> --bucket now                # reprioritise (lands above its dependents, else at the bottom)
npx --no -- roadmap close <id> --outcome shipped --as <change-or-pr>   # in the same branch as the code
npx --no -- roadmap index                                 # regenerate this index and done.md
npx --no -- roadmap check                                 # what CI runs
\`\`\`

\`check\` runs in CI, so a broken roadmap fails the build instead of rotting.
It checks that:
- every item's frontmatter is well-formed TOML carrying only known fields
- each bucket's entry criterion actually holds
- every dependency exists, wasn't declined, and comes first
- every \`refs\` entry and every relative link resolves in the tree
- this index and \`done.md\` match what the generator renders
`,
  ],
  "### Closing is not scaffolding": [
    `### Closing is not scaffolding

Only close an item once the work is **implemented or declined**. Turning an item
into a design doc or a change proposal does not take it out of the queue. What
scaffolding earns is an edit to the item itself, in place:
- **Split it** if it turned out to be two pieces of work.
- **Restate the \`gate\`** as whatever the work still has to clear.
- **Record what the analysis corrected**, especially where the item's own
  earlier reasoning turned out to be wrong.
- Leave \`bucket\` alone. Scaffolding changes what is known, not the priority.
`,
  ],
  "### The archive is append-only": [
    `### The archive is append-only

Once closed, an entry is never edited again. The one exception is a dated
annotation, added as new lines, marking a claim that later events falsified.
\`check --base origin/main\` enforces this in pull requests.
`,
  ],
  "### Frontmatter": [
    `### Frontmatter

\`\`\`toml
+++
id = "matches-the-filename"
title = "One line, rendered into the index"
bucket = "now"          # now | next | later
rank = 1                # unique within the bucket, most valuable first
filed = 2026-09-06      # a bare TOML date, not a string
updated = 2026-09-06    # optional; when the item was last re-argued
gate = "..."            # optional; the bar the work has to clear
blocked_on = "..."      # required for \`later\`, forbidden elsewhere

[refs]                  # optional; each entry is checked to exist
files = ["src/app.py"]  # other kinds are declared in roadmap.toml
+++
\`\`\`

\`close\` removes \`bucket\`, \`rank\` and \`blocked_on\`, and adds
\`closed = <date>\`, \`outcome = "shipped" | "declined"\`, and optionally
\`shipped_as = "..."\`.
`,
    `### Frontmatter

\`\`\`toml
+++
id = "matches-the-filename"
title = "One line, rendered into the index"
bucket = "now"          # now | next | later
rank = 1                # unique within the bucket, most valuable first
filed = 2026-09-06      # a bare TOML date, not a string
updated = 2026-09-06    # optional; when the item was last re-argued
gate = "..."            # optional; the bar the work has to clear
blocked_on = "..."      # required for \`later\` (unless a dependency is), forbidden elsewhere
depends_on = ["other"]  # optional; ids that must come first (keep it above [refs])

[refs]                  # optional; each entry is checked to exist
files = ["src/app.py"]  # other kinds are declared in roadmap.toml
+++
\`\`\`

\`close\` removes \`bucket\`, \`rank\` and \`blocked_on\`, and adds
\`closed = <date>\`, \`outcome = "shipped" | "declined"\`, and optionally
\`shipped_as = "..."\`.
`,
  ],
};

/** decisions.md intros: everything above its first `## ` entry. */
export const DECISIONS_INTROS: readonly string[] = [
  // 1.4.0 to 1.5.0
  `# Decisions

Decisions that belong to no single item: conventions, architecture choices,
things this project doesn't do. A decision about one item goes in that item's
prose instead. **Search this file and \`done.md\` before proposing work.**

Record a decision with \`roadmap.py decide\`. Entries are appended oldest first,
and the file is **append-only**: \`check --base\` fails on a changed or removed
line. To reverse a decision, record a new one that says so.
`,
  // 2.0.0 to 2.0.1
  `# Decisions

Decisions that belong to no single item: conventions, architecture choices,
things this project doesn't do. A decision about one item goes in that item's
prose instead. **Search this file and \`done.md\` before proposing work.**

Record a decision with \`npx --no -- roadmap decide\`. Entries are appended
oldest first, and the file is **append-only**: \`check --base\` fails on a
changed or removed line. To reverse a decision, record a new one that says so.
`,
];
