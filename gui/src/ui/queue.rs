//! The Queue tab: toolbar, filter bar, the rows with their lanes, and the
//! preview strip. It paints what `queue::build` worked out, and turns keys
//! and clicks into messages; it decides nothing itself.

use std::sync::Arc;

use eframe::egui::{
    self, Align2, Color32, CornerRadius, FontId, Galley, Key, Modifiers, Painter, Rect, RichText, ScrollArea, Sense,
    Stroke, StrokeKind, TextFormat, WidgetInfo, pos2, text::LayoutJob, vec2,
};

use super::{Action, UiState, gutter, palette};
use crate::queue::{self, CHIPS, Chip, ChipKind, Glyph, ItemRow, Queue, RowKind, Tag, TagKind, Tone};
use crate::state::{Msg, State, Step, View};

pub const ROW: f32 = 24.0;
const PAD: f32 = 6.0;
const BUCKET: f32 = 76.0;
const CHIP_COLUMN: f32 = 196.0;
const DATE: f32 = 92.0;
const TITLE_MIN: f32 = 160.0;

fn mono(size: f32) -> FontId {
    FontId::monospace(size)
}

fn body(size: f32) -> FontId {
    FontId::proportional(size)
}

/// Keys, read before anything draws, so a text field that loses focus this
/// frame (Esc, Enter) isn't mistaken for no text field at all.
pub fn keys(ctx: &egui::Context, state: &State, view: &mut UiState, actions: &mut Vec<Action>) {
    if view.open_path.is_some() || state.snapshot.is_none() {
        return;
    }
    let mut msg = |m: Msg, view: &mut UiState| {
        view.reveal = true;
        actions.push(Action::Msg(m));
    };
    let pressed = |key: Key| ctx.input_mut(|i| i.consume_key(Modifiers::NONE, key));
    if state.picking {
        let count = state.snapshot.as_ref().map_or(0, |s| s.milestones.len());
        if pressed(Key::ArrowDown) {
            view.picker = (view.picker + 1).min(count.saturating_sub(1));
        }
        if pressed(Key::ArrowUp) {
            view.picker = view.picker.saturating_sub(1);
        }
        if pressed(Key::Enter)
            && let Some(m) = state.snapshot.as_ref().and_then(|s| s.milestones.get(view.picker))
        {
            msg(Msg::Filter(Some(m.id.clone())), view);
        }
        if pressed(Key::Escape) {
            msg(Msg::Escape, view);
        }
        return;
    }
    if pressed(Key::F3) {
        msg(Msg::FindNext, view);
    }
    if ctx.text_edit_focused() {
        // Only the find field's own keys; everything else is typing.
        if state.finding {
            if pressed(Key::Escape) {
                msg(Msg::Escape, view);
            }
            if pressed(Key::Enter) {
                msg(Msg::FindNext, view);
                view.find_focus = true;
            }
        }
        return;
    }
    let page = view.page_rows.max(1);
    for (key, step) in [
        (Key::ArrowDown, Step::By(1)),
        (Key::J, Step::By(1)),
        (Key::ArrowUp, Step::By(-1)),
        (Key::K, Step::By(-1)),
        (Key::PageDown, Step::By(page)),
        (Key::PageUp, Step::By(-page)),
        (Key::Home, Step::Home),
        (Key::End, Step::End),
    ] {
        if pressed(key) {
            msg(Msg::Move(step), view);
        }
    }
    if pressed(Key::ArrowLeft) {
        msg(Msg::Collapse(true), view);
    }
    if pressed(Key::ArrowRight) {
        msg(Msg::Collapse(false), view);
    }
    if (pressed(Key::Enter) || pressed(Key::Space))
        && let Some(key) = state.selected.as_deref().filter(|k| k.starts_with('§'))
    {
        msg(Msg::Toggle(key.to_string()), view);
    }
    let find = pressed(Key::Slash) || ctx.input_mut(|i| i.consume_key(Modifiers::COMMAND, Key::F));
    if find {
        msg(Msg::Find(Some(state.options.find.clone())), view);
        view.find_focus = true;
    }
    if pressed(Key::F) {
        view.picker = 0;
        msg(Msg::FilterSelected, view);
    }
    if ctx.input_mut(|i| i.consume_key(Modifiers::COMMAND, Key::Num1)) {
        msg(Msg::Show(View::Queue), view);
    }
    if pressed(Key::Escape) {
        msg(Msg::Escape, view);
    }
}

