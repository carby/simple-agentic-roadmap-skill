//! What the GUI shows, as a pure state machine with no egui and no I/O:
//! `update` takes a message and returns the effects to carry out. The views
//! that come after the frame add `View` variants and history here.

use std::collections::BTreeSet;
use std::path::PathBuf;

use jiff::civil::Date;

use crate::cli::Problem;
use crate::queue::{self, FOLD, Options, Queue, Reveal, RowKind};
use crate::snapshot::Snapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Load {
    Idle,
    Running { generation: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    /// The Queue tab (Ctrl+1). gui-milestones adds the Milestones tab, and
    /// the detail pages add history.
    Queue,
}

/// A move of the selection through the queue's rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    By(i64),
    Home,
    End,
}

#[derive(Debug)]
pub struct State {
    /// The roadmap being shown; None means "no roadmap here".
    pub roadmap: Option<PathBuf>,
    /// Kept until a new one parses, so a reload never blanks the window.
    pub snapshot: Option<Snapshot>,
    /// When `snapshot` was loaded, as the status bar shows it.
    pub loaded_at: Option<String>,
    pub load: Load,
    generation: u64,
    /// The last load's failure, shown over the kept snapshot.
    pub problem: Option<Problem>,
    /// A folder someone tried to open that holds no roadmap.
    pub not_a_roadmap: Option<PathBuf>,
    /// The files changed on disk since the last load started.
    pub changed: bool,
    pub view: View,
    /// A row key (an item id, `§<section>` or the fold), so a selection
    /// survives a reload.
    pub selected: Option<String>,
    pub options: Options,
    /// Whether the find field is open; `options.find` holds its text.
    pub finding: bool,
    /// Whether the milestone picker F opens is showing.
    pub picking: bool,
    /// Item paths, relative to the roadmap, changed since the last load
    /// started.
    pub changed_files: BTreeSet<String>,
    /// Today, for "late" and "changed N d ago"; the app sets it.
    pub today: Date,
}

#[derive(Debug)]
pub enum Msg {
    Reload,
    LoadDone {
        generation: u64,
        result: Result<Snapshot, Problem>,
        at: String,
    },
    /// Relevant files changed: their paths relative to the roadmap, where
    /// they are inside it.
    FileChanged(Vec<String>),
    /// The person asked to open `requested`; `found` is its roadmap, if any.
    Open {
        requested: PathBuf,
        found: Option<PathBuf>,
    },
    Select(Option<String>),
    /// Ctrl+1: the Queue tab, the only view until gui-milestones.
    Show(View),
    Move(Step),
    /// Collapse or expand a section, or fold or unfold the archived items.
    Toggle(String),
    /// ← and →: collapse (true) or expand the selection's section.
    Collapse(bool),
    ToggleArchived,
    /// F: filter to the selection's earliest unreached milestone, or open
    /// the picker.
    FilterSelected,
    Filter(Option<String>),
    /// Open find (Some) with its text, or close it (None).
    Find(Option<String>),
    FindNext,
    /// Esc: close find, then the picker, then clear the filter.
    Escape,
}

/// What `update` asks the app to do. There is deliberately no effect that
/// runs any CLI command but `export`: the GUI never runs `init`, never
/// writes, and never runs git.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect {
    /// Run `export` for `dir`, and answer with `LoadDone { generation }`.
    Export { generation: u64, dir: PathBuf },
    /// Watch `dir`, replacing any earlier watch.
    Watch(PathBuf),
}

impl State {
    /// The state at launch, and the effects to start with.
    pub fn new(roadmap: Option<PathBuf>) -> (State, Vec<Effect>) {
        let mut state = State {
            roadmap: None,
            snapshot: None,
            loaded_at: None,
            load: Load::Idle,
            generation: 0,
            problem: None,
            not_a_roadmap: None,
            changed: false,
            view: View::Queue,
            selected: None,
            options: Options::default(),
            finding: false,
            picking: false,
            changed_files: BTreeSet::new(),
            today: Date::constant(2026, 1, 1),
        };
        let effects = match roadmap {
            Some(dir) => state.open(dir),
            None => vec![],
        };
        (state, effects)
    }

