//! Drawing, and nothing else: every decision is in `state`, and every
//! click comes back as an `Action` for the app to carry out.

use std::path::Path;

use eframe::egui::{self, Align2, Color32, RichText, ScrollArea, TextStyle};

use crate::cli::{Problem, RawOutput};
use crate::state::{Load, Msg, State, View};

/// What the person asked for this frame. A handful a frame at most, so a
/// large `Msg` inline costs nothing worth boxing for.
#[allow(clippy::large_enum_variant)]
pub enum Action {
    Msg(Msg),
    ShowOpen,
    Browse,
    OpenPath(String),
    CloseOpen,
    Quit,
}

/// What only the drawing needs to remember: the Open folder dialog's text.
#[derive(Default)]
pub struct UiState {
    pub open_path: Option<String>,
}

pub struct Context<'a> {
    pub start: &'a Path,
    pub cli_label: &'a str,
}

pub fn draw(ui: &mut egui::Ui, state: &State, view: &mut UiState, cx: &Context) -> Vec<Action> {
    let mut actions = Vec::new();
    if ui.input(|i| i.key_pressed(egui::Key::F5)) {
        actions.push(Action::Msg(Msg::Reload));
    }

    egui::Panel::top("menu").show(ui, |ui| {
        egui::MenuBar::new().ui(ui, |ui| {
            ui.menu_button("File", |ui| {
                if ui.button("Open folder…").clicked() {
                    actions.push(Action::ShowOpen);
                }
                if ui.button("Quit").clicked() {
                    actions.push(Action::Quit);
                }
            });
            ui.menu_button("View", |ui| {
                if ui.add(egui::Button::new("Reload").shortcut_text("F5")).clicked() {
                    actions.push(Action::Msg(Msg::Reload));
                }
            });
        });
    });

    egui::Panel::bottom("status").show(ui, |ui| status_bar(ui, state, cx));

    if let Some(path) = &state.not_a_roadmap {
        banner(ui, "not-a-roadmap", &format!("No roadmap in {}", path.display()), None);
    }
    if let Some(problem) = &state.problem {
        let (headline, detail) = describe(problem);
        banner(ui, "problem", &headline, Some(&detail));
    }

    egui::CentralPanel::default().show(ui, |ui| {
        if state.roadmap.is_none() {
            no_roadmap(ui, cx.start, &mut actions);
        } else if state.snapshot.is_some() {
            match state.view {
                View::List => list(ui, state, &mut actions),
            }
        } else if state.load != Load::Idle {
            ui.weak("Loading…");
        }
    });

    if state.changed {
        egui::Area::new(egui::Id::unique("changed"))
            .anchor(Align2::CENTER_TOP, [0.0, 56.0])
            .show(ui.ctx(), |ui| {
                egui::Frame::popup(ui.style())
                    .fill(Color32::from_rgb(0xff, 0xf3, 0xd6))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new("Files changed on disk").color(Color32::from_rgb(0x6b, 0x46, 0x00)));
                            if ui.button("Reload  F5").clicked() {
                                actions.push(Action::Msg(Msg::Reload));
                            }
                        });
                    });
            });
    }

    if let Some(text) = &mut view.open_path {
        open_dialog(ui.ctx(), text, &mut actions);
    }
    actions
}

fn status_bar(ui: &mut egui::Ui, state: &State, cx: &Context) {
    ui.horizontal_wrapped(|ui| {
        match &state.snapshot {
            Some(s) => {
                ui.label(format!(
                    "{} open · {} archived · {} milestone{}",
                    s.items.len(),
                    s.archived.len(),
                    s.milestones.len(),
                    if s.milestones.len() == 1 { "" } else { "s" }
                ));
                ui.separator();
                ui.label(match &s.git {
                    Some(git) => format!(
                        "git: {}, {}",
                        git.branch.as_deref().unwrap_or("detached HEAD"),
                        if git.clean { "clean" } else { "changes" }
                    ),
                    None => "not in git".into(),
                });
                if !s.warnings.is_empty() {
                    ui.separator();
                    ui.label(
                        RichText::new(format!("{} warning(s)", s.warnings.len()))
                            .color(Color32::from_rgb(0xb0, 0x7a, 0x00)),
                    )
                    .on_hover_text(s.warnings.join("\n"));
                }
                if let Some(at) = &state.loaded_at {
                    ui.separator();
                    ui.label(format!("loaded {at}"));
                }
                ui.separator();
                ui.label(format!("{} {}", cx.cli_label, s.version));
            }
            None => {
                ui.label(cx.cli_label);
            }
        }
        if state.load != Load::Idle {
            ui.separator();
            ui.label("Loading…");
        }
    });
}

