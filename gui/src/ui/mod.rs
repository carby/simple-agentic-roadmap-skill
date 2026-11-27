//! Drawing, and nothing else: every decision is in `state`, and every
//! click comes back as an `Action` for the app to carry out.

mod gutter;
pub mod palette;
mod queue;

use std::path::Path;

use eframe::egui::{self, Align2, Color32, RichText, ScrollArea, TextStyle};

use crate::cli::{Problem, RawOutput};
use crate::state::{Load, Msg, State, View};

/// egui's default fonts, with the monospace font (Hack) as the last fallback
/// for proportional text too: Ubuntu Light lacks the arrows, ◆ ◇ and ⊘
/// that the strip writes in proportional text. Choosing fonts is the
/// roadmap's gui-font item; this only fills the gaps.
pub fn fonts() -> egui::FontDefinitions {
    let mut fonts = egui::FontDefinitions::default();
    let mono = fonts.families[&egui::FontFamily::Monospace].first().cloned();
    if let Some(mono) = mono {
        fonts
            .families
            .entry(egui::FontFamily::Proportional)
            .or_default()
            .push(mono);
    }
    fonts
}

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

/// What only the drawing needs to remember.
#[derive(Default)]
pub struct UiState {
    /// The Open folder dialog's text, while it shows.
    pub open_path: Option<String>,
    /// Give the find field focus next frame.
    pub find_focus: bool,
    /// Scroll the selection into view next frame.
    pub reveal: bool,
    /// The queue's scroll offset and height, as of the last frame.
    pub offset: f32,
    pub viewport: f32,
    /// Rows a page key moves.
    pub page_rows: i64,
    /// The row the milestone picker has highlighted.
    pub picker: usize,
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
    queue::keys(ui.ctx(), state, view, &mut actions);
    let q = state.queue();

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
                if ui.add(egui::Button::new("Queue").shortcut_text("Ctrl+1")).clicked() {
                    actions.push(Action::Msg(Msg::Show(View::Queue)));
                }
                if ui.add(egui::Button::new("Find").shortcut_text("/")).clicked() {
                    view.find_focus = true;
                    actions.push(Action::Msg(Msg::Find(Some(state.options.find.clone()))));
                }
                if ui
                    .add(egui::Button::new("Filter to a milestone").shortcut_text("F"))
                    .clicked()
                {
                    actions.push(Action::Msg(Msg::FilterSelected));
                }
                let archived = if state.options.show_archived {
                    "Hide archived"
                } else {
                    "Show archived"
                };
                if ui.button(archived).clicked() {
                    actions.push(Action::Msg(Msg::ToggleArchived));
                }
                ui.separator();
                if ui.add(egui::Button::new("Reload").shortcut_text("F5")).clicked() {
                    actions.push(Action::Msg(Msg::Reload));
                }
            });
        });
    });

    egui::Panel::bottom("status").show(ui, |ui| status_bar(ui, state, cx));
    let queue_shows = state.roadmap.is_some() && state.snapshot.is_some();
    if queue_shows {
        egui::Panel::bottom("strip")
            .frame(
                egui::Frame::new()
                    .fill(palette::STRIP)
                    .inner_margin(egui::Margin::symmetric(6, 2)),
            )
            .show(ui, |ui| queue::strip(ui, state, &q));
        egui::Panel::top("toolbar").show(ui, |ui| queue::toolbar(ui, state, &q, view, &mut actions));
        if q.filter.is_some() {
            egui::Panel::top("filter").show(ui, |ui| queue::filter_bar(ui, &q, &mut actions));
        }
    }

    if let Some(path) = &state.not_a_roadmap {
        banner(ui, "not-a-roadmap", &format!("No roadmap in {}", path.display()), None);
    }
    if let Some(problem) = &state.problem {
        let (headline, detail) = describe(problem);
        banner(ui, "problem", &headline, Some(&detail));
    }

    egui::CentralPanel::default()
        .frame(egui::Frame::new().fill(palette::PAPER))
        .show(ui, |ui| {
            if state.roadmap.is_none() {
                no_roadmap(ui, cx.start, &mut actions);
            } else if state.snapshot.is_some() {
                match state.view {
                    View::Queue => queue::table(ui, state, &q, view, &mut actions),
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

    queue::picker(ui.ctx(), state, view, &mut actions);
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

    /// Every character outside ASCII that the queue's code draws as text is
    /// in egui's default fonts, monospace and proportional, so none shows as
    /// a box. Comments are skipped; the painted ▸ ▾ triangles aren't text.
    #[test]
    fn every_glyph_drawn_is_in_the_default_fonts() {
        let ctx = egui::Context::default();
        ctx.set_fonts(fonts());
        let mut output = ctx.run_pass(egui::RawInput::default(), |_| {});
        output.textures_delta.clear();
        let sources = [
            include_str!("../queue.rs"),
            include_str!("queue.rs"),
            include_str!("mod.rs"),
            include_str!("../state.rs"),
        ];
        let mut missing = std::collections::BTreeSet::new();
        for source in sources {
            for line in source.lines().filter(|l| !l.trim_start().starts_with("//")) {
                let code = line.split(" // ").next().unwrap_or(line);
                for c in code.chars().filter(|c| !c.is_ascii()) {
                    for font in [egui::FontId::monospace(11.0), egui::FontId::proportional(12.0)] {
                        if !ctx.fonts_mut(|f| f.has_glyph(&font, c)) {
                            missing.insert(format!("{c} (U+{:04X}) in {:?}", c as u32, font.family));
                        }
                    }
                }
            }
        }
        assert!(missing.is_empty(), "not in the default fonts: {missing:?}");
    }

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
