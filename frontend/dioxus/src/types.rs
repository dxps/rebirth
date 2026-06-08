use dioxus::prelude::*;
use serde::{Deserialize, Serialize};

pub const FAVICON: Asset = asset!("/assets/favicon.ico");
pub const LOGO: Asset = asset!("/assets/logo1.png");
pub const MAIN_CSS: Asset = asset!("/assets/main.css");
pub const WORK_SANS_300_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-300-normal.woff2");
pub const WORK_SANS_400_ITALIC: Asset = asset!("/assets/fonts/work-sans-latin-400-italic.woff2");
pub const WORK_SANS_400_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-400-normal.woff2");
pub const WORK_SANS_600_NORMAL: Asset = asset!("/assets/fonts/work-sans-latin-600-normal.woff2");

pub const MODAL_DEFAULT_WIDTH: f64 = 520.0;
pub const MODAL_MIN_HEIGHT: f64 = 200.0;
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

#[derive(Clone, Copy, PartialEq)]
pub enum SecurityModalMode {
    Create,
    Details,
    Edit,
}

#[derive(Clone, PartialEq)]
pub struct AccessLevelModal {
    pub access_levels: Signal<Vec<AccessLevel>>,
    pub description: String,
    pub error: Option<String>,
    pub id: Option<u32>,
    pub is_delete_confirm_open: bool,
    pub is_info_open: bool,
    pub is_saving: bool,
    pub mode: SecurityModalMode,
    pub name: String,
    pub session_key: String,
}

#[derive(Clone, PartialEq)]
pub struct UserModal {
    pub access_level_ids: Vec<u32>,
    pub access_levels: Vec<AccessLevel>,
    pub email: String,
    pub error: Option<String>,
    pub first_name: String,
    pub id: Option<String>,
    pub is_access_level_menu_open: bool,
    pub is_delete_confirm_open: bool,
    pub is_info_open: bool,
    pub is_permission_menu_open: bool,
    pub is_saving: bool,
    pub last_name: String,
    pub mode: SecurityModalMode,
    pub password: String,
    pub permission_ids: Vec<u32>,
    pub permissions: Vec<Permission>,
    pub session_key: String,
    pub username: String,
    pub users: Signal<Vec<User>>,
}

#[derive(Clone, PartialEq)]
pub struct AttributeTemplateModal {
    pub access_level_id: u32,
    pub access_levels: Vec<AccessLevel>,
    pub attribute_templates: Signal<Vec<AttributeTemplate>>,
    pub can_assign_owner: bool,
    pub can_edit: bool,
    pub default_value: String,
    pub description: String,
    pub error: Option<String>,
    pub id: Option<String>,
    pub is_access_level_menu_open: bool,
    pub is_delete_confirm_open: bool,
    pub is_info_open: bool,
    pub is_ownership_open: bool,
    pub is_required: bool,
    pub is_saving: bool,
    pub is_value_type_menu_open: bool,
    pub mode: SecurityModalMode,
    pub name: String,
    pub owner_user_id: Option<String>,
    pub owner_username: Option<String>,
    pub owner_users: Vec<User>,
    pub session_key: String,
    pub value_type: String,
}

#[derive(Clone, Copy, PartialEq)]
pub enum EntityTemplateTab {
    Attributes,
    Links,
    Inlinks,
}

#[derive(Clone, Copy, PartialEq)]
pub enum EntityTemplateAttributeSourceTab {
    Existing,
    New,
}

#[derive(Clone, PartialEq)]
pub struct EntityTemplateModal {
    pub access_levels: Vec<AccessLevel>,
    pub active_tab: EntityTemplateTab,
    pub attribute_source_tab: EntityTemplateAttributeSourceTab,
    pub attribute_templates: Signal<Vec<AttributeTemplate>>,
    pub attribute_templates_snapshot: Vec<AttributeTemplate>,
    pub can_edit: bool,
    pub dragging_attribute_id: Option<String>,
    pub entity_template: EntityTemplate,
    pub entity_templates: Signal<Vec<EntityTemplate>>,
    pub entity_templates_snapshot: Vec<EntityTemplate>,
    pub error: Option<String>,
    pub open_attribute_access_level_menu_id: Option<String>,
    pub open_attribute_value_type_menu_id: Option<String>,
    pub open_link_target_menu_id: Option<String>,
    pub is_attribute_template_menu_open: bool,
    pub is_attribute_popover_open: bool,
    pub is_delete_confirm_open: bool,
    pub is_info_open: bool,
    pub is_listing_attribute_menu_open: bool,
    pub is_new_attribute_value_type_menu_open: bool,
    pub is_ownership_open: bool,
    pub is_saving: bool,
    pub mode: SecurityModalMode,
    pub new_attribute_description: String,
    pub new_attribute_name: String,
    pub new_attribute_save_as_template: bool,
    pub new_attribute_value_type: String,
    pub owner_users: Vec<User>,
    pub selected_attribute_template_id: Option<String>,
    pub session_key: String,
}