fn banner(ui: &mut egui::Ui, id: &str, headline: &str, detail: Option<&str>) {
    egui::Panel::top(id.to_string()).show(ui, |ui| {
        egui::Frame::new()
            .fill(Color32::from_rgb(0xfd, 0xe7, 0xe4))
            .inner_margin(8.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.label(
                    RichText::new(headline)
                        .strong()
                        .color(Color32::from_rgb(0x8c, 0x1d, 0x18)),
                );
                if let Some(detail) = detail.filter(|d| !d.is_empty()) {
                    ScrollArea::vertical().id_salt(id).max_height(220.0).show(ui, |ui| {
                        let mut text = detail.to_string();
                        ui.add(
                            egui::TextEdit::multiline(&mut text)
                                .font(TextStyle::Monospace)
                                .desired_width(f32::INFINITY)
                                .interactive(true),
                        );
                    });
                }
            });
    });
}

fn no_roadmap(ui: &mut egui::Ui, start: &Path, actions: &mut Vec<Action>) {
    ui.vertical_centered(|ui| {
        ui.add_space(80.0);
        ui.heading("No roadmap here");
        ui.label(format!(
            "No roadmap/ in {} or the folders above it, up to the repository's root.",
            start.display()
        ));
        ui.add_space(8.0);
        if ui.button("Open folder…").clicked() {
            actions.push(Action::ShowOpen);
        }
        ui.add_space(8.0);
        ui.weak("To set one up, run `roadmap init` in the repository.");
    });
}

fn list(ui: &mut egui::Ui, state: &State, actions: &mut Vec<Action>) {
    let rows = state.rows();
    let archived = state.snapshot.as_ref().map_or(0, |s| s.archived.len());
    ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
        egui::Grid::new("items").striped(true).num_columns(4).show(ui, |ui| {
            for row in &rows {
                let selected = state.selected.as_deref() == Some(row.id.as_str());
                ui.monospace(&row.position);
                if ui
                    .selectable_label(selected, RichText::new(&row.id).monospace())
                    .clicked()
                {
                    actions.push(Action::Msg(Msg::Select(Some(row.id.clone()))));
                }
                ui.label(&row.title);
                ui.weak(&row.state);
                ui.end_row();
            }
        });
        ui.add_space(8.0);
        ui.weak(format!("Archived · {archived}"));
    });
}

fn open_dialog(ctx: &egui::Context, text: &mut String, actions: &mut Vec<Action>) {
    egui::Window::new("Open folder")
        .collapsible(false)
        .resizable(false)
        .anchor(Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            ui.label("A repository, or its roadmap folder:");
            let field = ui.add(egui::TextEdit::singleline(text).desired_width(420.0));
            let enter = field.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
            ui.horizontal(|ui| {
                if ui.button("Open").clicked() || enter {
                    actions.push(Action::OpenPath(text.clone()));
                }
                if ui.button("Browse…").clicked() {
                    actions.push(Action::Browse);
                }
                if ui.button("Cancel").clicked() || ui.input(|i| i.key_pressed(egui::Key::Escape)) {
                    actions.push(Action::CloseOpen);
                }
            });
        });
}

/// A problem's headline and its detail, the CLI's own words kept intact.
pub fn describe(problem: &Problem) -> (String, String) {
    match problem {
        Problem::Missing { tried } => (
            "The roadmap CLI wasn't found".into(),
            format!(
                "Tried:\n  {}\n\nInstall it with `npm install -g simple-agentic-roadmap-skill`, or name one with \
                 --cli \"<command>\" or ROADMAP_CLI.",
                tried.join("\n  ")
            ),
        ),
        Problem::Refused {
            rule,
            message,
            warnings,
            stderr,
        } => {
            let mut detail = String::new();
            for w in warnings {
                detail.push_str(&format!("warning: {w}\n"));
            }
            if let Some(stderr) = stderr {
                detail.push_str(stderr);
            }
            (format!("The CLI refused [{rule}]: {message}"), detail)
        }
        Problem::UnsupportedSchema { schema, raw } => (
            format!("This CLI answers with JSON schema {schema}; this GUI reads schema 1"),
            output(raw),
        ),
        Problem::NoJson { raw } => (
            "This CLI didn't answer with JSON schema 1 (`roadmap export` arrived in 2.3.0)".into(),
            output(raw),
        ),
        Problem::TimedOut { raw, after } => (format!("The CLI was killed after {} s", after.as_secs()), output(raw)),
        Problem::BadSnapshot { error, raw } => (format!("The CLI's answer isn't a snapshot: {error}"), output(raw)),
    }
}

fn output(raw: &RawOutput) -> String {
    let status = match raw.status {
        Some(code) => format!("exit {code}"),
        None => "killed".into(),
    };
    format!(
        "$ {}\n{status}\n--- stdout ---\n{}\n--- stderr ---\n{}",
        raw.command, raw.stdout, raw.stderr
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_problem_keeps_the_clis_words() {
        let raw = RawOutput {
            command: "roadmap export --dir /r".into(),
            status: Some(2),
            stdout: String::new(),
            stderr: "roadmap: error: argument command: invalid choice: 'export'\n".into(),
            timed_out: false,
        };
        let (headline, detail) = describe(&Problem::NoJson { raw });
        assert!(headline.contains("schema 1"));
        assert!(detail.contains("$ roadmap export --dir /r\nexit 2"));
        assert!(detail.contains("invalid choice: 'export'"));
    }
}