pub fn toolbar(ui: &mut egui::Ui, state: &State, q: &Queue, view: &mut UiState, actions: &mut Vec<Action>) {
    ui.horizontal(|ui| {
        ui.label(RichText::new("Queue").strong()).on_hover_text("Ctrl+1");
        ui.separator();
        let mut show = state.options.show_archived;
        let toggle = ui.checkbox(&mut show, "Show archived");
        if toggle.changed() {
            toggle.surrender_focus();
            actions.push(Action::Msg(Msg::ToggleArchived));
        }
        ui.separator();
        if state.finding {
            let mut text = state.options.find.clone();
            let field = ui.add(
                egui::TextEdit::singleline(&mut text)
                    .hint_text("Find id or text…")
                    .desired_width(200.0),
            );
            if view.find_focus {
                field.request_focus();
                view.find_focus = false;
            }
            if field.changed() {
                view.reveal = true;
                actions.push(Action::Msg(Msg::Find(Some(text.clone()))));
            }
            if !text.is_empty() {
                let shown = q.hits.len() - q.hidden_hits();
                let words = match (q.hits.len(), q.hidden_hits()) {
                    (0, _) => "No matches".to_string(),
                    (n, 0) => format!("{n} match{}", if n == 1 { "" } else { "es" }),
                    (n, h) => format!("{n} matches, {h} hidden ({shown} shown)"),
                };
                let colour = if q.hits.is_empty() {
                    palette::LATE
                } else {
                    palette::MUTED
                };
                ui.label(RichText::new(words).color(colour))
                    .on_hover_text("Enter or F3: next match, opening a folded section if need be · Esc closes");
            }
        } else if ui.add(egui::Button::new("Find").shortcut_text("/")).clicked() {
            view.find_focus = true;
            actions.push(Action::Msg(Msg::Find(Some(String::new()))));
        }
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui.add(egui::Button::new("Reload").shortcut_text("F5")).clicked() {
                actions.push(Action::Msg(Msg::Reload));
            }
        });
    });
}

pub fn filter_bar(ui: &mut egui::Ui, q: &Queue, actions: &mut Vec<Action>) {
    let Some(bar) = &q.filter else { return };
    egui::Frame::new()
        .fill(palette::CHANGED_FILL)
        .inner_margin(egui::Margin::symmetric(10, 4))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                let date = bar.date.as_deref().map(|d| format!(" ({d})")).unwrap_or_default();
                ui.label(
                    RichText::new(format!("Due for ◆ {}{date}", bar.milestone))
                        .strong()
                        .color(palette::MILESTONE_TEXT),
                );
                ui.label(RichText::new(&bar.counts).color(palette::TEXT));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.add(egui::Button::new("Clear").shortcut_text("Esc")).clicked() {
                        actions.push(Action::Msg(Msg::Filter(None)));
                    }
                });
            });
        });
}

pub fn picker(ctx: &egui::Context, state: &State, view: &mut UiState, actions: &mut Vec<Action>) {
    let Some(snapshot) = state.snapshot.as_ref().filter(|_| state.picking) else {
        return;
    };
    egui::Window::new("Filter to a milestone")
        .collapsible(false)
        .resizable(false)
        .anchor(Align2::CENTER_CENTER, [0.0, 0.0])
        .show(ctx, |ui| {
            ui.weak("The selection is due for none. ↑↓ and Enter pick one; Esc cancels.");
            for (i, m) in snapshot.milestones.iter().enumerate() {
                let reached = if m.reached.is_some() { " · reached" } else { "" };
                let text = format!("◆ {}  {}{reached}", m.id, m.date);
                if ui.selectable_label(view.picker == i, text).clicked() {
                    actions.push(Action::Msg(Msg::Filter(Some(m.id.clone()))));
                }
            }
            if ui.button("Cancel").clicked() {
                actions.push(Action::Msg(Msg::Escape));
            }
        });
}

/// One line of text, cut with "…" at `max` points wide.
fn line(p: &Painter, text: &str, font: FontId, colour: Color32, max: f32) -> Arc<Galley> {
    line_job(p, &[(text, TextFormat::simple(font, colour))], max)
}

fn line_job(p: &Painter, runs: &[(&str, TextFormat)], max: f32) -> Arc<Galley> {
    let mut job = LayoutJob::default();
    for (text, format) in runs {
        job.append(text, 0.0, format.clone());
    }
    job.wrap.max_width = max.max(0.0);
    job.wrap.max_rows = 1;
    job.wrap.break_anywhere = true;
    job.wrap.overflow_character = Some('…');
    p.layout_job(job)
}