    pub fn update(&mut self, msg: Msg) -> Vec<Effect> {
        let before = self.queue();
        let effects = self.apply(msg, &before);
        self.keep_selection(&before);
        effects
    }

    fn apply(&mut self, msg: Msg, before: &Queue) -> Vec<Effect> {
        match msg {
            Msg::Reload => self.reload(),
            Msg::LoadDone { generation, result, at } => {
                if self.load != (Load::Running { generation }) {
                    return vec![]; // stale: a later load superseded it
                }
                self.load = Load::Idle;
                match result {
                    Ok(snapshot) => {
                        self.snapshot = Some(snapshot);
                        self.loaded_at = Some(at);
                        self.problem = None;
                    }
                    Err(problem) => self.problem = Some(problem),
                }
                vec![]
            }
            Msg::FileChanged(paths) => {
                self.changed = true;
                self.changed_files.extend(paths);
                vec![]
            }
            Msg::Open { requested, found } => match found {
                Some(dir) => self.open(dir),
                None => {
                    self.not_a_roadmap = Some(requested);
                    vec![]
                }
            },
            Msg::Select(id) => {
                self.selected = id;
                vec![]
            }
            Msg::Show(view) => {
                self.view = view;
                vec![]
            }
            Msg::Move(step) => {
                let n = before.rows.len() as i64;
                if n > 0 {
                    let at = self.selected.as_deref().and_then(|k| before.position(k));
                    let to = match (step, at) {
                        (Step::Home, _) => 0,
                        (Step::End, _) => n - 1,
                        (Step::By(d), Some(at)) => (at as i64 + d).clamp(0, n - 1),
                        (Step::By(_), None) => 0,
                    };
                    self.selected = Some(before.rows[to as usize].key());
                }
                vec![]
            }
            Msg::Toggle(key) => {
                if key == FOLD {
                    self.options.archived_unfolded = !self.options.archived_unfolded;
                } else if let Some(section) = key.strip_prefix('§')
                    && !self.options.collapsed.remove(section)
                {
                    self.options.collapsed.insert(section.to_string());
                }
                vec![]
            }
            Msg::Collapse(collapse) => {
                let section = self
                    .selected
                    .as_deref()
                    .and_then(|k| before.position(k))
                    .map(|i| before.rows[i].section.clone());
                if let Some(section) = section {
                    if collapse {
                        self.options.collapsed.insert(section.clone());
                        self.selected = Some(format!("§{section}"));
                    } else {
                        self.options.collapsed.remove(&section);
                    }
                }
                vec![]
            }
            Msg::ToggleArchived => {
                self.options.show_archived = !self.options.show_archived;
                vec![]
            }
            Msg::FilterSelected => {
                let target = self
                    .selected_item()
                    .and_then(|item| queue::filter_target(item, self.snapshot.as_ref()?));
                match target {
                    Some(m) => self.options.filter = Some(m),
                    None => self.picking = self.snapshot.as_ref().is_some_and(|s| !s.milestones.is_empty()),
                }
                vec![]
            }
            Msg::Filter(m) => {
                self.options.filter = m;
                self.picking = false;
                vec![]
            }
            Msg::Find(Some(text)) => {
                let fresh = !self.finding || text != self.options.find;
                self.finding = true;
                self.options.find = text;
                if fresh {
                    // Typing selects the first match that shows.
                    let first = self.queue().hits.into_iter().find(|h| h.reveal == Reveal::Shown);
                    if let Some(hit) = first {
                        self.selected = Some(hit.id);
                    }
                }
                vec![]
            }
            Msg::Find(None) => {
                self.finding = false;
                self.options.find.clear();
                vec![]
            }
            Msg::FindNext => {
                let hits = &before.hits;
                if !hits.is_empty() {
                    let at = self
                        .selected
                        .as_deref()
                        .and_then(|k| hits.iter().position(|h| h.id == k));
                    let hit = &hits[at.map_or(0, |i| (i + 1) % hits.len())];
                    match &hit.reveal {
                        Reveal::Shown => {}
                        Reveal::Section(section) => {
                            self.options.collapsed.remove(section);
                        }
                        Reveal::Fold => self.options.archived_unfolded = true,
                    }
                    self.selected = Some(hit.id.clone());
                }
                vec![]
            }
            Msg::Escape => {
                if self.picking {
                    self.picking = false;
                } else if self.finding {
                    self.finding = false;
                    self.options.find.clear();
                } else {
                    self.options.filter = None;
                }
                vec![]
            }
        }
    }