#[derive(Clone, PartialEq)]
pub enum ModalContent {
    AccessLevel(AccessLevelModal),
    AttributeTemplate(AttributeTemplateModal),
    EntityTemplate(EntityTemplateModal),
    Generic,
    User(UserModal),
}

#[derive(Clone, PartialEq)]
pub struct OpenModal {
    pub content: ModalContent,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub name: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct AuditEventsResponse {
    pub data: Vec<AuditEvent>,
}

#[derive(Deserialize)]
pub struct AccessLevelsResponse {
    pub data: Vec<AccessLevel>,
}

#[derive(Deserialize)]
pub struct AccessLevelResponse {
    pub data: AccessLevel,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeTemplate {
    pub access_level_id: u32,
    pub default_value: Option<String>,
    pub description: String,
    pub id: String,
    pub is_required: bool,
    pub name: String,
    pub owner_user_id: String,
    pub owner_username: Option<String>,
    pub value_type: String,
}

#[derive(Deserialize)]
pub struct AttributeTemplatesResponse {
    pub data: Vec<AttributeTemplate>,
}

#[derive(Deserialize)]
pub struct AttributeTemplateResponse {
    pub data: AttributeTemplate,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplateAttribute {
    pub access_level_id: u32,
    pub default_value: Option<String>,
    pub description: String,
    pub id: String,
    pub is_required: bool,
    pub listing_index: i32,
    pub name: String,
    pub value_type: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplateLink {
    pub description: Option<String>,
    pub entity_template_id: String,
    pub id: String,
    pub listing_index: i32,
    pub name: String,
    pub target_entity_template_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplate {
    pub attributes: Vec<EntityTemplateAttribute>,
    pub description: String,
    pub id: String,
    pub links: Vec<EntityTemplateLink>,
    pub listing_attribute_id: String,
    pub name: String,
    pub owner_user_id: String,
    pub owner_username: Option<String>,
}

#[derive(Deserialize)]
pub struct EntityTemplatesResponse {
    pub data: Vec<EntityTemplate>,
}

#[derive(Deserialize)]
pub struct EntityTemplateResponse {
    pub data: EntityTemplate,
}

#[derive(Deserialize)]
pub struct ApiErrorPayload {
    pub error: ApiErrorValue,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum ApiErrorValue {
    Message(String),
    Details { message: String },
}

#[derive(Deserialize)]
pub struct PermissionsResponse {
    pub data: Vec<Permission>,
}

#[derive(Deserialize)]
pub struct UsersResponse {
    pub data: Vec<User>,
}

#[derive(Deserialize)]
pub struct UserResponse {
    pub data: User,
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityAttribute {
    pub access_level_id: u32,
    pub description: String,
    pub id: String,
    pub is_required: bool,
    pub listing_index: i32,
    pub name: String,
    pub value: String,
    pub value_type: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityLink {
    pub id: String,
    pub entity_id: String,
    pub target_entity_id: Option<String>,
    pub target_entity_label: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub listing_index: i32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityIncomingLink {
    pub id: String,
    pub description: Option<String>,
    pub listing_index: i32,
    pub name: String,
    pub source_entity_id: String,
    pub source_entity_label: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub owner_user_id: String,
    pub owner_username: Option<String>,
    pub attributes: Vec<EntityAttribute>,
    pub listing_attribute_id: String,
    pub links: Vec<EntityLink>,
    pub incoming_links: Option<Vec<EntityIncomingLink>>,
    pub incoming_links_count: Option<u32>,
    pub outgoing_links_count: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub page: u32,
    pub page_size: u32,
    pub total: u32,
}

#[derive(Deserialize)]
pub struct EntitiesResponse {
    pub data: Vec<Entity>,
    pub pagination: Pagination,
}

#[derive(Deserialize)]
pub struct EntityResponse {
    pub data: Entity,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SavedView {
    pub description: String,
    pub id: String,
    pub name: String,
    pub search_text: String,
}
