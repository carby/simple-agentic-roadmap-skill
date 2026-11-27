//! What the GUI shows, as a pure state machine with no egui and no I/O:
//! `update` takes a message and returns the effects to carry out. The views
//! that come after the frame add `View` variants and history here.

use std::path::PathBuf;

use crate::cli::Problem;
use crate::snapshot::Snapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Load {
    Idle,
    Running { generation: u64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    /// The frame's plain list; gui-queue replaces it.
    List,
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
    /// An item id, so a selection survives a reload.
    pub selected: Option<String>,
}

#[derive(Debug)]
pub enum Msg {
    Reload,
    LoadDone {
        generation: u64,
        result: Result<Snapshot, Problem>,
        at: String,
    },
    FileChanged,
    /// The person asked to open `requested`; `found` is its roadmap, if any.
    Open {
        requested: PathBuf,
        found: Option<PathBuf>,
    },
    Select(Option<String>),
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
            view: View::List,
            selected: None,
        };
        let effects = match roadmap {
            Some(dir) => state.open(dir),
            None => vec![],
        };
        (state, effects)
    }

    pub fn update(&mut self, msg: Msg) -> Vec<Effect> {
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
            Msg::FileChanged => {
                self.changed = true;
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
        vec![Effect::Export {
            generation: self.generation,
            dir,
        }]
    }

    /// The plain list's rows: each open item, in queue order.
    pub fn rows(&self) -> Vec<Row> {
        let Some(snapshot) = &self.snapshot else {
            return vec![];
        };
        snapshot
            .items
            .iter()
            .map(|item| Row {
                id: item.id.clone(),
                position: format!("{}·{}", capitalised(item.bucket()), item.rank()),
                title: item.title().to_string(),
                state: item.state.map(|s| s.word()).unwrap_or("?").to_string(),
            })
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub id: String,
    pub position: String,
    pub title: String,
    pub state: String,
}

fn capitalised(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => "?".into(),
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
        assert_eq!(state.rows().len(), 1);
        done(&mut state, 2, Ok(snapshot(&["a", "b"])));
        assert_eq!(state.rows().len(), 2);
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
        assert_eq!(state.rows()[0].id, "new");
    }

    #[test]
    fn changed_clears_when_a_load_starts_and_an_edit_during_it_sets_it_again() {
        let (mut state, _) = State::new(Some(dir()));
        state.update(Msg::FileChanged);
        assert!(state.changed);
        state.update(Msg::Reload);
        assert!(!state.changed);
        state.update(Msg::FileChanged);
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
        assert_eq!(state.rows().len(), 1);
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

    #[test]
    fn the_list_has_a_row_per_open_item_in_order() {
        let (mut state, _) = State::new(Some(dir()));
        done(&mut state, 1, Ok(snapshot(&["a", "b", "c"])));
        let rows = state.rows();
        assert_eq!(rows.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
        assert_eq!(
            rows[1],
            Row {
                id: "b".into(),
                position: "Now·2".into(),
                title: "B".into(),
                state: "ready".into()
            }
        );
    }
}
