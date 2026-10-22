"""README.md and the docs/ vault are what a person adopting the skill reads.
Their client-side and developer-side instructions must name real commands and
real Action inputs, and their links must resolve."""

from __future__ import annotations

import re

from conftest import REPO, roadmap
from test_skill import COMMANDS

README = (REPO / "README.md").read_text()
DOCS = REPO / "docs"
# README.md is the anchor outside the vault; every note it links to is in docs/.
PAGES = {"README.md": README} | {f"docs/{p.name}": p.read_text() for p in sorted(DOCS.glob("*.md"))}
USER_DOCS = "\n".join(PAGES.values())


def section(title: str) -> str:
    match = re.search(rf"^## {re.escape(title)}\n(.*?)(?=^## |\Z)", README, re.MULTILINE | re.DOTALL)
    assert match, f"README.md has no '## {title}' section"
    return match.group(1)


def doc(name: str) -> str:
    path = DOCS / name
    assert path.is_file(), f"docs/{name} is missing"
    return path.read_text()


def test_client_checks_are_in_the_readme_and_developer_tests_in_contributing() -> None:
    contributing = (REPO / "CONTRIBUTING.md").read_text()

    assert "roadmap.py check" in doc("checking.md")
    assert "uv run pytest" in contributing and "uv run pytest" not in USER_DOCS
    assert "CONTRIBUTING.md" in section("Contributing")


def test_every_command_the_docs_and_contributing_name_exists() -> None:
    for name, text in {"user docs": USER_DOCS, "CONTRIBUTING.md": (REPO / "CONTRIBUTING.md").read_text()}.items():
        named = set(re.findall(r"roadmap\.py (?:--dir \S+ )?([a-z]+(?:-[a-z]+)*)", text))

        assert named, f"{name} names no commands; the regex is out of date"
        assert named <= COMMANDS, f"{name} names {named - COMMANDS}"


def test_every_action_input_the_readme_uses_exists() -> None:
    action = (REPO / "action.yml").read_text()
    inputs = set(re.findall(r"^  ([a-z-]+):$", action.split("runs:")[0], re.MULTILINE))
    used = set()
    for block in re.findall(r"uses: \S*roadmap-skill@\S+\n\s+with:\n((?:\s{10,}\S.*\n)+)", USER_DOCS):
        used |= set(re.findall(r"^\s+([a-z-]+):", block, re.MULTILINE))

    assert used, "the docs show no `uses: ...roadmap-skill@...` step with inputs"
    assert used <= inputs, f"the docs use Action inputs {used - inputs} that action.yml lacks"


def test_the_rule_tags_note_points_at_the_rule_table() -> None:
    assert "references/conventions.md" in doc("rule-tags.md")


def test_every_rule_tag_is_explained_in_the_docs() -> None:
    tags = doc("rule-tags.md")
    for tag in roadmap.RULES:
        assert f"`[{tag}]`" in tags, f"docs/rule-tags.md's failure table does not explain [{tag}]"


def test_every_slash_command_the_readme_advertises_is_handled_by_the_skill() -> None:
    advertised = set(re.findall(r"^\| `/roadmap ([a-z]+)", section("Slash commands"), re.MULTILINE))
    handled = set(re.findall(r"^\| `([a-z]+)[` ]", (REPO / "SKILL.md").read_text(), re.MULTILINE))

    assert advertised, "README.md's slash-command table is empty or the regex is out of date"
    assert advertised <= handled, f"SKILL.md does not say what to do for /roadmap {advertised - handled}"


def test_every_install_snippet_pins_the_skill_to_a_release() -> None:
    """An unpinned clone is how a skill drifts, so no snippet may show one."""
    blocks = re.findall(r"```bash\n(.*?)```", USER_DOCS, re.DOTALL)
    installs = [b for b in blocks if re.search(r"git (clone|submodule add) \S*simple-agentic-roadmap-skill", b)]

    assert installs, "the docs show no install snippet; the regex is out of date"
    for block in installs:
        assert "checkout" in block and "describe --tags" in block, f"this install snippet is not pinned:\n{block}"


def test_the_docs_tell_users_to_make_the_skill_a_visible_requirement() -> None:
    for name, install in {"README.md": section("Quick start"), "docs/install.md": doc("install.md")}.items():
        assert "CLAUDE.md" in install, name
        assert "If the skill isn't available" in install, (
            f"{name}: the CLAUDE.md snippet must say what to do without the skill"
        )


def test_the_readme_links_every_note_in_the_vault() -> None:
    linked = set(re.findall(r"\]\(docs/([^)#]+\.md)", README))
    notes = {p.name for p in DOCS.glob("*.md")}

    assert notes <= linked, f"README.md does not link docs/{sorted(notes - linked)}"


def test_every_relative_link_in_the_docs_resolves() -> None:
    """Markdown links only: GitHub doesn't render Obsidian [[wikilinks]]."""
    for name, text in PAGES.items():
        prose = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
        assert "[[" not in prose, f"{name} uses a [[wikilink]]; use a Markdown link"
        for target in re.findall(r"\]\(([^)\s]+)\)", prose):
            if re.match(r"[a-z]+:", target) or target.startswith("#"):
                continue
            path = (REPO / name).parent / target.split("#")[0]
            assert path.exists(), f"{name} links {target}, which doesn't exist"


def test_the_changelog_has_an_entry_for_the_current_version() -> None:
    changelog = (REPO / "CHANGELOG.md").read_text()

    assert re.search(rf"^## {re.escape(roadmap.__version__)} — \d{{4}}-\d{{2}}-\d{{2}}$", changelog, re.MULTILINE), (
        f"CHANGELOG.md has no '## {roadmap.__version__} — <date>' entry; rename Unreleased when releasing"
    )
