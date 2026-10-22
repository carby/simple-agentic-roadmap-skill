"""SKILL.md and its references are what an agent reads, so they can't be allowed
to drift from the tool: every command they name must exist, and every rule tag
must be documented."""

from __future__ import annotations

import re
import tomllib

from conftest import REPO, roadmap

COMMANDS = set(roadmap.build_parser()._subparsers._group_actions[0].choices)
AGENT_DOCS = [REPO / "SKILL.md", REPO / "references/conventions.md", REPO / "assets/template/README.md"]


def frontmatter(text: str) -> dict:
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    assert match, "SKILL.md must open with ---fenced frontmatter"
    top_level = [line for line in match.group(1).splitlines() if ": " in line and not line.startswith(" ")]
    return dict(line.split(": ", 1) for line in top_level)


def test_skill_frontmatter_names_and_describes_the_skill() -> None:
    meta = frontmatter((REPO / "SKILL.md").read_text())

    assert meta["name"] == "roadmap"
    assert len(meta["description"]) > 100, "the description is what makes an agent load the skill"


def test_every_command_the_docs_name_exists() -> None:
    for doc in AGENT_DOCS:
        named = set(re.findall(r"roadmap\.py (?:--dir \S+ )?([a-z]+(?:-[a-z]+)*)", doc.read_text()))
        named |= set(re.findall(r"\{\{script\}\} ([a-z]+(?:-[a-z]+)*)", doc.read_text()))
        assert named or doc.name == "conventions.md", f"{doc.name} names no commands; the regex is out of date"
        assert named <= COMMANDS, f"{doc.name} names {named - COMMANDS}, which roadmap.py does not have"


def test_every_rule_tag_is_documented_for_agents() -> None:
    table = (REPO / "references/conventions.md").read_text()

    for tag in roadmap.RULES:
        assert f"| `{tag}` |" in table, f"references/conventions.md has no row for [{tag}]"


def test_every_documented_frontmatter_field_is_one_the_schema_knows() -> None:
    known = roadmap.OPEN_REQUIRED | roadmap.OPEN_OPTIONAL | roadmap.CLOSED_REQUIRED | roadmap.CLOSED_OPTIONAL
    for doc in AGENT_DOCS:
        for block in re.findall(r"```toml\n(.*?)```", doc.read_text(), re.DOTALL):
            fields = set(re.findall(r"^([a-z_]+) =", block.replace("+++", ""), re.MULTILINE))
            fields -= {"root", "specs", "changes", "files", "beta"}  # roadmap.toml keys, [refs] kinds, milestones
            assert fields <= known, f"{doc.name} documents {fields - known}"


def test_the_template_config_parses_with_its_examples_uncommented() -> None:
    text = (REPO / "assets/template/roadmap.toml").read_text()
    uncommented = re.sub(r"^# (root|specs|changes|adrs|beta)", r"\1", text, flags=re.MULTILINE)

    assert "beta" in tomllib.loads(uncommented)["milestones"]


def test_the_template_decisions_log_is_what_decide_writes() -> None:
    """A vendored copy has no template, so `decide` writes the head itself."""
    assert (REPO / "assets/template/decisions.md").read_text() == roadmap.DECISIONS_INTRO


def test_the_dogfood_roadmap_is_clean() -> None:
    assert roadmap.check(roadmap.open_roadmap(REPO / "roadmap")) == []


def test_the_script_and_pyproject_agree_on_the_version() -> None:
    """`roadmap.py --version` is how a repo tells which release it vendored."""
    pyproject = tomllib.loads((REPO / "pyproject.toml").read_text())

    assert pyproject["project"]["version"] == roadmap.__version__
