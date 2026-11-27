//! The Queue tab as data: which rows show, in what order, with which glyphs,
//! tags, chips and lanes, and what the preview strip says about the
//! selected item. Pure, so every state the tab draws is tested without a
//! window; `ui::queue` only paints it.

use std::collections::{BTreeSet, HashMap, HashSet};

use jiff::civil::Date;

use crate::lanes::{self, Lanes};
use crate::snapshot::{Item, Milestone, Snapshot, State as ItemState};

/// The selection key of the archived section's fold row. Item ids are
/// slugs, so no id can start with `§`.
pub const FOLD: &str = "§fold";
/// The section key of archived items.
pub const ARCHIVED: &str = "archived";
/// The section key of items whose bucket isn't valid.
pub const OTHER: &str = "other";
/// Chips a row shows before "+n".
pub const CHIPS: usize = 2;

/// How the queue is shown, as the person set it this run.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Options {
    pub show_archived: bool,
    pub archived_unfolded: bool,
    /// Section keys (buckets, or `archived`) whose rows are hidden.
    pub collapsed: BTreeSet<String>,
    /// A milestone id: only the items due for it and what they need first.
    pub filter: Option<String>,
    /// The find text; empty finds nothing.
    pub find: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Glyph {
    Ready,
    Waiting,
    Later,
    /// In Later with a `blocked_on` question.
    Blocked,
    Archived,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TagKind {
    Shipped,
    Declined,
    NeededFirst,
    Gate,
    Blocked,
    /// An open dependency hidden by a collapse or the filter.
    Hidden,
    Changed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tag {
    pub kind: TagKind,
    pub text: String,
    /// The full text, for hover; the strip says it too.
    pub hover: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChipKind {
    /// ◆: the item is due for it. A reached one shows √: the default
    /// fonts have no ✓.
    Due,
    /// ◇: the item's depends_on names it.
    Waits,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chip {
    pub kind: ChipKind,
    pub id: String,
    /// None for a milestone roadmap.toml doesn't declare.
    pub date: Option<String>,
    pub reached: bool,
    /// Days past its date, unreached, on an open item.
    pub late: Option<i64>,
}

impl Chip {
    pub fn text(&self) -> String {
        let glyph = if self.reached {
            "√"
        } else {
            match self.kind {
                ChipKind::Due => "◆",
                ChipKind::Waits => "◇",
            }
        };
        match self.late {
            Some(days) => format!("{glyph} {} · late {days} d", self.id),
            None => format!("{glyph} {}", self.id),
        }
    }

    /// With its date, as the strip shows it: "◆ v3 · 02-01".
    pub fn long_text(&self, today: Date) -> String {
        match (&self.date, self.late) {
            (Some(date), None) => format!("{} · {}", self.text(), short_date(date, today)),
            _ => self.text(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemRow {
    pub id: String,
    pub title: String,
    pub glyph: Glyph,
    /// "Now·2", or "—" when archived.
    pub position: String,
    pub tags: Vec<Tag>,
    /// Every chip, sorted by date; the row shows the first `CHIPS`.
    pub chips: Vec<Chip>,
    /// "filed 11-12", or "closed 11-27" when archived.
    pub date: String,
    pub archived: bool,
    pub declined: bool,
    pub matches: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RowKind {
    Separator {
        section: String,
        label: String,
        collapsed: bool,
    },
    Item(ItemRow),
    Fold {
        count: usize,
        unfolded: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub kind: RowKind,
    /// The section it belongs to: a bucket, `archived` or `other`.
    pub section: String,
    pub lane: lanes::Row,
}

impl Row {
    /// What the selection holds: an item id, `§<section>` for a separator,
    /// or `FOLD`.
    pub fn key(&self) -> String {
        match &self.kind {
            RowKind::Item(item) => item.id.clone(),
            RowKind::Separator { section, .. } => format!("§{section}"),
            RowKind::Fold { .. } => FOLD.into(),
        }
    }
}

/// Where a find match is, and what has to open for it to show.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reveal {
    Shown,
    Section(String),
    Fold,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hit {
    pub id: String,
    pub reveal: Reveal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FilterBar {
    pub milestone: String,
    pub date: Option<String>,
    /// "4 due open, 2 needed first · 1 closed"
    pub counts: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Queue {
    pub rows: Vec<Row>,
    pub lanes: Lanes,
    /// Every find match, shown or not, in queue order.
    pub hits: Vec<Hit>,
    pub filter: Option<FilterBar>,
}

impl Queue {
    pub fn position(&self, key: &str) -> Option<usize> {
        self.rows.iter().position(|r| r.key() == key)
    }

    pub fn hidden_hits(&self) -> usize {
        self.hits.iter().filter(|h| h.reveal != Reveal::Shown).count()
    }
}

pub fn bucket_label(section: &str) -> String {
    match section {
        "now" => "Now".into(),
        "next" => "Next".into(),
        "later" => "Later".into(),
        ARCHIVED => "Archived".into(),
        OTHER => "Other".into(),
        other => other.into(),
    }
}

fn section_of(item: &Item) -> String {
    if item.archived {
        return ARCHIVED.into();
    }
    match item.bucket() {
        b @ ("now" | "next" | "later") => b.into(),
        _ => OTHER.into(),
    }
}

/// Lowercased id, title and text, so find is case-insensitive.
fn matches(item: &Item, needle: &str) -> bool {
    !needle.is_empty()
        && [item.id.as_str(), item.title(), item.body.as_str()]
            .iter()
            .any(|s| s.to_lowercase().contains(needle))
}

pub fn build(snapshot: &Snapshot, options: &Options, changed: &BTreeSet<String>, today: Date) -> Queue {
    let milestones: HashMap<&str, &Milestone> = snapshot.milestones.iter().map(|m| (m.id.as_str(), m)).collect();
    let open: HashMap<&str, &Item> = snapshot.items.iter().map(|i| (i.id.as_str(), i)).collect();
    let needle = options.find.to_lowercase();

    // Which open items the filter keeps, and which of those are needed first.
    let (scope, needed, filter) = match &options.filter {
        Some(m) => {
            let due: Vec<&Item> = snapshot.items.iter().filter(|i| i.due.iter().any(|d| d == m)).collect();
            let needed = needed_first(&due, &open);
            let closed = snapshot
                .archived
                .iter()
                .filter(|i| i.due.iter().any(|d| d == m))
                .count();
            let bar = FilterBar {
                milestone: m.clone(),
                date: milestones.get(m.as_str()).map(|ms| ms.date.clone()),
                counts: format!(
                    "{} due open, {} needed first · {closed} closed",
                    due.len(),
                    needed.len()
                ),
            };
            let mut keep: HashSet<String> = due.iter().map(|i| i.id.clone()).collect();
            keep.extend(needed.iter().cloned());
            (Some(keep), needed, Some(bar))
        }
        None => (None, HashSet::new(), None),
    };
    let in_scope = |item: &Item| scope.as_ref().is_none_or(|keep| keep.contains(&item.id));
    let open_shown: Vec<&Item> = snapshot.items.iter().filter(|i| in_scope(i)).collect();
    let open_ids: HashSet<&str> = open_shown.iter().map(|i| i.id.as_str()).collect();

    // Sections, top to bottom: archived (oldest first, so a dependency sits
    // above what depends on it), then each bucket in queue order.
    enum Slot<'a> {
        Sep(String, String, bool),
        Item(&'a Item),
        Fold(usize, bool),
    }
    let mut slots: Vec<Slot> = Vec::new();
    let mut hits: Vec<Hit> = Vec::new();
    if options.show_archived {
        let collapsed = options.collapsed.contains(ARCHIVED);
        let (linked, rest): (Vec<&Item>, Vec<&Item>) = snapshot
            .archived
            .iter()
            .rev()
            .partition(|a| a.dependents.iter().any(|d| open_ids.contains(d.as_str())));
        let unfolded = options.archived_unfolded && !rest.is_empty();
        let shown = if collapsed {
            0
        } else if unfolded {
            snapshot.archived.len()
        } else {
            linked.len()
        };
        let label = format!("Archived · {} ({shown} shown)", snapshot.archived.len());
        slots.push(Slot::Sep(ARCHIVED.into(), label, collapsed));
        if unfolded {
            // Everything, oldest first, so a dependency sits above what
            // depends on it.
            if !collapsed {
                slots.push(Slot::Fold(rest.len(), true));
            }
            for item in snapshot.archived.iter().rev() {
                if matches(item, &needle) {
                    let reveal = if collapsed {
                        Reveal::Section(ARCHIVED.into())
                    } else {
                        Reveal::Shown
                    };
                    hits.push(Hit {
                        id: item.id.clone(),
                        reveal,
                    });
                }
                if !collapsed {
                    slots.push(Slot::Item(item));
                }
            }
        } else {
            for item in &linked {
                if matches(item, &needle) {
                    let reveal = if collapsed {
                        Reveal::Section(ARCHIVED.into())
                    } else {
                        Reveal::Shown
                    };
                    hits.push(Hit {
                        id: item.id.clone(),
                        reveal,
                    });
                }
                if !collapsed {
                    slots.push(Slot::Item(item));
                }
            }
            if !rest.is_empty() && !collapsed {
                slots.push(Slot::Fold(rest.len(), false));
            }
            for item in &rest {
                if matches(item, &needle) {
                    let reveal = if collapsed {
                        Reveal::Section(ARCHIVED.into())
                    } else {
                        Reveal::Fold
                    };
                    hits.push(Hit {
                        id: item.id.clone(),
                        reveal,
                    });
                }
            }
        }
    }
    let mut sections: Vec<String> = Vec::new();
    for item in &open_shown {
        let s = section_of(item);
        if !sections.contains(&s) {
            sections.push(s);
        }
    }
    for section in &sections {
        let members: Vec<&Item> = open_shown
            .iter()
            .copied()
            .filter(|i| &section_of(i) == section)
            .collect();
        let collapsed = options.collapsed.contains(section);
        slots.push(Slot::Sep(
            section.clone(),
            format!("{} · {}", bucket_label(section), members.len()),
            collapsed,
        ));
        for item in members {
            if matches(item, &needle) {
                let reveal = if collapsed {
                    Reveal::Section(section.clone())
                } else {
                    Reveal::Shown
                };
                hits.push(Hit {
                    id: item.id.clone(),
                    reveal,
                });
            }
            if !collapsed {
                slots.push(Slot::Item(item));
            }
        }
    }

    let drawn: HashSet<&str> = slots
        .iter()
        .filter_map(|s| match s {
            Slot::Item(i) => Some(i.id.as_str()),
            _ => None,
        })
        .collect();
    let inputs: Vec<Option<lanes::Input>> = slots
        .iter()
        .map(|slot| match slot {
            Slot::Item(item) => Some(lanes::Input {
                id: item.id.clone(),
                deps: item
                    .depends_on
                    .iter()
                    .filter(|d| !milestones.contains_key(d.as_str()))
                    .cloned()
                    .collect(),
                archived: item.archived,
                stub: !hidden_deps(item, &open, &drawn).is_empty(),
            }),
            _ => None,
        })
        .collect();
    let lanes = lanes::layout(&inputs);

    let rows = slots
        .iter()
        .zip(&lanes.rows)
        .map(|(slot, lane)| {
            let (kind, section) = match slot {
                Slot::Sep(section, label, collapsed) => (
                    RowKind::Separator {
                        section: section.clone(),
                        label: label.clone(),
                        collapsed: *collapsed,
                    },
                    section.clone(),
                ),
                Slot::Fold(count, unfolded) => (
                    RowKind::Fold {
                        count: *count,
                        unfolded: *unfolded,
                    },
                    ARCHIVED.into(),
                ),
                Slot::Item(item) => (
                    RowKind::Item(item_row(
                        item,
                        &milestones,
                        &open,
                        &drawn,
                        needed.contains(&item.id),
                        changed.contains(&item.path),
                        matches(item, &needle),
                        today,
                    )),
                    section_of(item),
                ),
            };
            Row {
                kind,
                section,
                lane: lane.clone(),
            }
        })
        .collect();
    Queue {
        rows,
        lanes,
        hits,
        filter,
    }
}

/// The open items `due` waits on through `depends_on`, all the way up, that
/// aren't due themselves.
fn needed_first(due: &[&Item], open: &HashMap<&str, &Item>) -> HashSet<String> {
    let due_ids: HashSet<&str> = due.iter().map(|i| i.id.as_str()).collect();
    let mut needed = HashSet::new();
    let mut stack: Vec<&str> = due
        .iter()
        .flat_map(|i| i.depends_on.iter().map(String::as_str))
        .collect();
    while let Some(id) = stack.pop() {
        let Some(item) = open.get(id) else { continue };
        if due_ids.contains(id) || !needed.insert(id.to_string()) {
            continue;
        }
        stack.extend(item.depends_on.iter().map(String::as_str));
    }
    needed
}

/// Open dependencies that exist but aren't drawn. An archived dependency
/// hidden because Show archived is off is not news, so it isn't listed.
fn hidden_deps<'a>(item: &'a Item, open: &HashMap<&str, &Item>, drawn: &HashSet<&str>) -> Vec<&'a str> {
    item.depends_on
        .iter()
        .map(String::as_str)
        .filter(|d| open.contains_key(d) && !drawn.contains(d))
        .collect()
}

#[allow(clippy::too_many_arguments)]
fn item_row(
    item: &Item,
    milestones: &HashMap<&str, &Milestone>,
    open: &HashMap<&str, &Item>,
    drawn: &HashSet<&str>,
    needed: bool,
    changed: bool,
    matches: bool,
    today: Date,
) -> ItemRow {
    let mut tags = Vec::new();
    let outcome = item.text("outcome");
    if item.archived {
        if outcome == Some("declined") {
            tags.push(tag(TagKind::Declined, "declined", "declined"));
        } else {
            let text = match item.text("shipped_as") {
                Some(pr) => format!("shipped {pr}"),
                None => "shipped".into(),
            };
            tags.push(tag(TagKind::Shipped, &text, &text));
        }
    }
    if needed {
        tags.push(tag(
            TagKind::NeededFirst,
            "needed first",
            "not due for the milestone, but something due for it waits on it",
        ));
    }
    if let Some(gate) = item.text("gate") {
        tags.push(tag(TagKind::Gate, "gate", &format!("gate: {gate}")));
    }
    if let Some(blocked) = item.text("blocked_on") {
        tags.push(tag(TagKind::Blocked, "⊘ blocked_on", &format!("blocked on: {blocked}")));
    }
    for dep in hidden_deps(item, open, drawn) {
        tags.push(tag(
            TagKind::Hidden,
            &format!("↑{dep}"),
            &format!("depends on {dep}, which is hidden"),
        ));
    }
    if changed {
        tags.push(tag(
            TagKind::Changed,
            "changed",
            "the file changed on disk since this load: F5 to reload",
        ));
    }
    let glyph = if item.archived {
        Glyph::Archived
    } else if item.text("blocked_on").is_some() {
        Glyph::Blocked
    } else {
        match item.state {
            Some(ItemState::Ready) => Glyph::Ready,
            Some(ItemState::Waiting) => Glyph::Waiting,
            Some(ItemState::Later) => Glyph::Later,
            Some(ItemState::Unknown) | None => Glyph::Unknown,
        }
    };
    let date = if item.archived {
        item.text("closed").map(|d| format!("closed {}", short_date(d, today)))
    } else {
        item.text("filed").map(|d| format!("filed {}", short_date(d, today)))
    };
    ItemRow {
        id: item.id.clone(),
        title: item.title().to_string(),
        glyph,
        position: if item.archived {
            "—".into()
        } else {
            format!("{}·{}", bucket_label(item.bucket()), item.rank())
        },
        tags,
        chips: if item.archived {
            vec![]
        } else {
            chips(item, milestones, today)
        },
        date: date.unwrap_or_default(),
        archived: item.archived,
        declined: outcome == Some("declined"),
        matches,
    }
}

fn tag(kind: TagKind, text: &str, hover: &str) -> Tag {
    Tag {
        kind,
        text: text.into(),
        hover: hover.into(),
    }
}

/// ◆ for each milestone the item is due for, ◇ for each its depends_on
/// names; by date, undeclared ones last.
pub fn chips(item: &Item, milestones: &HashMap<&str, &Milestone>, today: Date) -> Vec<Chip> {
    let mut list: Vec<Chip> = Vec::new();
    let waits = item.depends_on.iter().filter(|d| milestones.contains_key(d.as_str()));
    let named = item
        .due
        .iter()
        .map(|m| (m, ChipKind::Due))
        .chain(waits.map(|m| (m, ChipKind::Waits)));
    for (id, kind) in named {
        if list.iter().any(|c| &c.id == id) {
            continue;
        }
        let milestone = milestones.get(id.as_str());
        let reached = milestone.is_some_and(|m| m.reached.is_some());
        let date = milestone.map(|m| m.date.clone());
        let late = match (&date, reached || item.archived) {
            (Some(d), false) => days_since(d, today).filter(|&n| n > 0),
            _ => None,
        };
        list.push(Chip {
            kind,
            id: id.clone(),
            date,
            reached,
            late,
        });
    }
    list.sort_by(|a, b| (a.date.is_none(), &a.date, &a.id).cmp(&(b.date.is_none(), &b.date, &b.id)));
    list
}

/// Days from `date` to `today`; negative in the future.
pub fn days_since(date: &str, today: Date) -> Option<i64> {
    let date: Date = date.parse().ok()?;
    Some(i64::from((today - date).get_days()))
}

/// "11-12" this year, the full date otherwise.
pub fn short_date(date: &str, today: Date) -> String {
    match date.parse::<Date>() {
        Ok(d) if d.year() == today.year() => format!("{:02}-{:02}", d.month(), d.day()),
        _ => date.to_string(),
    }
}

/// The earliest unreached milestone the item is due for, which F filters to.
pub fn filter_target(item: &Item, snapshot: &Snapshot) -> Option<String> {
    snapshot
        .milestones
        .iter()
        .filter(|m| m.reached.is_none() && item.due.contains(&m.id))
        .min_by(|a, b| (&a.date, &a.id).cmp(&(&b.date, &b.id)))
        .map(|m| m.id.clone())
}

/// One coloured run of the strip's second line.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Plain,
    Strong,
    Milestone,
    Blocked,
    Muted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Strip {
    pub glyph: Glyph,
    pub id: String,
    pub title: String,
    /// Every chip, with its date.
    pub chips: Vec<String>,
    /// "Now·2 · changed 11 d ago"
    pub place: String,
    /// Why it waits, its gate or blocked_on, and anything else a tooltip
    /// would say: never cut while it fits.
    pub reason: Vec<(String, Tone)>,
    /// The first sentence of its text, which shortens first.
    pub sentence: String,
}

impl Strip {
    pub fn reason_text(&self) -> String {
        self.reason.iter().map(|(s, _)| s.as_str()).collect()
    }
}

pub fn strip(item: &Item, snapshot: &Snapshot, today: Date) -> Strip {
    let milestones: HashMap<&str, &Milestone> = snapshot.milestones.iter().map(|m| (m.id.as_str(), m)).collect();
    let mut reason: Vec<(String, Tone)> = Vec::new();
    let part = |reason: &mut Vec<(String, Tone)>| {
        if !reason.is_empty() {
            reason.push((" · ".into(), Tone::Muted));
        }
    };
    if item.archived {
        let when = item.text("closed").unwrap_or("?");
        let text = match (item.text("outcome"), item.text("shipped_as")) {
            (Some("declined"), _) => format!("Declined on {when}"),
            (_, Some(pr)) => format!("Shipped in {pr} on {when}"),
            _ => format!("Shipped on {when}"),
        };
        reason.push((text, Tone::Plain));
    } else if let Some(waits) = &item.waits_on {
        let mut names: Vec<(String, Tone)> = waits.items.iter().map(|i| (i.clone(), Tone::Plain)).collect();
        names.extend(waits.milestones.iter().map(|m| (format!("◇ {m}"), Tone::Milestone)));
        if !names.is_empty() {
            reason.push(("Waits on ".into(), Tone::Plain));
            let n = names.len();
            for (k, name) in names.into_iter().enumerate() {
                if k > 0 {
                    reason.push((if k + 1 == n { " and " } else { ", " }.into(), Tone::Plain));
                }
                reason.push(name);
            }
        }
    }
    if let Some(gate) = item.text("gate") {
        part(&mut reason);
        reason.push(("gate: ".into(), Tone::Strong));
        reason.push((gate.into(), Tone::Plain));
    }
    if let Some(blocked) = item.text("blocked_on") {
        part(&mut reason);
        reason.push(("⊘ blocked on: ".into(), Tone::Blocked));
        reason.push((blocked.into(), Tone::Plain));
    }
    let chip_list = if item.archived {
        vec![]
    } else {
        chips(item, &milestones, today)
    };
    let mut place = if item.archived {
        "archived".to_string()
    } else {
        format!("{}·{}", bucket_label(item.bucket()), item.rank())
    };
    if let Some(days) = item.committed.as_deref().and_then(|d| days_since(d, today)) {
        place.push_str(&match days {
            ..=0 => " · changed today".to_string(),
            1 => " · changed 1 d ago".to_string(),
            n => format!(" · changed {n} d ago"),
        });
    }
    Strip {
        glyph: item_row(
            item,
            &milestones,
            &HashMap::new(),
            &HashSet::new(),
            false,
            false,
            false,
            today,
        )
        .glyph,
        id: item.id.clone(),
        title: item.title().to_string(),
        chips: chip_list.iter().map(|c| c.long_text(today)).collect(),
        place,
        reason,
        sentence: first_sentence(&item.body),
    }
}

/// The first sentence of an item's text, as plain text: headings, blank
/// lines and dated-note labels skipped, inline Markdown stripped.
pub fn first_sentence(body: &str) -> String {
    let mut paragraph = String::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            if paragraph.is_empty() {
                continue;
            }
            break;
        }
        if line.starts_with('#') && paragraph.is_empty() {
            continue;
        }
        if !paragraph.is_empty() {
            paragraph.push(' ');
        }
        paragraph.push_str(line.trim_start_matches("- "));
    }
    let plain = strip_markdown(&paragraph);
    match plain.find(". ") {
        Some(end) => plain[..=end].to_string(),
        None => plain,
    }
}

fn strip_markdown(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(c) = rest.chars().next() {
        if c == '[' {
            // [label](target) → label
            if let Some(close) = rest.find("](")
                && let Some(end) = rest[close..].find(')')
            {
                out.push_str(&rest[1..close]);
                rest = &rest[close + end + 1..];
                continue;
            }
        }
        if c != '*' && c != '`' {
            out.push(c);
        }
        rest = &rest[c.len_utf8()..];
    }
    out
}

/// Which item paths, relative to the roadmap directory, a set of changed
/// paths names. `dir` is the directory as watched; notify may report it
/// canonicalised, so both spellings are tried.
pub fn changed_paths(dir: &std::path::Path, paths: &[std::path::PathBuf]) -> Vec<String> {
    let canonical = dir.canonicalize().ok();
    paths
        .iter()
        .filter_map(|p| {
            p.strip_prefix(dir)
                .ok()
                .or_else(|| canonical.as_deref().and_then(|c| p.strip_prefix(c).ok()))
        })
        .map(|rel| {
            rel.components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/")
        })
        .collect()
}

/// The vertical scroll offset that brings row `index` into view, or None if
/// it already is.
pub fn scroll_to(index: usize, row_height: f32, offset: f32, view: f32) -> Option<f32> {
    let top = index as f32 * row_height;
    let bottom = top + row_height;
    if top < offset {
        Some(top)
    } else if bottom > offset + view {
        Some((bottom - view).max(0.0))
    } else {
        None
    }
}

/// How wide the strip's reason and sentence can be in `available` points:
/// the sentence gives way first, then the reason.
pub fn fit(reason: f32, sentence: f32, gap: f32, available: f32) -> (f32, f32) {
    if reason >= available {
        (available, 0.0)
    } else {
        let left = (available - reason - gap).max(0.0);
        (reason, sentence.min(left))
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::snapshot::WaitsOn;
    use serde_json::json;

    pub fn today() -> Date {
        "2026-11-27".parse().unwrap()
    }

    pub fn open(id: &str, bucket: &str, rank: i64, deps: &[&str]) -> Item {
        Item {
            id: id.into(),
            path: format!("items/{id}.md"),
            frontmatter: json!({"title": id.to_uppercase(), "bucket": bucket, "rank": rank, "filed": "2026-11-12"}),
            depends_on: deps.iter().map(|d| d.to_string()).collect(),
            state: Some(if bucket == "later" {
                ItemState::Later
            } else if deps.is_empty() {
                ItemState::Ready
            } else {
                ItemState::Waiting
            }),
            waits_on: Some(WaitsOn::default()),
            ..Item::default()
        }
    }

    pub fn closed(id: &str, outcome: &str, deps: &[&str], dependents: &[&str]) -> Item {
        Item {
            id: id.into(),
            path: format!("archive/{id}.md"),
            archived: true,
            frontmatter: json!({"title": id.to_uppercase(), "closed": "2026-11-20", "outcome": outcome, "shipped_as": "#7"}),
            depends_on: deps.iter().map(|d| d.to_string()).collect(),
            dependents: dependents.iter().map(|d| d.to_string()).collect(),
            ..Item::default()
        }
    }

    fn milestone(id: &str, date: &str, reached: bool) -> Milestone {
        Milestone {
            id: id.into(),
            title: id.into(),
            date: date.into(),
            reached: reached.then(|| "2026-11-01".into()),
            ..Milestone::default()
        }
    }

    fn snap(items: Vec<Item>, archived: Vec<Item>) -> Snapshot {
        Snapshot {
            schema: 1,
            ok: true,
            items,
            archived,
            ..Snapshot::default()
        }
    }

    fn keys(q: &Queue) -> Vec<String> {
        q.rows.iter().map(Row::key).collect()
    }

    fn row<'a>(q: &'a Queue, id: &str) -> &'a ItemRow {
        q.rows
            .iter()
            .find_map(|r| match &r.kind {
                RowKind::Item(i) if i.id == id => Some(i),
                _ => None,
            })
            .unwrap_or_else(|| panic!("no row {id}"))
    }

    fn build_with(s: &Snapshot, o: &Options) -> Queue {
        build(s, o, &BTreeSet::new(), today())
    }

    #[test]
    fn a_separator_heads_each_bucket_with_its_count() {
        let s = snap(
            vec![
                open("a", "now", 1, &[]),
                open("b", "next", 1, &[]),
                open("c", "next", 2, &[]),
            ],
            vec![],
        );
        let q = build_with(&s, &Options::default());
        assert_eq!(keys(&q), ["§now", "a", "§next", "b", "c"]);
        let RowKind::Separator { label, .. } = &q.rows[2].kind else {
            panic!()
        };
        assert_eq!(label, "Next · 2");
        assert_eq!(row(&q, "c").position, "Next·2");
        assert_eq!(row(&q, "c").date, "filed 11-12");
    }

    #[test]
    fn collapsing_a_bucket_hides_its_rows_and_flags_dependencies_in_it() {
        let s = snap(vec![open("a", "now", 1, &[]), open("b", "next", 1, &["a"])], vec![]);
        let o = Options {
            collapsed: ["now".to_string()].into(),
            ..Options::default()
        };
        let q = build_with(&s, &o);
        assert_eq!(keys(&q), ["§now", "§next", "b"]);
        let b = row(&q, "b");
        assert_eq!(b.tags[0].kind, TagKind::Hidden);
        assert_eq!(b.tags[0].text, "↑a");
        assert!(q.rows[2].lane.stub);
    }

    #[test]
    fn an_archived_dependency_hidden_by_show_archived_is_not_flagged() {
        let s = snap(
            vec![open("b", "now", 1, &["old", "gui-preview"])],
            vec![closed("old", "shipped", &[], &["b"])],
        );
        let q = build_with(&s, &Options::default());
        assert!(row(&q, "b").tags.is_empty());
        assert!(!q.rows[1].lane.stub);
    }

    #[test]
    fn each_glyph() {
        let mut blocked = open("d", "later", 2, &[]);
        blocked.frontmatter["blocked_on"] = json!("a question");
        let mut odd = open("e", "someday", 1, &[]);
        odd.state = None;
        let s = snap(
            vec![
                open("a", "now", 1, &[]),
                open("b", "now", 2, &["a"]),
                open("c", "later", 1, &["b"]),
                blocked,
                odd,
            ],
            vec![closed("z", "shipped", &[], &["a"])],
        );
        let q = build_with(
            &s,
            &Options {
                show_archived: true,
                ..Options::default()
            },
        );
        let glyphs: Vec<Glyph> = ["a", "b", "c", "d", "e", "z"]
            .iter()
            .map(|id| row(&q, id).glyph)
            .collect();
        use Glyph::*;
        assert_eq!(glyphs, [Ready, Waiting, Later, Blocked, Unknown, Archived]);
        assert_eq!(keys(&q).last().unwrap(), "e");
        assert!(keys(&q).contains(&"§other".to_string()));
    }

    #[test]
    fn each_tag() {
        let mut a = open("a", "now", 1, &[]);
        a.frontmatter["gate"] = json!("the bar to clear");
        let mut b = open("b", "later", 1, &[]);
        b.frontmatter["blocked_on"] = json!("whether to");
        let s = snap(
            vec![a, b],
            vec![
                closed("x", "shipped", &[], &["a"]),
                closed("y", "declined", &[], &["a"]),
            ],
        );
        let changed: BTreeSet<String> = ["items/a.md".to_string()].into();
        let q = build(
            &s,
            &Options {
                show_archived: true,
                ..Options::default()
            },
            &changed,
            today(),
        );
        let texts = |id| row(&q, id).tags.iter().map(|t| t.text.clone()).collect::<Vec<_>>();
        assert_eq!(texts("a"), ["gate", "changed"]);
        assert_eq!(row(&q, "a").tags[0].hover, "gate: the bar to clear");
        assert_eq!(texts("b"), ["⊘ blocked_on"]);
        assert_eq!(texts("x"), ["shipped #7"]);
        assert_eq!(texts("y"), ["declined"]);
        assert!(row(&q, "y").declined);
        assert_eq!(row(&q, "y").date, "closed 11-20");
    }

    #[test]
    fn chips_sort_by_date_and_mark_reached_late_and_undeclared() {
        let mut a = open("a", "now", 1, &["v3", "b"]);
        a.due = vec!["late-one".into(), "v2".into(), "ghost".into()];
        let mut s = snap(vec![a], vec![]);
        s.milestones = vec![
            milestone("v2", "2026-11-02", true),
            milestone("late-one", "2026-11-20", false),
            milestone("v3", "2027-02-01", false),
        ];
        let q = build_with(&s, &Options::default());
        let chips = &row(&q, "a").chips;
        let texts: Vec<String> = chips.iter().map(Chip::text).collect();
        assert_eq!(texts, ["√ v2", "◆ late-one · late 7 d", "◇ v3", "◆ ghost"]);
        assert_eq!(chips[2].long_text(today()), "◇ v3 · 2027-02-01");
        assert_eq!(chips[3].date, None);
    }

    #[test]
    fn show_archived_lists_linked_items_oldest_first_and_folds_the_rest() {
        // Newest first, as the snapshot has them: c was closed after b.
        let archived = vec![
            closed("c", "shipped", &["b"], &["a"]),
            closed("lone", "declined", &[], &[]),
            closed("b", "shipped", &[], &["c"]),
        ];
        let s = snap(vec![open("a", "now", 1, &["c"])], archived);
        let mut o = Options {
            show_archived: true,
            ..Options::default()
        };
        let q = build_with(&s, &o);
        assert_eq!(keys(&q), ["§archived", "c", FOLD, "§now", "a"]);
        let RowKind::Separator { label, .. } = &q.rows[0].kind else {
            panic!()
        };
        assert_eq!(label, "Archived · 3 (1 shown)");
        assert_eq!(q.rows[4].lane.into.len(), 1);
        assert!(q.rows[4].lane.into[0].archived);

        o.archived_unfolded = true;
        let q = build_with(&s, &o);
        // Unfolded, all of them oldest first: b sits above c, which needs it.
        assert_eq!(keys(&q), ["§archived", FOLD, "b", "lone", "c", "§now", "a"]);
        assert!(!q.rows[4].lane.stub);
        assert_eq!(q.rows[4].lane.into.len(), 1);
    }

    #[test]
    fn the_filter_keeps_due_items_and_everything_they_need_first() {
        let mut due = open("due", "next", 1, &["mid"]);
        due.due = vec!["m".into()];
        let s = Snapshot {
            milestones: vec![milestone("m", "2026-12-31", false)],
            archived: vec![{
                let mut c = closed("done", "shipped", &[], &[]);
                c.due = vec!["m".into()];
                c
            }],
            ..snap(
                vec![
                    open("root", "now", 1, &[]),
                    open("other", "now", 2, &[]),
                    open("mid", "now", 3, &["root"]),
                    due,
                ],
                vec![],
            )
        };
        let q = build_with(
            &s,
            &Options {
                filter: Some("m".into()),
                ..Options::default()
            },
        );
        assert_eq!(keys(&q), ["§now", "root", "mid", "§next", "due"]);
        assert_eq!(row(&q, "root").tags[0].kind, TagKind::NeededFirst);
        assert!(row(&q, "due").tags.is_empty());
        let bar = q.filter.unwrap();
        assert_eq!(bar.counts, "1 due open, 2 needed first · 1 closed");
        assert_eq!(bar.date.as_deref(), Some("2026-12-31"));
    }

    #[test]
    fn filter_target_is_the_earliest_unreached_milestone() {
        let mut a = open("a", "now", 1, &[]);
        a.due = vec!["late".into(), "early".into(), "done".into()];
        let mut s = snap(vec![a.clone()], vec![]);
        s.milestones = vec![
            milestone("done", "2026-01-01", true),
            milestone("early", "2026-12-01", false),
            milestone("late", "2027-01-01", false),
        ];
        assert_eq!(filter_target(&a, &s).as_deref(), Some("early"));
        assert_eq!(filter_target(&open("b", "now", 1, &[]), &s), None);
    }

    #[test]
    fn find_marks_matches_and_counts_hidden_ones() {
        let mut a = open("a", "now", 1, &[]);
        a.body = "Mentions Widgets here.".into();
        let s = snap(
            vec![a, open("widget-b", "next", 1, &[]), open("c", "next", 2, &[])],
            vec![closed("old-widget", "shipped", &[], &[])],
        );
        let o = Options {
            find: "WIDGET".into(),
            show_archived: true,
            collapsed: ["next".to_string()].into(),
            ..Options::default()
        };
        let q = build_with(&s, &o);
        assert!(row(&q, "a").matches);
        assert_eq!(
            q.hits,
            [
                Hit {
                    id: "old-widget".into(),
                    reveal: Reveal::Fold
                },
                Hit {
                    id: "a".into(),
                    reveal: Reveal::Shown
                },
                Hit {
                    id: "widget-b".into(),
                    reveal: Reveal::Section("next".into())
                },
            ]
        );
        assert_eq!(q.hidden_hits(), 2);
        let none = build_with(
            &s,
            &Options {
                find: "zzz".into(),
                ..Options::default()
            },
        );
        assert!(none.hits.is_empty());
    }

    #[test]
    fn the_strip_says_everything_a_tooltip_would() {
        let mut a = open("a", "next", 3, &["b", "m"]);
        a.waits_on = Some(WaitsOn {
            items: vec!["b".into(), "c".into()],
            milestones: vec!["m".into()],
        });
        a.frontmatter["gate"] = json!("the view has shipped");
        a.frontmatter["blocked_on"] = json!("a question");
        a.due = vec!["m2".into()];
        a.committed = Some("2026-11-16".into());
        a.body = "\n## Heading\n\nThe index draws a **chart** of [items](x.md). It is slow.\n".into();
        let mut s = snap(vec![a.clone()], vec![]);
        s.milestones = vec![
            milestone("m", "2026-12-15", false),
            milestone("m2", "2027-02-01", false),
        ];
        let strip = strip(&a, &s, today());
        assert_eq!(
            strip.reason_text(),
            "Waits on b, c and ◇ m · gate: the view has shipped · ⊘ blocked on: a question"
        );
        assert_eq!(strip.chips, ["◇ m · 12-15", "◆ m2 · 2027-02-01"]);
        assert_eq!(strip.place, "Next·3 · changed 11 d ago");
        assert_eq!(strip.sentence, "The index draws a chart of items.");
        assert_eq!(strip.glyph, Glyph::Blocked);
    }

    #[test]
    fn an_archived_strip_says_how_it_closed() {
        let c = closed("c", "shipped", &[], &[]);
        let strip = strip(&c, &snap(vec![], vec![c.clone()]), today());
        assert_eq!(strip.reason_text(), "Shipped in #7 on 2026-11-20");
        assert_eq!(strip.place, "archived");
    }

    #[test]
    fn first_sentence_skips_headings_and_strips_markdown() {
        assert_eq!(first_sentence(""), "");
        assert_eq!(first_sentence("\n\nOne line, no stop"), "One line, no stop");
        assert_eq!(
            first_sentence("# T\n\nUse `code` and snake_case. Then more."),
            "Use code and snake_case."
        );
        assert_eq!(first_sentence("A wrapped\nline. Next."), "A wrapped line.");
    }

    #[test]
    fn changed_paths_are_relative_to_the_roadmap() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("roadmap");
        std::fs::create_dir_all(dir.join("items")).unwrap();
        let canonical = dir.canonicalize().unwrap();
        let paths = vec![
            dir.join("items/a.md"),
            canonical.join("archive/b.md"),
            PathBuf::from("/elsewhere/c.md"),
        ];
        assert_eq!(changed_paths(&dir, &paths), ["items/a.md", "archive/b.md"]);
    }

    use std::path::PathBuf;

    #[test]
    fn scroll_to_brings_a_row_into_view() {
        assert_eq!(scroll_to(5, 24.0, 0.0, 240.0), None);
        assert_eq!(scroll_to(12, 24.0, 0.0, 240.0), Some(72.0));
        assert_eq!(scroll_to(1, 24.0, 100.0, 240.0), Some(24.0));
    }

    /// The real CLI, when ROADMAP_CLI names it: this repo's roadmap and the
    /// fixture with every state build into a queue, in each archived mode.
    #[test]
    fn the_real_cli_exports_build_every_state() {
        let Ok(text) = std::env::var("ROADMAP_CLI") else {
            eprintln!("skipped: set ROADMAP_CLI, e.g. \"node cli/bin/roadmap.js\", to run it");
            return;
        };
        let gui = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let env = crate::cli::Env {
            cli_override: Some(text),
            path: std::env::var_os("PATH"),
            cwd: gui.into(),
        };
        let cli = crate::cli::resolve(&env).unwrap();
        let export = |dir: &std::path::Path| {
            crate::cli::export(&cli, dir, crate::cli::TIMEOUT).unwrap_or_else(|p| panic!("{}: {p:?}", dir.display()))
        };
        let real_today = jiff::ZonedDateTime::now().date();
        for dir in [gui.join("../roadmap"), gui.join("tests/fixtures/queue-states/roadmap")] {
            let s = export(&dir);
            for (show_archived, archived_unfolded) in [(false, false), (true, false), (true, true)] {
                let o = Options {
                    show_archived,
                    archived_unfolded,
                    ..Options::default()
                };
                let q = build(&s, &o, &BTreeSet::new(), real_today);
                for item in &s.items {
                    assert!(q.position(&item.id).is_some(), "{}: {}", dir.display(), item.id);
                }
                assert_eq!(q.lanes.rows.len(), q.rows.len());
            }
        }

        let s = export(&gui.join("tests/fixtures/queue-states/roadmap"));
        let q = build(&s, &Options::default(), &BTreeSet::new(), real_today);
        assert!(row(&q, "base").chips[0].late.is_some(), "overdue is late");
        assert_eq!(row(&q, "fork-b").chips.len(), 3, "two chips and +1");
        assert_eq!(row(&q, "merge").tags[0].kind, TagKind::Gate);
        let merge = &q.rows[q.position("merge").unwrap()].lane;
        assert_eq!(merge.into.len(), 2, "both branches end at merge");
        assert_eq!(row(&q, "needs-old").chips[0].text(), "◇ v3");
        assert!(
            row(&q, "needs-old").tags.is_empty(),
            "a hidden archived dependency isn't flagged"
        );
        assert!(row(&q, "reached-only").chips[0].reached);
        assert_eq!(row(&q, "reached-only").glyph, Glyph::Ready);
        assert_eq!(row(&q, "question").glyph, Glyph::Blocked);
        assert_eq!(row(&q, "follows").glyph, Glyph::Later);

        let shown = Options {
            show_archived: true,
            ..Options::default()
        };
        let q = build(&s, &shown, &BTreeSet::new(), real_today);
        assert_eq!(keys(&q)[..3], ["§archived", "old-done", FOLD]);
        let unfolded = Options {
            archived_unfolded: true,
            ..shown
        };
        let q = build(&s, &unfolded, &BTreeSet::new(), real_today);
        assert!(q.position("old-root").unwrap() < q.position("old-done").unwrap());
        assert_eq!(row(&q, "old-declined").tags[0].kind, TagKind::Declined);
    }

    #[test]
    fn fit_shortens_the_sentence_before_the_reason() {
        assert_eq!(fit(100.0, 50.0, 10.0, 300.0), (100.0, 50.0));
        assert_eq!(fit(100.0, 500.0, 10.0, 300.0), (100.0, 190.0));
        assert_eq!(fit(400.0, 50.0, 10.0, 300.0), (300.0, 0.0));
    }
}