/// Draw a galley vertically centred on `y`, starting at `x`; returns its width.
fn put(p: &Painter, galley: Arc<Galley>, x: f32, y: f32) -> f32 {
    let w = galley.size().x;
    p.galley(pos2(x, y - galley.size().y / 2.0), galley, palette::TEXT);
    w
}

/// A small rounded tag or chip; returns its width.
fn pill(
    p: &Painter,
    text: &str,
    x: f32,
    y: f32,
    (stroke, fill, colour): (Color32, Color32, Color32),
    round: u8,
) -> f32 {
    pill_max(p, text, x, y, (stroke, fill, colour), round, f32::INFINITY)
}

/// The width a pill of `text` takes.
fn pill_width(p: &Painter, text: &str) -> f32 {
    line(p, text, mono(10.5), palette::TEXT, f32::INFINITY).size().x + 8.0
}

fn pill_max(
    p: &Painter,
    text: &str,
    x: f32,
    y: f32,
    (stroke, fill, colour): (Color32, Color32, Color32),
    round: u8,
    max: f32,
) -> f32 {
    let galley = line(p, text, mono(10.5), colour, (max - 8.0).max(8.0));
    let size = galley.size() + vec2(8.0, 2.0);
    let rect = Rect::from_min_size(pos2(x, y - size.y / 2.0), size);
    p.rect(
        rect,
        CornerRadius::same(round),
        fill,
        Stroke::new(1.0, stroke),
        StrokeKind::Inside,
    );
    p.galley(rect.min + vec2(4.0, 1.0), galley, colour);
    size.x
}

fn tag_colours(tag: &Tag) -> (Color32, Color32, Color32) {
    match tag.kind {
        TagKind::Shipped => (palette::SHIPPED, palette::PAPER, palette::SHIPPED_TEXT),
        TagKind::Declined => (palette::LANE_GREY, palette::PAPER, palette::FAINT),
        TagKind::NeededFirst => (palette::MILESTONE, palette::CHANGED_FILL, palette::MILESTONE_TEXT),
        TagKind::Gate => (palette::TAG, palette::PAPER, palette::MUTED),
        TagKind::Blocked => (palette::BLOCKED, palette::PAPER, palette::BLOCKED_TEXT),
        TagKind::Hidden => (palette::SOFT, palette::PAPER, palette::FAINT),
        TagKind::Changed => (palette::CHANGED, palette::CHANGED_FILL, palette::CHANGED_TEXT),
    }
}

fn chip(p: &Painter, chip: &Chip, x: f32, y: f32, max: f32) -> f32 {
    let colours = if chip.late.is_some() {
        (palette::LATE, palette::LATE_FILL, palette::LATE)
    } else if chip.kind == ChipKind::Due && !chip.reached {
        (palette::MILESTONE, palette::MILESTONE, palette::PAPER)
    } else {
        (palette::MILESTONE, palette::PAPER, palette::MILESTONE_TEXT)
    };
    pill_max(p, &chip.text(), x, y, colours, 8, max)
}

struct Columns {
    gutter: f32,
    id: f32,
    title: f32,
}

impl Columns {
    fn new(p: &Painter, q: &Queue, width: f32) -> Columns {
        let gutter = gutter::width(q.lanes.columns);
        let longest = q
            .rows
            .iter()
            .filter_map(|r| match &r.kind {
                RowKind::Item(i) => Some(line(p, &i.id, mono(11.5), palette::MUTED, f32::INFINITY).size().x),
                _ => None,
            })
            .fold(0.0, f32::max);
        let id = longest + 2.0 * PAD;
        let title = (width - gutter - id - BUCKET - CHIP_COLUMN - DATE).max(TITLE_MIN);
        Columns { gutter, id, title }
    }
}

