use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

pub const FAVICON: Asset = asset!("/assets/favicon.ico");
pub const LOGO: Asset = asset!("/assets/logo1.png");
pub const MAIN_CSS: Asset = asset!("/assets/main.css");
pub const WORK_SANS_300_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-300-normal.woff2");
pub const WORK_SANS_400_ITALIC: Asset = asset!("/assets/fonts/work-sans-latin-400-italic.woff2");
pub const WORK_SANS_400_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-400-normal.woff2");
pub const WORK_SANS_600_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-600-normal.woff2");

pub const MODAL_DEFAULT_HEIGHT: f64 = 360.0;
pub const MODAL_DEFAULT_WIDTH: f64 = 520.0;
pub const MODAL_MIN_HEIGHT: f64 = 300.0;
pub const MODAL_MIN_WIDTH: f64 = 400.0;

pub const API_BASE_URL: &str = "http://localhost:9908";

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
    pub fn from_path(path: &str) -> Self {
        match path {
            "/data-explorer" => Self::DataExplorer,
            "/templates" | "/types" => Self::Templates,
            "/security" => Self::Security,
            "/audit" => Self::Audit,
            "/user-profile" | "/profile" => Self::Profile,
            "/login" => Self::Login,
            _ => Self::Home,
        }
    }

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

    #[cfg(target_arch = "wasm32")]
    pub fn path(self) -> &'static str {
        match self {
            Self::Home => "/",
            Self::DataExplorer => "/data-explorer",
            Self::Templates => "/templates",
            Self::Security => "/security",
            Self::Audit => "/audit",
            Self::Profile => "/user-profile",
            Self::Login => "/login",
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

#[derive(Clone, PartialEq)]
pub struct OpenModal {
    pub id: u32,
    pub position: ModalPosition,
    pub size: ModalSize,
    pub title: String,
    pub z_index: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessLevel {
    pub description: String,
    pub id: u32,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permission {
    pub description: String,
    pub id: u32,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub access_levels: Vec<AccessLevel>,
    pub email: String,
    pub first_name: String,
    pub id: String,
    pub last_name: String,
    pub permissions: Vec<Permission>,
    pub username: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub session_key: String,
    pub user: User,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub identifier: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginResponse {
    pub data: AuthSession,
}

#[derive(Deserialize)]
pub struct AccessLevelsResponse {
    pub data: Vec<AccessLevel>,
}

#[derive(Deserialize)]
pub struct PermissionsResponse {
    pub data: Vec<Permission>,
}

#[derive(Deserialize)]
pub struct UsersResponse {
    pub data: Vec<User>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInfoInput {
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub username: String,
}

#[derive(Serialize)]
pub struct UpdatePasswordInput {
    #[serde(rename = "currentPassword")]
    pub current_password: String,
    #[serde(rename = "newPassword")]
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct UserResponse {
    pub data: User,
}
