"""The whole lifecycle in a fresh repo: init, new, move, close. The roadmap has
to pass `check` after every step, because that is what an agent following
SKILL.md relies on."""

from __future__ import annotations

import datetime
from pathlib import Path

import pytest
from conftest import SCRIPT, roadmap, run


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    result = run("init", cwd=tmp_path)
    assert result.returncode == 0, result.stderr
    return tmp_path


def ok(repo: Path, *args: str) -> str:
    """Run a command through the *vendored* copy, then require a clean check."""
    vendored = repo / "tools/roadmap.py"
    result = run(*args, cwd=repo, script=vendored)
    assert result.returncode == 0, result.stderr
    checked = run("check", cwd=repo, script=vendored)
    assert checked.returncode == 0, checked.stderr
    return result.stdout


def test_init_creates_a_valid_roadmap_and_vendors_the_script(repo: Path) -> None:
    assert (repo / "tools/roadmap.py").read_bytes() == SCRIPT.read_bytes()
    for name in ("README.md", "done.md", "roadmap.toml", "items/.gitkeep", "archive/.gitkeep"):
        assert (repo / "roadmap" / name).exists(), name
    assert "{{script}}" not in (repo / "roadmap/README.md").read_text()
    assert "python tools/roadmap.py check" in (repo / "roadmap/README.md").read_text()
    assert run("check", cwd=repo).returncode == 0


def test_init_only_initialises(tmp_path: Path) -> None:
    """CI setup is the README's job. init says what it created and nothing else."""
    result = run("init", "--script", "bin/roadmap.py", cwd=tmp_path)

    assert result.stdout.splitlines() == [f"Created roadmap/ and bin/roadmap.py (roadmap.py {roadmap.__version__})."]
    assert (tmp_path / "bin/roadmap.py").exists()


def test_init_refuses_to_overwrite_a_roadmap(repo: Path) -> None:
    result = run("init", cwd=repo)

    assert result.returncode == 2
    assert "refusing to overwrite" in result.stderr


def test_init_needs_the_skills_copy(repo: Path) -> None:
    """The vendored copy has no template next to it."""
    result = run("init", "--dir", "other", cwd=repo, script=repo / "tools/roadmap.py")

    assert result.returncode == 2
    assert "init runs from the skill's own copy" in result.stderr


def test_new_move_close(repo: Path) -> None:
    # The first item links to the second before it exists, so the check waits for both.
    run("new", "add-cache", "--title", "Add a cache", "--bucket", "now", "--date", "2026-09-01",
       "--body", "Slow. Blocks [the split](split-module.md).", cwd=repo)  # fmt: skip
    ok(repo, "new", "split-module", "--title", "Split the module", "--bucket", "now", "--date", "2026-09-02",
       "--body", "Too big. Needs [the cache](add-cache.md) first.")  # fmt: skip
    ok(repo, "move", "add-cache", "--bucket", "next", "--date", "2026-09-05")

    moved = roadmap.parse(repo / "roadmap/items/add-cache.md")
    assert (moved.meta["bucket"], moved.meta["rank"]) == ("next", 1)

    out = ok(repo, "close", "add-cache", "--outcome", "shipped", "--as", "pr-7", "--date", "2026-09-10")

    assert not (repo / "roadmap/items/add-cache.md").exists()
    closed = roadmap.parse(repo / "roadmap/archive/add-cache.md", archived=True)
    assert closed.meta == {
        "id": "add-cache",
        "title": "Add a cache",
        "filed": closed.meta["filed"],
        "updated": datetime.date(2026, 9, 5),
        "closed": closed.meta["closed"],
        "outcome": "shipped",
        "shipped_as": "pr-7",
    }
    # Links follow the move both ways, and only hand-written edits are reported.
    assert "[the split](../items/split-module.md)" in closed.body
    assert "[the cache](../archive/add-cache.md)" in (repo / "roadmap/items/split-module.md").read_text()
    assert out.splitlines() == [
        f"Updated links in {Path('roadmap/items/split-module.md')}.",
        f"Closed add-cache as shipped: {Path('roadmap/archive/add-cache.md')}.",
    ]
    assert (
        "- **shipped** [Add a cache](archive/add-cache.md) — closed 2026-09-10 as `pr-7`"
        in (repo / "roadmap/done.md").read_text()
    )


def test_close_keeps_comments_and_tables_in_the_frontmatter(repo: Path) -> None:
    item = repo / "roadmap/items/keep-layout.md"
    item.write_text(
        "+++\n"
        'id = "keep-layout"\n'
        'title = "Keep layout"  # a comment\n'
        'bucket = "later"\n'
        "rank = 1\n"
        "filed = 2026-09-01\n"
        'blocked_on = "a call"\n'
        "\n"
        "[refs]\n"
        'files = ["tools/roadmap.py"]\n'
        "+++\n\nProse.\n"
    )
    ok(repo, "index")

    ok(repo, "close", "keep-layout", "--outcome", "declined", "--date", "2026-09-05")

    assert (repo / "roadmap/archive/keep-layout.md").read_text() == (
        "+++\n"
        'id = "keep-layout"\n'
        'title = "Keep layout"  # a comment\n'
        "filed = 2026-09-01\n"
        "closed = 2026-09-05\n"
        'outcome = "declined"\n'
        "\n"
        "[refs]\n"
        'files = ["tools/roadmap.py"]\n'
        "+++\n\nProse.\n"
    )


