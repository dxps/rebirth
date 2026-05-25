use dioxus::prelude::*;

pub const FAVICON: Asset = asset!("/assets/favicon.ico");
pub const LOGO: Asset = asset!("/assets/logo1.png");
pub const MAIN_CSS: Asset = asset!("/assets/main.css");

pub const MODAL_DEFAULT_HEIGHT: f64 = 360.0;
pub const MODAL_DEFAULT_WIDTH: f64 = 520.0;
pub const MODAL_MIN_HEIGHT: f64 = 300.0;
pub const MODAL_MIN_WIDTH: f64 = 400.0;

#[derive(Clone, Copy, PartialEq)]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Route {
    Home,
    DataExplorer,
    Templates,
    Security,
    Audit,
    Profile,
    Login,
}

impl Route {
    pub fn label(self) -> &'static str {
        match self {
            Self::Home => "Home",
            Self::DataExplorer => "Data Explorer",
            Self::Templates => "Templates",
            Self::Security => "Security",
            Self::Audit => "Audit",
            Self::Profile => "Profile",
            Self::Login => "Login",
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
pub struct ModalPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, PartialEq)]
pub struct ModalSize {
    pub height: f64,
    pub width: f64,
}

#[derive(Clone, Copy, PartialEq)]
pub struct ModalDrag {
    pub modal_id: u32,
    pub offset_x: f64,
    pub offset_y: f64,
}

#[derive(Clone, Copy, PartialEq)]
pub struct ModalResize {
    pub modal_id: u32,
    pub start_height: f64,
    pub start_width: f64,
    pub start_x: f64,
    pub start_y: f64,
}

#[derive(Clone, Copy, PartialEq)]
pub enum ModalInteraction {
    Drag(ModalDrag),
    Resize(ModalResize),
}

#[derive(Clone, Copy, PartialEq)]
pub struct OpenModal {
    pub id: u32,
    pub position: ModalPosition,
    pub size: ModalSize,
    pub title: &'static str,
    pub z_index: u32,
}
