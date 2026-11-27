//! The glue: egui input, the watcher and the workers feed messages into
//! `State::update`, and its effects are carried out here, off the UI thread.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::thread;

use eframe::egui;

use crate::cli::{self, Env, Problem};
use crate::locate::find_roadmap;
use crate::state::{Effect, Msg, State};
use crate::ui::{self, Action, UiState};
use crate::watch;

pub struct App {
    state: State,
    view: UiState,
    env: Env,
    start: PathBuf,
    cli_label: String,
    tx: Sender<Msg>,
    rx: Receiver<Msg>,
    ctx: egui::Context,
    watcher: Option<notify::RecommendedWatcher>,
    title: String,
}

impl App {
    pub fn new(ctx: &egui::Context, start: PathBuf, env: Env) -> App {
        let (tx, rx) = channel();
        let (state, effects) = State::new(find_roadmap(&start));
        let mut app = App {
            state,
            view: UiState::default(),
            cli_label: label(&env),
            env,
            start,
            tx,
            rx,
            ctx: ctx.clone(),
            watcher: None,
            title: String::new(),
        };
        app.run(effects);
        app
    }

    fn send(&mut self, msg: Msg) {
        let effects = self.state.update(msg);
        self.run(effects);
    }

    fn run(&mut self, effects: Vec<Effect>) {
        for effect in effects {
            match effect {
                Effect::Export { generation, dir } => {
                    let (tx, ctx) = (self.tx.clone(), self.ctx.clone());
                    let resolved = cli::resolve(&self.env);
                    self.cli_label = label(&self.env);
                    thread::spawn(move || {
                        let result = match resolved {
                            Ok(cli) => cli::export(&cli, &dir, cli::TIMEOUT),
                            Err(tried) => Err(Problem::Missing { tried }),
                        };
                        let at = jiff::ZonedDateTime::now().strftime("%H:%M:%S").to_string();
                        let _ = tx.send(Msg::LoadDone { generation, result, at });
                        ctx.request_repaint();
                    });
                }
                Effect::Watch(dir) => {
                    let (tx, ctx) = (self.tx.clone(), self.ctx.clone());
                    self.watcher = watch::watch(&dir, move || {
                        let _ = tx.send(Msg::FileChanged);
                        ctx.request_repaint();
                    })
                    .ok();
                }
            }
        }
    }

    fn open(&mut self, requested: PathBuf) {
        let found = find_roadmap(&requested);
        self.send(Msg::Open { requested, found });
    }
}

/// How the status bar names the CLI it runs.
fn label(env: &Env) -> String {
    match cli::resolve(env) {
        Ok(cli) => cli.label,
        Err(_) => "no roadmap CLI found".into(),
    }
}

impl eframe::App for App {
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(msg) = self.rx.try_recv() {
            if let Msg::Open { requested, found: None } = msg {
                // From Browse…: locate it here, so the worker stays dumb.
                self.open(requested);
            } else {
                self.send(msg);
            }
        }
        let title = match &self.state.roadmap {
            Some(dir) => format!("Roadmap — {}", dir.display()),
            None => "Roadmap".into(),
        };
        if title != self.title {
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(title.clone()));
            self.title = title;
        }
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let cx = ui::Context {
            start: &self.start,
            cli_label: &self.cli_label,
        };
        let actions = ui::draw(ui, &self.state, &mut self.view, &cx);
        for action in actions {
            match action {
                Action::Msg(msg) => self.send(msg),
                Action::ShowOpen => {
                    let current = self
                        .state
                        .roadmap
                        .as_deref()
                        .and_then(Path::parent)
                        .unwrap_or(&self.start);
                    self.view.open_path = Some(current.display().to_string());
                }
                Action::CloseOpen => self.view.open_path = None,
                Action::OpenPath(text) => {
                    self.view.open_path = None;
                    self.open(PathBuf::from(text.trim()));
                }
                Action::Browse => {
                    // On its own thread, so a portal that never answers (as
                    // under WSLg) can't freeze the window; the path field stays.
                    let (tx, ctx) = (self.tx.clone(), self.ctx.clone());
                    thread::spawn(move || {
                        if let Some(folder) = rfd::FileDialog::new().pick_folder() {
                            let _ = tx.send(Msg::Open {
                                requested: folder,
                                found: None,
                            });
                            ctx.request_repaint();
                        }
                    });
                }
                Action::Quit => ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close),
            }
        }
    }
}