pub fn table(ui: &mut egui::Ui, state: &State, q: &Queue, view: &mut UiState, actions: &mut Vec<Action>) {
    let width = ui.available_width();
    let cols = Columns::new(ui.painter(), q, width);
    let full = cols.gutter + cols.id + cols.title + BUCKET + CHIP_COLUMN + DATE;

    // The header.
    let (head, _) = ui.allocate_exact_size(vec2(full.max(width), 22.0), Sense::hover());
    let p = ui.painter();
    p.rect_filled(head, 0.0, palette::HEAD);
    p.line_segment(
        [head.left_bottom(), head.right_bottom()],
        Stroke::new(1.0, palette::HEAD_RULE),
    );
    let mut x = head.left();
    for (label, w) in [
        ("graph", cols.gutter),
        ("id", cols.id),
        ("title", cols.title),
        ("bucket", BUCKET),
        ("milestones", CHIP_COLUMN),
        ("date", DATE),
    ] {
        put(
            p,
            line(p, label, body(11.0), palette::MUTED, w),
            x + PAD.min(w / 4.0),
            head.center().y,
        );
        x += w;
    }

    let selected = state.selected.as_deref().and_then(|k| q.position(k));
    let mut area = ScrollArea::vertical().auto_shrink(false);
    if view.reveal
        && let Some(index) = selected
        && let Some(offset) = queue::scroll_to(index, ROW, view.offset, view.viewport)
    {
        area = area.vertical_scroll_offset(offset);
    }
    view.reveal = false;
    let output = ui
        .scope(|ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            area.show_rows(ui, ROW, q.rows.len(), |ui, range| {
                for index in range {
                    draw_row(
                        ui,
                        state,
                        q,
                        index,
                        selected == Some(index),
                        &cols,
                        full.max(width),
                        actions,
                    );
                }
            })
        })
        .inner;
    view.offset = output.state.clamped_offset().y;
    view.viewport = output.inner_rect.height();
    view.page_rows = ((view.viewport / ROW) as i64 - 1).max(1);
}

#[allow(clippy::too_many_arguments)]
fn draw_row(
    ui: &mut egui::Ui,
    state: &State,
    q: &Queue,
    index: usize,
    selected: bool,
    cols: &Columns,
    width: f32,
    actions: &mut Vec<Action>,
) {
    let row = &q.rows[index];
    let (rect, response) = ui.allocate_exact_size(vec2(width, ROW), Sense::CLICK);
    let p = ui.painter_at(rect);
    let y = rect.center().y;
    let matched = matches!(&row.kind, RowKind::Item(i) if i.matches);
    let fill = match &row.kind {
        _ if selected => palette::SELECTED,
        RowKind::Separator { .. } => palette::HEAD,
        _ if matched => palette::MATCH,
        _ => palette::PAPER,
    };
    p.rect_filled(rect, 0.0, fill);
    p.line_segment(
        [rect.left_bottom(), rect.right_bottom()],
        Stroke::new(1.0, palette::RULE),
    );

    let glyph = match &row.kind {
        RowKind::Item(i) => Some(i.glyph),
        _ => None,
    };
    gutter::paint(&p, rect.left_top(), ROW, &row.lane, glyph, q.lanes.bundled());
    let id_x = rect.left() + cols.gutter;
    let title_x = id_x + cols.id;
    let label = match &row.kind {
        RowKind::Separator { label, collapsed, .. } => {
            // Painted, not a ▸ or ▾ glyph, which the default fonts lack.
            let (cx, r) = (id_x + PAD + 4.0, 3.5);
            let points = if *collapsed {
                vec![pos2(cx - r * 0.6, y - r), pos2(cx + r, y), pos2(cx - r * 0.6, y + r)]
            } else {
                vec![pos2(cx - r, y - r * 0.6), pos2(cx + r, y - r * 0.6), pos2(cx, y + r)]
            };
            p.add(egui::Shape::convex_polygon(points, palette::MUTED, Stroke::NONE));
            put(
                &p,
                line(
                    &p,
                    &label.to_uppercase(),
                    body(11.0),
                    palette::MUTED,
                    cols.id + cols.title,
                ),
                id_x + PAD + 14.0,
                y,
            );
            format!("{label}, {}", if *collapsed { "collapsed" } else { "expanded" })
        }
        RowKind::Fold { count, unfolded } => {
            put(&p, line(&p, "⋯", mono(11.5), palette::MUTED, cols.id), id_x + PAD, y);
            let text = if *unfolded {
                format!("{count} with no edges into open items, shown below · Enter folds them")
            } else {
                format!("{count} more shipped or declined, with no edges into open items · Enter unfolds them")
            };
            let galley = line_job(
                &p,
                &[(
                    &text,
                    TextFormat {
                        italics: true,
                        ..TextFormat::simple(body(12.5), palette::FAINT)
                    },
                )],
                cols.title,
            );
            put(&p, galley, title_x + PAD, y);
            text
        }
        RowKind::Item(item) => {
            item_cells(&p, item, id_x, title_x, y, cols);
            format!("{}, {}, {}", glyph_word(item.glyph), item.id, item.title)
        }
    };
    response.widget_info(|| WidgetInfo::selected(egui::Role::ListItem, true, selected, &label));
    if response.clicked() {
        actions.push(Action::Msg(Msg::Select(Some(row.key()))));
        if !matches!(row.kind, RowKind::Item(_)) {
            actions.push(Action::Msg(Msg::Toggle(row.key())));
        }
    }
    if let RowKind::Item(item) = &row.kind {
        response.on_hover_ui(|ui| hover(ui, state, item));
    }
    if selected {
        // The selected row carries the focus ring.
        ui.painter().rect_stroke(
            rect.shrink(1.0),
            0.0,
            Stroke::new(2.0, palette::FOCUS),
            StrokeKind::Inside,
        );
    }
}