    /// The queue as it shows now.
    pub fn queue(&self) -> Queue {
        match &self.snapshot {
            Some(snapshot) => queue::build(snapshot, &self.options, &self.changed_files, self.today),
            None => Queue::default(),
        }
    }

    /// The selected item, open or archived.
    pub fn selected_item(&self) -> Option<&crate::snapshot::Item> {
        let snapshot = self.snapshot.as_ref()?;
        let id = self.selected.as_deref()?;
        snapshot.items.iter().chain(&snapshot.archived).find(|i| i.id == id)
    }

    /// After any change, the selection is on a row that shows: unchanged if
    /// it still does, else the nearest row that was above it and still
    /// shows, else the first row.
    fn keep_selection(&mut self, before: &Queue) {
        let after = self.queue();
        if after.rows.is_empty() {
            return;
        }
        let shows = |k: &str| after.position(k).is_some();
        match self.selected.clone() {
            Some(key) if shows(&key) => {}
            Some(key) => {
                let at = before.position(&key).unwrap_or(0);
                let nearest = before.rows[..at.min(before.rows.len())]
                    .iter()
                    .rev()
                    .chain(before.rows.iter().skip(at))
                    .map(|r| r.key())
                    .find(|k| shows(k));
                self.selected = Some(nearest.unwrap_or_else(|| after.rows[0].key()));
            }
            None => {
                // A fresh load selects the first item, as gitk does.
                let first = after.rows.iter().find(|r| matches!(r.kind, RowKind::Item(_)));
                self.selected = first.map(|r| r.key());
            }
        }
    }

    fn open(&mut self, dir: PathBuf) -> Vec<Effect> {
        if self.roadmap.as_ref() != Some(&dir) {
            self.snapshot = None;
            self.loaded_at = None;
            self.selected = None;
            self.problem = None;
        }
        self.not_a_roadmap = None;
        self.roadmap = Some(dir.clone());
        let mut effects = vec![Effect::Watch(dir)];
        effects.extend(self.reload());
        effects
    }

