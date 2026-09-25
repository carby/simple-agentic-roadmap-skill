"""One case per rule, each breaking exactly one thing. Every tag in
roadmap.RULES has to be covered either here or in test_append_only.py, so a new
rule cannot land untested."""

from __future__ import annotations

import datetime
import re
from pathlib import Path

import pytest
from conftest import DONE, README, closed_meta, item_text, make_roadmap, open_meta, roadmap

D = datetime.date

CASES = [
    # (case id, rule, expected message fragment, files relative to roadmap/)
    ("no-fence", "frontmatter", "no +++-fenced TOML frontmatter", {"items/sample.md": "Just prose.\n"}),
    ("bad-toml", "frontmatter", "malformed TOML frontmatter", {"items/sample.md": '+++\nid = "broken\n+++\nBody.\n'}),
    ("missing", "schema", "missing required field(s) title", {"items/sample.md": item_text(open_meta(title=None))}),
    ("unknown", "schema", "unknown field(s) urgency", {"items/sample.md": item_text(open_meta(urgency="high"))}),
    ("id-mismatch", "schema", "does not match its filename", {"items/sample.md": item_text(open_meta(id="other"))}),
    ("not-a-slug", "schema", "is not a kebab-case slug", {"items/Sample_It.md": item_text(open_meta(id="Sample_It"))}),
    ("empty-title", "schema", "title must be a non-empty string", {"items/sample.md": item_text(open_meta(title=" "))}),
    (
        "archived-queue-field",
        "schema",
        "queue field(s) bucket belong to open items",
        {"archive/sample.md": item_text(closed_meta(bucket="now"))},
    ),
    (
        "bad-outcome",
        "schema",
        "outcome 'done' is not one of shipped, declined",
        {"archive/sample.md": item_text(closed_meta(outcome="done"))},
    ),
    (
        "archived-missing",
        "schema",
        "missing required field(s) closed",
        {"archive/sample.md": item_text(closed_meta(closed=None))},
    ),
    (
        "bad-bucket",
        "bucket",
        "is not one of now, next, later",
        {"items/sample.md": item_text(open_meta(bucket="someday"))},
    ),
    (
        "later-unblocked",
        "bucket",
        "must name what it is blocked_on",
        {"items/sample.md": item_text(open_meta(bucket="later"))},
    ),
    (
        # The roadmap tracks priority, not who is working on what.
        "no-wip-tracking",
        "schema",
        "unknown field(s) claimed",
        {"items/sample.md": item_text(open_meta(bucket="next", claimed=D(2026, 9, 7)))},
    ),
    (
        "next-blocked",
        "bucket",
        "blocked_on belongs to a 'later' item; this one is 'next'",
        {"items/sample.md": item_text(open_meta(bucket="next", blocked_on="a call"))},
    ),
    (
        "now-blocked",
        "bucket",
        "blocked_on belongs to a 'later' item",
        {"items/sample.md": item_text(open_meta(blocked_on="a call"))},
    ),
    ("zero-rank", "rank", "rank must be a positive integer", {"items/sample.md": item_text(open_meta(rank=0))}),
    (
        "shared-rank",
        "rank",
        "rank 1 is already taken in 'now'",
        {"items/sample.md": item_text(open_meta()), "items/other.md": item_text(open_meta(id="other"))},
    ),
    ("quoted-date", "dates", "must be a bare TOML date", {"items/sample.md": item_text(open_meta(filed="2026-09-06"))}),
    (
        "datetime",
        "dates",
        "must be a bare TOML date",
        {"items/sample.md": item_text(open_meta(filed=datetime.datetime(2026, 9, 6, 10, 0)))},
    ),
    (
        "updated-before-filed",
        "dates",
        "updated 2026-09-01 is before filed 2026-09-06",
        {"items/sample.md": item_text(open_meta(updated=D(2026, 9, 1)))},
    ),
    (
        "closed-before-filed",
        "dates",
        "closed 2026-09-01 is before filed",
        {"archive/sample.md": item_text(closed_meta(closed=D(2026, 9, 1)))},
    ),
    ("no-body", "body", "has no prose", {"items/sample.md": item_text(open_meta(), body="")}),
    ("placeholder-body", "body", "has no prose", {"items/sample.md": item_text(open_meta(), body=roadmap.PLACEHOLDER)}),
    ("archived-no-body", "body", "has no prose", {"archive/sample.md": item_text(closed_meta(), body="  ")}),
    (
        "missing-file",
        "refs",
        "refs.files 'src/gone.py' does not exist",
        {"items/sample.md": item_text(open_meta(), refs={"files": ["src/gone.py"]})},
    ),
    (
        "unknown-kind",
        "refs",
        "unknown ref kind 'owner'",
        {"items/sample.md": item_text(open_meta(), refs={"owner": ["someone"]})},
    ),
    (
        "declared-kind-unresolved",
        "refs",
        "refs.specs 'auth' matches none of specs/{}",
        {
            "roadmap.toml": '[refs]\nspecs = "specs/{}"\n',
            "items/sample.md": item_text(open_meta(), refs={"specs": ["auth"]}),
        },
    ),
    ("refs-not-table", "refs", "refs must be a table", {"items/sample.md": item_text(open_meta(refs="src/app.py"))}),
    (
        "refs-not-list",
        "refs",
        "refs.files must be a list of strings",
        {
            "items/sample.md": '+++\nid = "sample"\ntitle = "S"\nbucket = "now"\nrank = 1\nfiled = 2026-09-06\n'
            '[refs]\nfiles = "src/app.py"\n+++\nProse.\n'
        },
    ),
    (
        "open-and-archived",
        "ids",
        "id 'sample' is both open and archived",
        {"items/sample.md": item_text(open_meta()), "archive/sample.md": item_text(closed_meta())},
    ),
    (
        "duplicate-id",
        "ids",
        "duplicate id 'sample'",
        {"items/sample.md": item_text(open_meta()), "items/copy.md": item_text(open_meta(rank=2))},
    ),
    (
        "broken-item-link",
        "links",
        "links to 'gone.md', which does not exist",
        {"items/sample.md": item_text(open_meta(), body="See [gone](gone.md).")},
    ),
    (
        "broken-reference-link",
        "links",
        "links to '../nowhere.md'",
        {"items/sample.md": item_text(open_meta(), body="See [it][1].\n\n[1]: ../nowhere.md")},
    ),
    (
        "broken-readme-link",
        "links",
        "links to 'decisions.md'",
        {"README.md": README + "\nClosed items used to live in [decisions](decisions.md).\n"},
    ),
]