fn glyph_word(glyph: Glyph) -> &'static str {
    match glyph {
        Glyph::Ready => "ready",
        Glyph::Waiting => "waiting",
        Glyph::Later => "later",
        Glyph::Blocked => "blocked",
        Glyph::Archived => "archived",
        Glyph::Unknown => "unknown state",
    }
}

fn item_cells(p: &Painter, item: &ItemRow, id_x: f32, title_x: f32, y: f32, cols: &Columns) {
    let grey = if item.archived { palette::FAINT } else { palette::MUTED };
    put(
        p,
        line(p, &item.id, mono(11.5), grey, cols.id - 2.0 * PAD),
        id_x + PAD,
        y,
    );

    // The title gives way to its tags.
    let tags: Vec<(String, (Color32, Color32, Color32))> =
        item.tags.iter().map(|t| (t.text.clone(), tag_colours(t))).collect();
    let tag_width: f32 = tags
        .iter()
        .map(|(t, _)| line(p, t, mono(10.5), palette::MUTED, f32::INFINITY).size().x + 14.0)
        .sum();
    let room = (cols.title - 2.0 * PAD - tag_width).max(cols.title * 0.4);
    let mut format = TextFormat::simple(body(12.5), if item.archived { palette::FAINT } else { palette::TEXT });
    if item.declined {
        format.strikethrough = Stroke::new(1.0, palette::FAINT);
    }
    let mut x = title_x + PAD;
    x += put(p, line_job(p, &[(&item.title, format)], room), x, y);
    let end = title_x + cols.title - PAD;
    for (text, colours) in tags {
        if x + 6.0 >= end {
            break;
        }
        x += 6.0 + pill(p, &text, x + 6.0, y, colours, 3);
    }

    let mut x = title_x + cols.title;
    put(
        p,
        line(p, &item.position, mono(11.5), palette::MUTED, BUCKET - PAD),
        x + PAD,
        y,
    );
    x += BUCKET;
    // Chips stay inside their column: those that don't fit join the "+n".
    let end = x + CHIP_COLUMN - PAD;
    let more = |drawn: usize| item.chips.len() - drawn;
    let plus_width = |n: usize| {
        line(p, &format!("+{n}"), mono(10.5), palette::MUTED, f32::INFINITY)
            .size()
            .x
            + 4.0
    };
    let mut cx = x + PAD;
    let mut drawn = 0;
    for c in item.chips.iter().take(CHIPS) {
        let rest = more(drawn + 1);
        let reserve = if rest > 0 { plus_width(rest) } else { 0.0 };
        let room = end - cx - reserve;
        let width = pill_width(p, &c.text());
        if width > room && drawn > 0 {
            break;
        }
        cx += chip(p, c, cx, y, room) + 4.0;
        drawn += 1;
    }
    if more(drawn) > 0 {
        put(
            p,
            line(p, &format!("+{}", more(drawn)), mono(10.5), palette::MUTED, 40.0),
            cx,
            y,
        );
    }
    x += CHIP_COLUMN;
    put(
        p,
        line(p, &item.date, mono(11.5), palette::MUTED, DATE - PAD),
        x + PAD,
        y,
    );
}

/// The row's hover text; the strip says the same for the selection, so
/// nothing needs a mouse.
fn hover(ui: &mut egui::Ui, state: &State, item: &ItemRow) {
    let Some(snapshot) = &state.snapshot else { return };
    let Some(full) = snapshot
        .items
        .iter()
        .chain(&snapshot.archived)
        .find(|i| i.id == item.id)
    else {
        return;
    };
    let strip = queue::strip(full, snapshot, state.today);
    ui.label(RichText::new(&item.title).strong());
    if !strip.chips.is_empty() {
        ui.label(RichText::new(strip.chips.join("  ")).color(palette::MILESTONE_TEXT));
    }
    let reason = strip.reason_text();
    if !reason.is_empty() {
        ui.label(reason);
    }
    for tag in &item.tags {
        if tag.hover != tag.text && !strip.reason_text().contains(&tag.hover) {
            ui.weak(&tag.hover);
        }
    }
}

