+++
id = "agent-behaviour-evals"
title = "Evals for how an agent uses the skill, not just for the script"
bucket = "now"
rank = 6
filed = 2026-09-25
updated = 2026-10-22
+++

The test suite proves the script enforces every rule. It cannot prove that an
agent loading SKILL.md *follows* the conventions. Examples of what it can't see:
- searching done.md before proposing a cleanup,
- refusing to close a scaffolded item,
- adding an annotation to an archived entry rather than editing it.

skill-creator style evals could test that behaviour: give the agent a fixture
roadmap and a prompt, then grade the transcript.

What is undecided is where these run. In CI they cost money on every push and
give nondeterministic results, which invites flaky-test fatigue. On demand
they are cheap, but they rot silently. The suite for the script itself is
unaffected either way.

**2026-10-22:** moved to Now. The proposed way to settle where they run: start on demand, with a handful of scenarios (search done.md first, refuse to close a scaffolded item, ask before choosing a bucket, annotate an archived entry instead of editing it), run before each release. Running them in CI stays open. These matter because hard rules 0, 3, 4, 5 and 7 hold only as long as the agent follows them.
