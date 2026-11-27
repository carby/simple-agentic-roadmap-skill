//! Every colour the GUI draws with, from the sketches. Light only for now:
//! a dark palette replaces this module's values, not the drawing code.

use eframe::egui::Color32;

const fn rgb(hex: u32) -> Color32 {
    Color32::from_rgb((hex >> 16) as u8, (hex >> 8) as u8, hex as u8)
}

pub const TEXT: Color32 = rgb(0x1d1d1b);
pub const MUTED: Color32 = rgb(0x5c5b55);
pub const FAINT: Color32 = rgb(0x6f6c64);
pub const PAPER: Color32 = rgb(0xffffff);
pub const RULE: Color32 = rgb(0xf0efeb);
pub const HEAD: Color32 = rgb(0xefefec);
pub const HEAD_RULE: Color32 = rgb(0xdcdad3);
pub const STRIP: Color32 = rgb(0xfbfaf7);

pub const SELECTED: Color32 = rgb(0xcfe0f7);
pub const FOCUS: Color32 = rgb(0x163e7e);
pub const MATCH: Color32 = rgb(0xfdf3c4);

/// Open lanes and the ready and waiting nodes.
pub const LANE: Color32 = rgb(0x2f6fd0);
/// Archived lanes, Later nodes and stubs.
pub const LANE_GREY: Color32 = rgb(0x8d8a80);

pub const TAG: Color32 = rgb(0xcfcdc6);
pub const BLOCKED: Color32 = rgb(0x6a4c93);
pub const BLOCKED_TEXT: Color32 = rgb(0x5a3d82);
pub const SHIPPED: Color32 = rgb(0x2d7a3a);
pub const SHIPPED_TEXT: Color32 = rgb(0x24662f);
pub const SOFT: Color32 = rgb(0xb9b6ad);
pub const CHANGED: Color32 = rgb(0xd9b44a);
pub const CHANGED_TEXT: Color32 = rgb(0x6b4600);
pub const CHANGED_FILL: Color32 = rgb(0xfff3d6);
pub const LATE: Color32 = rgb(0xb3261e);
pub const LATE_FILL: Color32 = rgb(0xfde7e4);

/// Milestones are amber everywhere.
pub const MILESTONE: Color32 = rgb(0xb07a00);
pub const MILESTONE_TEXT: Color32 = rgb(0x7a5000);