/// The two-line strip under the queue, about the selected row.
pub fn strip(ui: &mut egui::Ui, state: &State, q: &Queue) {
    let (rect, response) = ui.allocate_exact_size(vec2(ui.available_width(), 40.0), Sense::hover());
    let p = ui.painter_at(rect);
    let (y1, y2) = (rect.top() + 11.0, rect.top() + 30.0);
    let left = rect.left() + 8.0;
    let Some(key) = state.selected.as_deref() else {
        put(
            &p,
            line(&p, "Nothing selected", body(12.0), palette::MUTED, rect.width()),
            left,
            y1,
        );
        return;
    };
    let row = q.position(key).map(|i| &q.rows[i]);
    let item = state.selected_item();
    let (Some(item), Some(snapshot)) = (item, &state.snapshot) else {
        // A separator or the fold.
        let text = match row.map(|r| &r.kind) {
            Some(RowKind::Separator { label, collapsed, .. }) => {
                format!(
                    "{label} · Enter, Space or {} to {}",
                    if *collapsed { "→" } else { "←" },
                    if *collapsed { "expand" } else { "collapse" }
                )
            }
            Some(RowKind::Fold { count, unfolded }) => {
                format!(
                    "{count} archived items · Enter or Space to {}",
                    if *unfolded { "fold" } else { "unfold" }
                )
            }
            _ => String::new(),
        };
        put(
            &p,
            line(&p, &text, body(12.0), palette::MUTED, rect.width() - 16.0),
            left,
            y1,
        );
        return;
    };
    let s = queue::strip(item, snapshot, state.today);

    // Line 1: glyph, id, title, every chip, place.
    gutter::node_glyph(&p, pos2(left + 5.0, y1), s.glyph);
    let mut x = left + 16.0;
    x += put(&p, line(&p, &s.id, mono(11.5), palette::MUTED, 300.0), x, y1) + 10.0;
    let chips_text = s.chips.join("  ");
    let place = line(&p, &s.place, body(12.0), palette::MUTED, 320.0);
    let chips = line(&p, &chips_text, mono(10.5), palette::MILESTONE_TEXT, 420.0);
    let title_room = (rect.right() - 8.0 - x - place.size().x - chips.size().x - 30.0).max(80.0);
    x += put(
        &p,
        line(
            &p,
            &s.title,
            egui::FontId::proportional(13.0),
            palette::TEXT,
            title_room,
        ),
        x,
        y1,
    ) + 10.0;
    if !chips_text.is_empty() {
        x += put(&p, chips, x, y1) + 10.0;
    }
    put(&p, place, x, y1);

    // Line 2: the reason never gives way first; the sentence does.
    let runs: Vec<(&str, TextFormat)> = s
        .reason
        .iter()
        .map(|(text, tone)| {
            let colour = match tone {
                Tone::Plain => Color32::from_rgb(0x3d, 0x3c, 0x39),
                Tone::Strong => palette::TEXT,
                Tone::Milestone => palette::MILESTONE_TEXT,
                Tone::Blocked => palette::BLOCKED_TEXT,
                Tone::Muted => palette::MUTED,
            };
            (text.as_str(), TextFormat::simple(body(12.0), colour))
        })
        .collect();
    let sentence = if s.reason.is_empty() {
        s.sentence.clone()
    } else if s.sentence.is_empty() {
        String::new()
    } else {
        format!("· {}", s.sentence)
    };
    let available = rect.width() - 16.0;
    let reason_w = line_job(&p, &runs, f32::INFINITY).size().x;
    let sentence_w = line(&p, &sentence, body(12.0), palette::MUTED, f32::INFINITY).size().x;
    let (rw, sw) = queue::fit(reason_w, sentence_w, 6.0, available);
    let mut x = left;
    if !runs.is_empty() {
        x += put(&p, line_job(&p, &runs, rw + 1.0), x, y2) + 6.0;
    }
    if sw > 0.0 {
        put(&p, line(&p, &sentence, body(12.0), palette::MUTED, sw + 1.0), x, y2);
    }
    if reason_w + sentence_w + 6.0 > available {
        response.on_hover_text(format!("{} {}", s.reason_text(), sentence));
    }
}