@pytest.mark.parametrize(("rule", "expected", "files"), [c[1:] for c in CASES], ids=[c[0] for c in CASES])
def test_each_rule_rejects_what_breaks_it(tmp_path: Path, rule: str, expected: str, files: dict) -> None:
    rm = make_roadmap(tmp_path, files)

    problems = roadmap.check(rm)

    assert any(p.rule == rule and expected in p.message for p in problems), [str(p) for p in problems]


@pytest.mark.parametrize(
    ("expected", "files"),
    [
        ("generated block is stale", {"items/sample.md": item_text(open_meta())}),
        ("markers not found", {"done.md": "# Done\n"}),
    ],
    ids=["stale-index", "no-markers"],
)
def test_generated_files_must_match_the_items(tmp_path: Path, expected: str, files: dict) -> None:
    rm = make_roadmap(tmp_path, {}, sync=True)
    for name, text in files.items():
        (rm.dir / name).write_text(text)

    problems = roadmap.check(rm)

    assert any(p.rule == "generated" and expected in p.message for p in problems), [str(p) for p in problems]


def test_a_missing_done_md_is_reported(tmp_path: Path) -> None:
    rm = make_roadmap(tmp_path, {})
    rm.done.unlink()

    assert any(p.rule == "generated" and "is missing" in p.message for p in roadmap.check(rm))