def test_an_edit_the_frontmatter_editor_cannot_verify_is_refused(repo: Path) -> None:
    item = repo / "roadmap/items/multi-line.md"
    item.write_text(
        '+++\nid = "multi-line"\ntitle = "T"\nbucket = "later"\nrank = 1\nfiled = 2026-09-01\n'
        'blocked_on = """a call\nspanning lines"""\n+++\n\nProse.\n'
    )
    before = item.read_text()

    result = run("close", "multi-line", "--outcome", "declined", cwd=repo)

    assert result.returncode == 2
    assert "edit it by hand" in result.stderr
    assert item.read_text() == before


def vendor_as(repo: Path, version: str) -> Path:
    """Rewrite the vendored copy to claim another version, as an older or newer release would."""
    vendored = repo / "tools/roadmap.py"
    vendored.write_text(
        vendored.read_text().replace(f'__version__ = "{roadmap.__version__}"', f'__version__ = "{version}"')
    )
    return vendored


def test_upgrade_replaces_an_older_vendored_copy_and_leaves_the_roadmap_alone(repo: Path) -> None:
    vendored = vendor_as(repo, "0.9.0")
    before = {p: p.read_bytes() for p in (repo / "roadmap").rglob("*") if p.is_file()}

    result = run("upgrade", cwd=repo)

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines()[0] == f"Upgraded tools/roadmap.py: roadmap.py 0.9.0 → {roadmap.__version__}."
    assert result.stdout.splitlines()[1].startswith("Roadmap OK")
    assert vendored.read_bytes() == SCRIPT.read_bytes()
    assert {p: p.read_bytes() for p in (repo / "roadmap").rglob("*") if p.is_file()} == before


def test_upgrade_refuses_a_downgrade_unless_forced(repo: Path) -> None:
    vendored = vendor_as(repo, "99.0.0")

    refused = run("upgrade", cwd=repo)
    assert refused.returncode == 2
    assert "newer than this" in refused.stderr and "--force" in refused.stderr
    assert "99.0.0" in vendored.read_text()

    forced = run("upgrade", "--force", cwd=repo)
    assert forced.returncode == 0, forced.stderr
    assert vendored.read_bytes() == SCRIPT.read_bytes()


def test_upgrade_to_the_same_version_is_a_no_op(repo: Path) -> None:
    result = run("upgrade", cwd=repo)

    assert result.returncode == 0, result.stderr
    assert result.stdout == f"tools/roadmap.py is already roadmap.py {roadmap.__version__}.\n"


def test_upgrade_keeps_local_edits_unless_forced(repo: Path) -> None:
    vendored = repo / "tools/roadmap.py"
    vendored.write_text(vendored.read_text() + "# a local patch\n")

    result = run("upgrade", cwd=repo)

    assert result.returncode == 2
    assert "has local edits" in result.stderr
    assert vendored.read_text().endswith("# a local patch\n")


def test_upgrade_needs_the_skills_copy_and_a_vendored_one(repo: Path) -> None:
    itself = run("upgrade", cwd=repo, script=repo / "tools/roadmap.py")
    missing = run("upgrade", "--script", "bin/roadmap.py", cwd=repo)

    assert itself.returncode == 2 and "upgrade runs from the skill's own copy" in itself.stderr
    assert missing.returncode == 2 and "bin/roadmap.py does not exist" in missing.stderr


def test_upgrade_reports_what_the_new_rules_reject(repo: Path) -> None:
    vendor_as(repo, "0.9.0")
    ok(repo, "new", "some-work", "--title", "T", "--bucket", "now", "--body", "Why.")
    item = repo / "roadmap/items/some-work.md"
    item.write_text(item.read_text().replace("Why.", "<!-- nothing yet -->"))

    result = run("upgrade", cwd=repo)

    assert result.returncode == 1
    assert (repo / "tools/roadmap.py").read_bytes() == SCRIPT.read_bytes()
    assert "[body]" in result.stderr and "the release notes say what changed" in result.stderr


def test_the_skills_copy_warns_when_the_vendored_copy_is_older(repo: Path) -> None:
    assert "warning" not in run("check", cwd=repo).stderr
    vendor_as(repo, "0.9.0")

    result = run("check", cwd=repo)

    assert result.returncode == 0, result.stderr
    assert f"tools/roadmap.py is roadmap.py 0.9.0, older than this {roadmap.__version__}" in result.stderr
    assert "upgrade" in result.stderr
