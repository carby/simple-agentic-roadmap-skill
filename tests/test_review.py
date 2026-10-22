"""`review` is the upkeep `check` skips because it depends on today's date:
milestones that have passed, and Now and Next items nobody has touched. It is
advice, so it always exits 0."""

from __future__ import annotations

import datetime
import os
import subprocess
from pathlib import Path

from conftest import item_text, make_roadmap, open_meta, run

D = datetime.date
MILESTONES = (
    '[milestones]\nalpha = { title = "Alpha", date = 2026-11-01 }\nbeta = { title = "Beta", date = 2026-12-01 }\n'
)


def git(repo: Path, *args: str, date: str | None = None) -> None:
    env = {"GIT_AUTHOR_DATE": f"{date}T12:00:00", "GIT_COMMITTER_DATE": f"{date}T12:00:00"} if date else {}
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        env={**os.environ, **env},
    )


def review(root: Path, *args: str) -> list[str]:
    result = run("review", *args, cwd=root)
    assert result.returncode == 0, result.stderr
    return result.stdout.splitlines()


def test_a_clean_roadmap_has_nothing_to_review(tmp_path: Path) -> None:
    make_roadmap(tmp_path, {"items/a.md": item_text(open_meta(id="a", filed=D(2026, 10, 1)))})

    assert review(tmp_path, "--date", "2026-10-22")[-1] == "Nothing to review."


def test_passed_milestones_are_listed_with_the_items_that_name_them(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "roadmap.toml": MILESTONES,
            "items/a.md": item_text(open_meta(id="a", milestone="alpha", filed=D(2026, 10, 30))),
            "items/b.md": item_text(open_meta(id="b", bucket="next", depends_on=["alpha"], filed=D(2026, 10, 30))),
        },
    )

    lines = review(tmp_path, "--date", "2026-11-11")

    assert lines[0].startswith("Milestones that have passed")
    assert lines[1] == "  alpha: Alpha (2026-11-01), 10 days ago; due: a; waiting: b"
    assert not any("beta" in line for line in lines)


def test_a_milestone_due_today_has_not_passed(tmp_path: Path) -> None:
    make_roadmap(tmp_path, {"roadmap.toml": MILESTONES})

    assert review(tmp_path, "--date", "2026-11-01")[-1] == "Nothing to review."


def test_now_and_next_items_untouched_for_60_days_are_stale(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "items/old-now.md": item_text(open_meta(id="old-now", filed=D(2026, 8, 1))),
            "items/argued.md": item_text(
                open_meta(id="argued", bucket="next", filed=D(2026, 6, 1), updated=D(2026, 10, 1))
            ),
            "items/old-later.md": item_text(
                open_meta(id="old-later", bucket="later", blocked_on="x", filed=D(2026, 1, 1))
            ),
        },
    )

    lines = review(tmp_path, "--date", "2026-10-01")

    assert "  now 1  old-now  last touched 2026-08-01 (61 days ago)" in lines
    assert not any("argued" in line or "old-later" in line for line in lines)
    assert "only filed and updated dates count" in lines[-1]


def test_days_sets_the_cutoff(tmp_path: Path) -> None:
    make_roadmap(tmp_path, {"items/a.md": item_text(open_meta(id="a", filed=D(2026, 10, 1)))})

    assert any(" a  last touched" in line for line in review(tmp_path, "--date", "2026-10-22", "--days", "21"))
    assert not any(" a  last touched" in line for line in review(tmp_path, "--date", "2026-10-22", "--days", "22"))


def test_a_recent_commit_to_the_item_counts_as_a_touch(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "items/edited.md": item_text(open_meta(id="edited", filed=D(2026, 6, 1))),
            "items/left.md": item_text(open_meta(id="left", rank=2, filed=D(2026, 6, 1))),
        },
    )
    git(tmp_path, "init", "-q")
    git(tmp_path, "add", "-A")
    git(tmp_path, "commit", "-qm", "file", date="2026-06-01")
    edited = tmp_path / "roadmap/items/edited.md"
    edited.write_text(edited.read_text().replace("Prose.", "Better prose."))
    git(tmp_path, "commit", "-qam", "re-argue", date="2026-10-01")

    lines = review(tmp_path, "--date", "2026-10-22")

    assert "  now 2  left  last touched 2026-06-01 (143 days ago)" in lines
    assert not any("edited" in line for line in lines)
    assert not any("only filed and updated" in line for line in lines)
