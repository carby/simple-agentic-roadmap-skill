"""The whole lifecycle in a fresh repo: init, new, move, close. The roadmap has
to pass `check` after every step, because that is what an agent following
SKILL.md relies on."""

from __future__ import annotations

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
    ok(repo, "move", "add-cache", "--bucket", "next")

    moved = roadmap.parse(repo / "roadmap/items/add-cache.md")
    assert (moved.meta["bucket"], moved.meta["rank"]) == ("next", 1)

    out = ok(repo, "close", "add-cache", "--outcome", "shipped", "--as", "pr-7", "--date", "2026-09-10")

    assert not (repo / "roadmap/items/add-cache.md").exists()
    closed = roadmap.parse(repo / "roadmap/archive/add-cache.md", archived=True)
    assert closed.meta == {
        "id": "add-cache",
        "title": "Add a cache",
        "filed": closed.meta["filed"],
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
