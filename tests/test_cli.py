"""The script as CI runs it: a subprocess, an exit status, and problems printed to stderr."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import item_text, make_roadmap, open_meta, roadmap, run


def test_check_passes_on_the_valid_fixture(valid: Path) -> None:
    result = run("check", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert result.stdout == "Roadmap OK: 3 open, 2 archived.\n"


def test_check_fails_with_one_tagged_line_per_problem(valid: Path) -> None:
    (valid / "roadmap/items/cache-tokens.md").write_text(
        (valid / "roadmap/items/cache-tokens.md").read_text().replace('bucket = "now"', 'bucket = "later"')
    )
    (valid / "src/app.py").unlink()

    result = run("check", cwd=valid)

    assert result.returncode == 1
    lines = result.stderr.splitlines()
    assert lines[0] == "5 roadmap problem(s):"
    assert any(line.endswith("or depend on another 'later' item [bucket]") for line in lines)
    assert any("split-app.md: depends on 'cache-tokens' ('later', rank 1)" in line for line in lines)
    assert any(line.endswith("refs.files 'src/app.py' does not exist [refs]") for line in lines)
    assert sum(line.endswith("[generated]") for line in lines) == 1  # the index now puts it under Later
    assert any(
        line.endswith("rank 1 is already taken in 'later' by roadmap/items/cache-tokens.md [rank]") for line in lines
    )


def test_index_repairs_a_stale_index(valid: Path) -> None:
    item = valid / "roadmap/items/cache-tokens.md"
    item.write_text(item.read_text().replace("Cache auth tokens", "Cache the auth tokens"))
    assert run("check", cwd=valid).returncode == 1

    result = run("index", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert run("check", cwd=valid).returncode == 0
    assert "[Cache the auth tokens](items/cache-tokens.md)" in (valid / "roadmap/README.md").read_text()


def test_index_repairs_the_index_after_an_item_is_deleted_by_hand(valid: Path) -> None:
    """The stale index still links to the deleted file. That is a [generated]
    problem for `index` to fix, not a [links] problem that stops it."""
    (valid / "roadmap/items/split-app.md").unlink()

    result = run("index", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert run("check", cwd=valid).returncode == 0


def test_index_refuses_to_render_an_invalid_roadmap(valid: Path) -> None:
    (valid / "roadmap/items/broken.md").write_text("no fence\n")
    readme = (valid / "roadmap/README.md").read_text()

    result = run("index", cwd=valid)

    assert result.returncode == 1
    assert "[frontmatter]" in result.stderr
    assert (valid / "roadmap/README.md").read_text() == readme


def test_dir_points_at_a_roadmap_elsewhere(valid: Path) -> None:
    result = run("check", "--dir", "valid/roadmap", cwd=valid.parent)

    assert result.returncode == 0, result.stderr


def test_a_broken_config_is_a_usage_error(valid: Path) -> None:
    (valid / "roadmap/roadmap.toml").write_text("[refs\n")

    result = run("check", cwd=valid)

    assert result.returncode == 2
    assert result.stderr.startswith("error: ") and "[config]" in result.stderr


def test_version() -> None:
    result = run("--version", cwd=Path.cwd())

    assert result.stdout.strip() == f"roadmap.py {roadmap.__version__}"


def test_new_refuses_a_reused_id(valid: Path) -> None:
    result = run("new", "rewrite-in-rust", "--title", "Again", "--bucket", "now", cwd=valid)

    assert result.returncode == 2
    assert "ids are never reused" in result.stderr


def test_new_enforces_the_bucket_criterion_up_front(valid: Path) -> None:
    result = run("new", "some-call", "--title", "T", "--bucket", "later", cwd=valid)

    assert result.returncode == 2
    assert "--blocked-on is required" in result.stderr


def test_new_takes_the_next_free_rank_and_refs(valid: Path) -> None:
    result = run(
        "new", "more-work", "--title", "More", "--bucket", "now", "--ref", "specs:auth", "--body", "Why.", cwd=valid
    )

    assert result.returncode == 0, result.stderr
    item = roadmap.parse(valid / "roadmap/items/more-work.md")
    assert item.meta["rank"] == 2
    assert item.meta["refs"] == {"specs": ["auth"]}
    assert run("check", cwd=valid).returncode == 0


def snapshot(valid: Path) -> dict[Path, str]:
    return {path: path.read_text() for path in sorted((valid / "roadmap").rglob("*.md"))}


def test_move_goes_to_the_bottom_of_the_target_bucket(valid: Path) -> None:
    result = run("move", "rotate-keys", "--bucket", "next", cwd=valid)

    assert result.returncode == 0, result.stderr
    moved = roadmap.parse(valid / "roadmap/items/rotate-keys.md")
    assert (moved.meta["bucket"], moved.meta["rank"]) == ("next", 2)
    assert run("check", cwd=valid).returncode == 0


def test_move_lands_above_its_dependents_and_shifts_them_down(valid: Path) -> None:
    result = run("move", "cache-tokens", "--bucket", "next", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines()[1] == "Shifted split-app down a rank, below it."
    moved = roadmap.parse(valid / "roadmap/items/cache-tokens.md")
    shifted = roadmap.parse(valid / "roadmap/items/split-app.md")
    assert (moved.meta["bucket"], moved.meta["rank"]) == ("next", 1)
    assert (shifted.meta["bucket"], shifted.meta["rank"]) == ("next", 2)
    assert run("check", cwd=valid).returncode == 0


def test_move_refuses_to_put_an_item_behind_its_dependents_and_writes_nothing(valid: Path) -> None:
    before = snapshot(valid)

    result = run("move", "cache-tokens", "--bucket", "later", "--blocked-on", "which cache", cwd=valid)

    assert result.returncode == 2
    assert "moving cache-tokens would break the roadmap" in result.stderr
    assert "split-app.md: depends on 'cache-tokens' ('later', rank 2)" in result.stderr
    assert snapshot(valid) == before


def test_move_out_of_later_drops_blocked_on_and_asks_for_the_decision(valid: Path) -> None:
    result = run("move", "rotate-keys", "--bucket", "now", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert "record in its prose what was decided" in result.stdout
    assert "blocked_on" not in roadmap.parse(valid / "roadmap/items/rotate-keys.md").meta
    assert run("check", cwd=valid).returncode == 0


def test_move_into_later_needs_the_open_question(valid: Path) -> None:
    refused = run("move", "split-app", "--bucket", "later", cwd=valid)
    moved = run("move", "split-app", "--bucket", "later", "--blocked-on", "where to split", cwd=valid)

    assert refused.returncode == 2 and "--blocked-on is required" in refused.stderr
    assert moved.returncode == 0, moved.stderr
    assert roadmap.parse(valid / "roadmap/items/split-app.md").meta["blocked_on"] == "where to split"
    assert run("check", cwd=valid).returncode == 0


def test_move_refuses_a_no_op(valid: Path) -> None:
    result = run("move", "split-app", "--bucket", "next", cwd=valid)

    assert result.returncode == 2
    assert "is already in 'next'" in result.stderr


def test_there_is_no_wip_tracking_command(valid: Path) -> None:
    result = run("claim", "cache-tokens", cwd=valid)

    assert result.returncode == 2
    assert "invalid choice: 'claim'" in result.stderr


def test_move_and_close_refuse_an_archived_item(valid: Path) -> None:
    for args in (["move", "rewrite-in-rust", "--bucket", "now"], ["close", "rewrite-in-rust", "--outcome", "shipped"]):
        result = run(*args, cwd=valid)

        assert result.returncode == 2
        assert "it is already closed" in result.stderr


def test_new_records_its_dependencies(valid: Path) -> None:
    result = run("new", "more-work", "--title", "More", "--bucket", "next", "--depends-on", "split-app",
                 "--depends-on", "drop-legacy-login", "--body", "Why.", cwd=valid)  # fmt: skip

    assert result.returncode == 0, result.stderr
    item = roadmap.parse(valid / "roadmap/items/more-work.md")
    assert (item.meta["rank"], item.meta["depends_on"]) == (2, ["split-app", "drop-legacy-login"])
    assert run("check", cwd=valid).returncode == 0


def test_new_refuses_to_file_an_item_ahead_of_its_dependencies(valid: Path) -> None:
    result = run("new", "too-soon", "--title", "T", "--bucket", "now", "--depends-on", "split-app", cwd=valid)

    assert result.returncode == 2
    assert "filing too-soon would break the roadmap" in result.stderr
    assert "which must come first" in result.stderr
    assert not (valid / "roadmap/items/too-soon.md").exists()


def test_a_later_item_may_wait_on_another_later_item_instead_of_naming_a_question(valid: Path) -> None:
    filed = run("new", "after-rotation", "--title", "T", "--bucket", "later", "--depends-on", "rotate-keys",
                "--body", "Why.", cwd=valid)  # fmt: skip
    assert filed.returncode == 0, filed.stderr
    assert run("check", cwd=valid).returncode == 0
    before = snapshot(valid)

    # Taking rotate-keys out of Later, either way, would leave after-rotation blocked on nothing.
    moved = run("move", "rotate-keys", "--bucket", "next", cwd=valid)
    closed = run("close", "rotate-keys", "--outcome", "shipped", cwd=valid)

    for result in (moved, closed):
        assert result.returncode == 2
        assert "after-rotation.md: a 'later' item must name what it is blocked_on" in result.stderr
    assert snapshot(valid) == before


def test_close_refuses_to_decline_an_item_others_depend_on(valid: Path) -> None:
    before = snapshot(valid)

    result = run("close", "cache-tokens", "--outcome", "declined", cwd=valid)

    assert result.returncode == 2
    assert "closing cache-tokens as declined would break the roadmap" in result.stderr
    assert "split-app.md: depends on 'cache-tokens', which was declined" in result.stderr
    assert snapshot(valid) == before


def test_close_may_ship_an_item_others_depend_on(valid: Path) -> None:
    result = run("close", "cache-tokens", "--outcome", "shipped", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert "[Cache auth tokens](archive/cache-tokens.md) (shipped)" in (valid / "roadmap/README.md").read_text()
    assert run("check", cwd=valid).returncode == 0


MILESTONES = '[milestones]\nbeta = { title = "Public beta", date = 2026-12-01 }\n'


def test_new_records_the_milestone_an_item_is_due_for(tmp_path: Path) -> None:
    make_roadmap(tmp_path, {"roadmap.toml": MILESTONES})

    result = run("new", "ship-it", "--title", "T", "--bucket", "now", "--milestone", "beta", "--body", "Why.",
                 cwd=tmp_path)  # fmt: skip

    assert result.returncode == 0, result.stderr
    assert roadmap.parse(tmp_path / "roadmap/items/ship-it.md").meta["milestone"] == "beta"
    assert "**Due for:** Public beta (2026-12-01)" in (tmp_path / "roadmap/README.md").read_text()
    assert run("check", cwd=tmp_path).returncode == 0


@pytest.mark.parametrize(
    ("args", "expected"),
    [
        (["ship-it", "--milestone", "gamma"], "is due for milestone 'gamma', which roadmap.toml does not declare"),
        (["beta"], "'beta' is a milestone in"),
    ],
    ids=["unknown-milestone", "milestone-id"],
)
def test_new_refuses_an_unknown_milestone_and_a_milestones_id(tmp_path: Path, args: list, expected: str) -> None:
    make_roadmap(tmp_path, {"roadmap.toml": MILESTONES})

    result = run("new", *args, "--title", "T", "--bucket", "now", "--body", "Why.", cwd=tmp_path)

    assert result.returncode == 2
    assert expected in result.stderr
    assert list((tmp_path / "roadmap/items").glob("*.md")) == []


def test_move_lands_an_item_due_for_a_milestone_above_the_items_waiting_on_it(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "roadmap.toml": MILESTONES,
            "items/due.md": item_text(open_meta(id="due", milestone="beta")),
            "items/waits.md": item_text(open_meta(id="waits", bucket="next", depends_on=["beta"])),
        },
    )

    result = run("move", "due", "--bucket", "next", cwd=tmp_path)

    assert result.returncode == 0, result.stderr
    assert roadmap.parse(tmp_path / "roadmap/items/due.md").meta["rank"] == 1
    assert roadmap.parse(tmp_path / "roadmap/items/waits.md").meta["rank"] == 2
    assert run("check", cwd=tmp_path).returncode == 0


def test_move_refuses_to_put_an_item_behind_the_items_waiting_on_its_milestone(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "roadmap.toml": MILESTONES,
            "items/due.md": item_text(open_meta(id="due", milestone="beta")),
            "items/waits.md": item_text(open_meta(id="waits", bucket="next", depends_on=["beta"])),
        },
    )

    result = run("move", "due", "--bucket", "later", "--blocked-on", "a call", cwd=tmp_path)

    assert result.returncode == 2
    assert "waits.md: depends on milestone 'beta' (2026-12-01), but 'due' ('later', rank 1)" in result.stderr