@pytest.mark.parametrize(
    ("toml", "expected"),
    [
        ('[refs\nspecs = "x"', "malformed TOML"),
        ('[refs]\nspecs = "specs/"', "must be a path template containing {}"),
        ('owner = "me"', "unknown key(s) owner"),
        ("root = 1", "root must be a path string"),
    ],
)
def test_a_broken_config_is_refused(tmp_path: Path, toml: str, expected: str) -> None:
    (tmp_path / "roadmap").mkdir()
    (tmp_path / "roadmap" / "roadmap.toml").write_text(toml)

    with pytest.raises(roadmap.ConfigError, match=re.escape(expected)):
        roadmap.open_roadmap(tmp_path / "roadmap")


def test_every_rule_has_a_failing_case() -> None:
    covered = {c[1] for c in CASES} | {"generated", "config", "append-only"}  # the last three are tested separately

    assert covered == set(roadmap.RULES)


# --- what the rules deliberately allow -------------------------------------


def test_a_clean_roadmap_has_no_problems(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.py").write_text("")
    rm = make_roadmap(
        tmp_path,
        {
            "items/now-one.md": item_text(open_meta(id="now-one"), refs={"files": ["src/app.py"]}),
            "items/next-one.md": item_text(open_meta(id="next-one", bucket="next")),
            "items/later-one.md": item_text(open_meta(id="later-one", bucket="later", blocked_on="a call")),
            "archive/old-one.md": item_text(closed_meta(id="old-one", outcome="declined")),
        },
    )

    assert roadmap.check(rm) == []


def test_archived_refs_and_links_may_go_stale(tmp_path: Path) -> None:
    """An archived entry describes the tree as it was. It cannot be edited to
    follow a rename, so it is not held to the tree as it is now."""
    rm = make_roadmap(
        tmp_path,
        {
            "archive/sample.md": item_text(
                closed_meta(), body="Was in [the old module](../../src/old.py).", refs={"files": ["src/old.py"]}
            )
        },
    )

    assert roadmap.check(rm) == []


def test_links_that_are_not_relative_paths_are_not_checked(tmp_path: Path) -> None:
    body = "\n".join(
        [
            "[web](https://example.com/x.md) [mail](mailto:a@b.c) [anchor](#top) [abs](/docs/x.md)",
            "[self](sample.md#section) [dir](../items/) [spaced](<../items/sample.md>)",
            "`[code](nowhere.md)`",
            "```",
            "[fenced](nowhere.md)",
            "```",
        ]
    )
    rm = make_roadmap(tmp_path, {"items/sample.md": item_text(open_meta(), body=body)})

    assert roadmap.check(rm) == []


def test_a_declared_ref_kind_may_use_several_templates_and_globs(tmp_path: Path) -> None:
    (tmp_path / "changes" / "archive" / "2026-09-01-add-cache").mkdir(parents=True)
    rm = make_roadmap(
        tmp_path,
        {
            "roadmap.toml": '[refs]\nchanges = ["changes/{}", "changes/archive/*-{}"]\n',
            "items/sample.md": item_text(open_meta(), refs={"changes": ["add-cache"]}),
        },
    )

    assert roadmap.check(rm) == []


def test_a_broken_file_does_not_hide_the_others(tmp_path: Path) -> None:
    rm = make_roadmap(
        tmp_path,
        {"items/broken.md": "no fence\n", "items/sample.md": item_text(open_meta(bucket="later"))},
    )

    rules = {p.rule for p in roadmap.check(rm)}

    assert {"frontmatter", "bucket"} <= rules


def test_problems_render_with_path_line_and_tag(tmp_path: Path) -> None:
    rm = make_roadmap(tmp_path, {"items/sample.md": item_text(open_meta(), body="Line one.\n[x](gone.md)")})

    (problem,) = roadmap.check(rm)

    assert str(problem) == f"{rm.items_dir / 'sample.md'}:10: links to 'gone.md', which does not exist [links]"


def test_readme_and_done_templates_are_valid_without_items(tmp_path: Path) -> None:
    rm = make_roadmap(tmp_path, {"README.md": README, "done.md": DONE})

    assert roadmap.check(rm) == []