    fn reload(&mut self) -> Vec<Effect> {
        let Some(dir) = self.roadmap.clone() else {
            return vec![];
        };
        self.generation += 1;
        self.load = Load::Running {
            generation: self.generation,
        };
        // Cleared as the load starts, so an edit made during it still shows.
        self.changed = false;
        self.changed_files.clear();
        vec![Effect::Export {
            generation: self.generation,
            dir,
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::RawOutput;
    use crate::snapshot::{Item, State as ItemState};
    use serde_json::json;

    fn dir() -> PathBuf {
        PathBuf::from("/repo/roadmap")
    }

    fn snapshot(ids: &[&str]) -> Snapshot {
        Snapshot {
            schema: 1,
            ok: true,
            items: ids
                .iter()
                .enumerate()
                .map(|(i, id)| Item {
                    id: id.to_string(),
                    frontmatter: json!({"title": id.to_uppercase(), "bucket": "now", "rank": i + 1}),
                    state: Some(ItemState::Ready),
                    ..Item::default()
                })
                .collect(),
            ..Snapshot::default()
        }
    }

    fn done(state: &mut State, generation: u64, result: Result<Snapshot, Problem>) {
        state.update(Msg::LoadDone {
            generation,
            result,
            at: "12:00:00".into(),
        });
    }

    fn no_json() -> Problem {
        Problem::NoJson {
            raw: RawOutput {
                stderr: "invalid choice: 'export'".into(),
                status: Some(2),
                ..RawOutput::default()
            },
        }
    }

    #[test]
    fn launching_in_a_roadmap_watches_it_and_exports_it() {
        let (state, effects) = State::new(Some(dir()));
        assert_eq!(
            effects,
            [
                Effect::Watch(dir()),
                Effect::Export {
                    generation: 1,
                    dir: dir()
                }
            ]
        );
        assert_eq!(state.load, Load::Running { generation: 1 });
    }

    #[test]
    fn launching_outside_a_roadmap_runs_nothing() {
        let (mut state, effects) = State::new(None);
        assert!(effects.is_empty());
        assert!(state.update(Msg::Reload).is_empty());
        assert_eq!(state.roadmap, None);
    }

    #[test]
    fn a_reload_keeps_the_snapshot_until_the_new_one_arrives() {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(&["a"])));
        state.update(Msg::Reload);
        assert_eq!(items(&state).len(), 1);
        done(&mut state, 2, Ok(snapshot(&["a", "b"])));
        assert_eq!(items(&state).len(), 2);
        assert_eq!(state.load, Load::Idle);
    }

    #[test]
    fn a_stale_load_is_dropped() {
        let (mut state, _) = State::new(Some(dir()));
        state.update(Msg::Reload); // generation 2 supersedes 1
        done(&mut state, 1, Ok(snapshot(&["old"])));
        assert!(state.snapshot.is_none());
        assert_eq!(state.load, Load::Running { generation: 2 });
        done(&mut state, 2, Ok(snapshot(&["new"])));
        assert_eq!(items(&state), ["new"]);
    }

    #[test]
    fn changed_clears_when_a_load_starts_and_an_edit_during_it_sets_it_again() {
        let (mut state, _) = State::new(Some(dir()));
        state.update(Msg::FileChanged(vec!["items/a.md".into()]));
        assert!(state.changed);
        assert_eq!(state.changed_files.len(), 1);
        state.update(Msg::Reload);
        assert!(!state.changed);
        assert!(state.changed_files.is_empty());
        state.update(Msg::FileChanged(vec![]));
        done(&mut state, 2, Ok(snapshot(&["a"])));
        assert!(state.changed);
    }

    #[test]
    fn a_failure_keeps_the_old_snapshot_and_a_success_clears_it() {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(&["a"])));
        state.update(Msg::Reload);
        done(&mut state, 2, Err(no_json()));
        assert_eq!(state.problem, Some(no_json()));
        assert_eq!(items(&state).len(), 1);
        state.update(Msg::Reload);
        done(&mut state, 3, Ok(snapshot(&["a"])));
        assert_eq!(state.problem, None);
    }

    #[test]
    fn the_selection_survives_a_reload_by_id() {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(&["a", "b"])));
        state.update(Msg::Select(Some("b".into())));
        state.update(Msg::Reload);
        done(&mut state, 2, Ok(snapshot(&["b", "a"])));
        assert_eq!(state.selected.as_deref(), Some("b"));
    }

    #[test]
    fn opening_a_folder_without_a_roadmap_keeps_the_current_one() {
        let (mut state, _) = State::new(Some(dir()));
        let effects = state.update(Msg::Open {
            requested: "/tmp".into(),
            found: None,
        });
        assert!(effects.is_empty());
        assert_eq!(state.roadmap, Some(dir()));
        assert_eq!(state.not_a_roadmap, Some(PathBuf::from("/tmp")));
    }

    #[test]
    fn opening_another_roadmap_starts_afresh() {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(&["a"])));
        state.update(Msg::Select(Some("a".into())));
        let other = PathBuf::from("/other/roadmap");
        let effects = state.update(Msg::Open {
            requested: other.clone(),
            found: Some(other.clone()),
        });
        assert_eq!(
            effects,
            [
                Effect::Watch(other.clone()),
                Effect::Export {
                    generation: 2,
                    dir: other
                }
            ]
        );
        assert!(state.snapshot.is_none());
        assert_eq!(state.selected, None);
    }

    fn items(state: &State) -> Vec<String> {
        state
            .queue()
            .rows
            .iter()
            .filter(|r| matches!(r.kind, RowKind::Item(_)))
            .map(|r| r.key())
            .collect()
    }

    fn loaded(ids: &[&str]) -> State {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(ids)));
        state
    }

    #[test]
    fn a_load_selects_the_first_item() {
        let state = loaded(&["a", "b"]);
        assert_eq!(state.selected.as_deref(), Some("a"));
        assert_eq!(items(&state), ["a", "b"]);
    }

    #[test]
    fn move_walks_every_row_and_clamps() {
        // Rows: §now, a, b, c.
        let mut state = loaded(&["a", "b", "c"]);
        state.update(Msg::Move(Step::By(1)));
        assert_eq!(state.selected.as_deref(), Some("b"));
        state.update(Msg::Move(Step::By(10)));
        assert_eq!(state.selected.as_deref(), Some("c"));
        state.update(Msg::Move(Step::Home));
        assert_eq!(state.selected.as_deref(), Some("§now"));
        state.update(Msg::Move(Step::By(-3)));
        assert_eq!(state.selected.as_deref(), Some("§now"));
        state.update(Msg::Move(Step::End));
        assert_eq!(state.selected.as_deref(), Some("c"));
    }

    #[test]
    fn collapsing_moves_the_selection_to_the_separator_and_expanding_keeps_it() {
        let mut state = loaded(&["a", "b"]);
        state.update(Msg::Select(Some("b".into())));
        state.update(Msg::Collapse(true));
        assert_eq!(state.selected.as_deref(), Some("§now"));
        assert!(items(&state).is_empty());
        state.update(Msg::Toggle("§now".into()));
        assert_eq!(items(&state), ["a", "b"]);
        assert_eq!(state.selected.as_deref(), Some("§now"));
    }

    #[test]
    fn a_selection_that_disappears_moves_to_the_nearest_row_above() {
        let mut state = loaded(&["a", "b", "c"]);
        state.update(Msg::Select(Some("c".into())));
        state.update(Msg::Reload);
        done(&mut state, 2, Ok(snapshot(&["a", "b"])));
        assert_eq!(state.selected.as_deref(), Some("b"));
    }

    #[test]
    fn find_selects_the_first_match_and_find_next_reveals_hidden_ones() {
        let mut state = loaded(&["apple", "berry", "apricot"]);
        state.update(Msg::Find(Some("ap".into())));
        assert_eq!(state.selected.as_deref(), Some("apple"));
        state.update(Msg::FindNext);
        assert_eq!(state.selected.as_deref(), Some("apricot"));
        state.update(Msg::Collapse(true));
        assert!(items(&state).is_empty());
        state.update(Msg::FindNext);
        assert_eq!(state.selected.as_deref(), Some("apple"));
        assert_eq!(items(&state).len(), 3, "find expanded the bucket");
    }

    #[test]
    fn escape_closes_find_then_the_picker_then_clears_the_filter() {
        let mut state = loaded(&["a"]);
        state.options.filter = Some("m".into());
        state.update(Msg::Find(Some("x".into())));
        state.picking = true;
        state.update(Msg::Escape);
        assert!(!state.picking && state.finding);
        state.update(Msg::Escape);
        assert!(!state.finding && state.options.find.is_empty());
        assert!(state.options.filter.is_some());
        state.update(Msg::Escape);
        assert_eq!(state.options.filter, None);
        state.update(Msg::Escape); // at the root, nothing
    }

    #[test]
    fn f_filters_to_the_selections_milestone_or_opens_the_picker() {
        let mut state = loaded(&["a", "b"]);
        let snapshot = state.snapshot.as_mut().unwrap();
        snapshot.items[0].due = vec!["m".into()];
        snapshot.milestones = vec![crate::snapshot::Milestone {
            id: "m".into(),
            date: "2026-12-31".into(),
            ..Default::default()
        }];
        state.update(Msg::FilterSelected);
        assert_eq!(state.options.filter.as_deref(), Some("m"));
        assert_eq!(items(&state), ["a"]);
        state.update(Msg::Filter(None));
        state.update(Msg::Select(Some("b".into())));
        state.update(Msg::FilterSelected);
        assert!(state.picking);
        state.update(Msg::Filter(Some("m".into())));
        assert!(!state.picking);
        assert_eq!(state.selected.as_deref(), Some("a"), "b was filtered out");
    }

    #[test]
    fn show_archived_and_the_fold_toggle() {
        let mut state = loaded(&["a"]);
        state.snapshot.as_mut().unwrap().archived = vec![crate::queue::tests::closed("old", "shipped", &[], &[])];
        state.update(Msg::ToggleArchived);
        assert!(state.options.show_archived);
        state.update(Msg::Toggle(FOLD.into()));
        assert!(items(&state).contains(&"old".to_string()));
    }
}
