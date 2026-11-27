//! Painting one row of the lanes `lanes::layout` worked out.

use eframe::egui::{Color32, Painter, Pos2, Shape, Stroke, epaint::CubicBezierShape, pos2};

use super::palette;
use crate::lanes::{self, MAX_LANES};
use crate::queue::Glyph;

/// The horizontal pitch of the lanes.
pub const PITCH: f32 = 14.0;
const RADIUS: f32 = 4.5;

pub fn width(columns: usize) -> f32 {
    columns.max(1) as f32 * PITCH + 6.0
}

fn x(left: f32, col: usize) -> f32 {
    left + 9.0 + col as f32 * PITCH
}

fn colour(archived: bool) -> Color32 {
    if archived { palette::LANE_GREY } else { palette::LANE }
}

/// Paint `lane` in the row whose top-left corner is `origin` and whose
/// height is `height`; `glyph` is the node's, if the row has one.
pub fn paint(p: &Painter, origin: Pos2, height: f32, lane: &lanes::Row, glyph: Option<Glyph>, bundled: bool) {
    let (top, mid, bottom) = (origin.y, origin.y + height / 2.0, origin.y + height);
    let line = |a: Pos2, b: Pos2, archived: bool| {
        p.line_segment([a, b], Stroke::new(1.6, colour(archived)));
    };
    let double = |col: usize| bundled && col == MAX_LANES - 1;
    for seg in &lane.through {
        let sx = x(origin.x, seg.col);
        line(pos2(sx, top), pos2(sx, bottom), seg.archived);
        if double(seg.col) {
            line(pos2(sx + 3.0, top), pos2(sx + 3.0, bottom), seg.archived);
        }
    }
    let Some(node) = lane.node else { return };
    let nx = x(origin.x, node);
    for seg in &lane.into {
        let sx = x(origin.x, seg.col);
        if seg.col == node {
            line(pos2(sx, top), pos2(sx, mid), seg.archived);
        } else {
            p.add(CubicBezierShape::from_points_stroke(
                [pos2(sx, top), pos2(sx, mid), pos2(nx, top + 6.0), pos2(nx, mid)],
                false,
                Color32::TRANSPARENT,
                Stroke::new(1.6, colour(seg.archived)),
            ));
        }
    }
    if let Some(archived) = lane.down {
        line(pos2(nx, mid), pos2(nx, bottom), archived);
    }
    if lane.stub {
        let grey = Stroke::new(1.4, palette::LANE_GREY);
        p.line_segment([pos2(nx, mid - 5.0), pos2(nx, top + 1.0)], grey);
        p.line_segment([pos2(nx - 3.0, top + 4.0), pos2(nx, top + 1.0)], grey);
        p.line_segment([pos2(nx + 3.0, top + 4.0), pos2(nx, top + 1.0)], grey);
    }
    if let Some(glyph) = glyph {
        node_glyph(p, pos2(nx, mid), glyph);
    }
}

/// A state's glyph, the same in the queue and the strip: filled when ready,
/// hollow when waiting, dashed in Later, ⊘ when blocked, grey when archived.
pub fn node_glyph(p: &Painter, centre: Pos2, glyph: Glyph) {
    let ring = |c: Color32| Stroke::new(1.8, c);
    match glyph {
        Glyph::Ready => {
            p.circle(centre, RADIUS, palette::LANE, ring(palette::LANE));
        }
        Glyph::Waiting => {
            p.circle(centre, RADIUS, palette::PAPER, ring(palette::LANE));
        }
        Glyph::Later => {
            p.circle_filled(centre, RADIUS, palette::PAPER);
            let points: Vec<Pos2> = (0..=24)
                .map(|i| {
                    let a = i as f32 / 24.0 * std::f32::consts::TAU;
                    centre + RADIUS * eframe::egui::vec2(a.cos(), a.sin())
                })
                .collect();
            p.extend(Shape::dashed_line(&points, ring(palette::LANE_GREY), 2.0, 2.0));
        }
        Glyph::Blocked => {
            p.circle(centre, RADIUS, palette::PAPER, ring(palette::BLOCKED));
            let d = RADIUS * 0.7;
            p.line_segment(
                [centre + eframe::egui::vec2(-d, d), centre + eframe::egui::vec2(d, -d)],
                Stroke::new(1.4, palette::BLOCKED),
            );
        }
        Glyph::Archived | Glyph::Unknown => {
            p.circle(centre, RADIUS, palette::PAPER, ring(palette::LANE_GREY));
        }
    }
}
