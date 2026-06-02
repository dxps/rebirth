use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{
    Clipboard, Eye, EyeOff, GripVertical, Info, Pencil, Plus, Save, Trash2, User, X,
};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::components::single_select_picker::{SingleSelectOption, SingleSelectPicker};
use crate::types::{
    AccessLevel, AccessLevelsResponse, AuthSession, EntitiesResponse, Entity, EntityAttribute,
    EntityIncomingLink, EntityLink, EntityResponse, EntityTemplate, EntityTemplatesResponse,
    SavedView, User as RebirthUser, UsersResponse, API_BASE_URL,
};

use super::{json_string, read_response_error, DeleteConfirmPopover};

const VALUE_TYPES: [&str; 5] = ["text", "number", "boolean", "date", "datetime"];
static ENTITY_ATTRIBUTE_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

#[derive(Clone, PartialEq)]
pub enum EntityTab {
    Attributes,
    Links,
    Inlinks,
}

#[derive(Clone, PartialEq)]
pub struct EntityDetailsWindow {
    pub id: String,
    pub entity_id: String,
    pub entity: Option<Entity>,
    pub active_tab: EntityTab,
    pub error: Option<String>,
    pub is_loading: bool,
    pub is_delete_confirm_open: bool,
    pub is_info_open: bool,
    pub is_owner_open: bool,
    pub is_edit_mode: bool,
    pub z_index: u32,
    pub position: crate::types::ModalPosition,
    pub size: crate::types::ModalSize,
    // edit state
    pub edit_attributes: Vec<EntityAttribute>,
    pub edit_error: Option<String>,
    pub is_saving: bool,
    pub revealed_attribute_ids: Vec<String>,
    pub edit_open_access_level_menu_id: Option<String>,
    pub edit_open_value_type_menu_id: Option<String>,
    pub edit_listing_attribute_id: String,
    pub dragged_edit_attribute_id: Option<String>,
}

fn is_public_access_level(access_levels: &[AccessLevel], access_level_id: u32) -> bool {
    access_levels
        .iter()
        .find(|access_level| access_level.id == access_level_id)
        .map(|access_level| access_level.name.eq_ignore_ascii_case("public"))
        .unwrap_or(access_level_id == 1)
}

fn is_owner_view_access_level(access_levels: &[AccessLevel], access_level_id: u32) -> bool {
    access_levels
        .iter()
        .find(|access_level| access_level.id == access_level_id)
        .map(|access_level| access_level.name.eq_ignore_ascii_case("owner view"))
        .unwrap_or(access_level_id == 4)
}

fn has_any_permission(session: Option<&AuthSession>, names: &[&str]) -> bool {
    session.is_some_and(|session| {
        session
            .user
            .permissions
            .iter()
            .any(|permission| names.contains(&permission.name.as_str()))
    })
}

fn can_edit_entity(session: Option<&AuthSession>, entity: &Entity) -> bool {
    has_any_permission(session, &["Admin", "Editor"])
        || (has_any_permission(session, &["ManageOwnData"])
            && session.is_some_and(|session| session.user.id == entity.owner_user_id))
}

fn can_access_attribute_value(
    session: Option<&AuthSession>,
    entity: &Entity,
    attribute: &EntityAttribute,
    access_levels: &[AccessLevel],
) -> bool {
    can_edit_entity(session, entity)
        || is_public_access_level(access_levels, attribute.access_level_id)
        || if is_owner_view_access_level(access_levels, attribute.access_level_id) {
            session.is_some_and(|session| session.user.id == entity.owner_user_id)
        } else {
            session.is_some_and(|session| {
                session
                    .user
                    .access_levels
                    .iter()
                    .any(|access_level| access_level.id == attribute.access_level_id)
            })
        }
}

fn entity_attribute_visible_value(
    attribute: &EntityAttribute,
    access_levels: &[AccessLevel],
    is_revealed: bool,
    can_use_restricted_actions: bool,
) -> String {
    let should_mask = !is_public_access_level(access_levels, attribute.access_level_id);

    if should_mask && (!is_revealed || !can_use_restricted_actions) {
        "******".to_string()
    } else {
        attribute.value.clone()
    }
}

fn copy_text_to_clipboard(value: String) {
    copy_text_to_clipboard_impl(value);
}

#[cfg(target_arch = "wasm32")]
fn copy_text_to_clipboard_impl(value: String) {
    if let Some(clipboard) = web_sys::window().map(|window| window.navigator().clipboard()) {
        let _ = clipboard.write_text(&value);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn copy_text_to_clipboard_impl(_value: String) {}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

pub async fn fetch_entity(session_key: &str, entity_id: &str) -> Result<Entity, String> {
    let response = Request::get(&format!("{API_BASE_URL}/entities/{entity_id}"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err(read_response_error(response, "Data is unavailable").await);
    }

    response
        .json::<EntityResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

pub async fn fetch_entities(
    session_key: &str,
    page: u32,
    search: &str,
) -> Result<(Vec<Entity>, u32), String> {
    let mut url = format!("{API_BASE_URL}/entities?page={page}&pageSize=10");
    if !search.is_empty() {
        url.push_str(&format!("&search={}", js_encode_uri_component(search)));
    }

    let response = Request::get(&url)
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err(read_response_error(response, "Data is unavailable").await);
    }

    response
        .json::<EntitiesResponse>()
        .await
        .map(|payload| (payload.data, payload.pagination.total))
        .map_err(|_| "Data is unavailable".to_string())
}

pub async fn fetch_entity_templates_list(session_key: &str) -> Result<Vec<EntityTemplate>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/entity-templates"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<EntityTemplatesResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

pub async fn fetch_access_levels_list(session_key: &str) -> Result<Vec<AccessLevel>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/access-levels"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<AccessLevelsResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

pub async fn fetch_entity_owners(session_key: &str) -> Result<Vec<RebirthUser>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/entity-owners"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<UsersResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

fn js_encode_uri_component(s: &str) -> String {
    // Minimal percent-encoding for query param values.
    let mut encoded = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

// ---------------------------------------------------------------------------
// Saved-view localStorage helpers
// ---------------------------------------------------------------------------

fn saved_views_key(user_id: &str) -> String {
    format!("rebirth.data-explorer.views.{user_id}")
}

pub fn load_saved_views(user_id: &str) -> Vec<SavedView> {
    load_saved_views_impl(user_id)
}

#[cfg(target_arch = "wasm32")]
fn load_saved_views_impl(user_id: &str) -> Vec<SavedView> {
    let key = saved_views_key(user_id);
    web_sys::window()
        .and_then(|w| w.local_storage().ok().flatten())
        .and_then(|s| s.get_item(&key).ok().flatten())
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

#[cfg(not(target_arch = "wasm32"))]
fn load_saved_views_impl(_user_id: &str) -> Vec<SavedView> {
    Vec::new()
}

pub fn store_saved_views(user_id: &str, views: &[SavedView]) {
    store_saved_views_impl(user_id, views);
}

#[cfg(target_arch = "wasm32")]
fn store_saved_views_impl(user_id: &str, views: &[SavedView]) {
    let key = saved_views_key(user_id);
    if let Ok(json) = serde_json::to_string(views) {
        if let Some(storage) = web_sys::window().and_then(|w| w.local_storage().ok().flatten()) {
            let _ = storage.set_item(&key, &json);
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn store_saved_views_impl(_user_id: &str, _views: &[SavedView]) {}

// ---------------------------------------------------------------------------
// EntityDetailsModal component
// ---------------------------------------------------------------------------

#[component]
pub fn EntityDetailsModal(
    window: EntityDetailsWindow,
    windows: Signal<Vec<EntityDetailsWindow>>,
    auth_session: Option<AuthSession>,
    session_key: String,
    access_levels: Vec<AccessLevel>,
    entities: Signal<Vec<Entity>>,
    on_open_entity: EventHandler<String>,
) -> Element {
    let win_id = window.id.clone();
    let win_id_drag = win_id.clone();
    let win_id_resize = win_id.clone();
    let win_id_click = win_id.clone();
    let win_id_close = win_id.clone();
    let mut drag_offset = use_signal(|| None::<(f64, f64)>);
    let mut resize_start = use_signal(|| None::<(f64, f64, f64, f64)>);

    let mut raise_window = {
        let win_id = win_id.clone();
        move || {
            let next_z = windows.read().iter().map(|w| w.z_index).max().unwrap_or(20) + 1;
            if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                w.z_index = next_z;
            }
        }
    };

    let position = window.position;
    let size = window.size;
    let z_index = window.z_index;
    let is_dragging = drag_offset().is_some();
    let is_resizing = resize_start().is_some();
    let win_id_move = win_id_drag.clone();
    let win_id_resize_move = win_id_resize.clone();
    let win_id_pointer_up = win_id.clone();
    let win_id_pointer_cancel = win_id.clone();

    rsx! {
        div {
            class: if is_dragging {
                "draggable-modal-layer is-dragging"
            } else if is_resizing {
                "draggable-modal-layer is-resizing"
            } else {
                "draggable-modal-layer"
            },
            style: "z-index: {z_index};",
            onpointermove: move |event| {
                let point = event.data().client_coordinates();

                if let Some((offset_x, offset_y)) = drag_offset() {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_move) {
                        w.position = crate::types::ModalPosition {
                            x: (point.x - offset_x).max(16.0),
                            y: (point.y - offset_y).max(64.0),
                        };
                    }
                }

                if let Some((start_width, start_height, start_x, start_y)) = resize_start() {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_resize_move) {
                        w.size = crate::types::ModalSize {
                            height: (start_height + point.y - start_y).max(200.0),
                            width: (start_width + point.x - start_x).max(400.0),
                        };
                    }
                }
            },
            onpointerup: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
                if let Some(w) = windows
                    .write()
                    .iter_mut()
                    .find(|w| w.id == win_id_pointer_up)
                {
                    w.dragged_edit_attribute_id = None;
                }
            },
            onpointercancel: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
                if let Some(w) = windows
                    .write()
                    .iter_mut()
                    .find(|w| w.id == win_id_pointer_cancel)
                {
                    w.dragged_edit_attribute_id = None;
                }
            },
            div {
                key: "{window.id}",
                class: if is_dragging {
                    "draggable-modal is-dragging"
                } else if is_resizing {
                    "draggable-modal is-resizing"
                } else {
                    "draggable-modal"
                },
                style: "left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; min-width: 400px; min-height: 200px;",
                onpointerdown: move |_| raise_window(),
                div {
                class: "draggable-modal-body",
                onclick: move |_| {
                    // close popovers
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_click) {
                        w.is_info_open = false;
                        w.is_delete_confirm_open = false;
                        w.is_owner_open = false;
                        w.edit_open_access_level_menu_id = None;
                        w.edit_open_value_type_menu_id = None;
                        w.dragged_edit_attribute_id = None;
                    }
                },
                onpointerdown: {
                    let win_id = win_id_drag.clone();
                    move |event: Event<PointerData>| {
                        event.stop_propagation();
                        let point = event.data().client_coordinates();
                        let next_z = windows
                            .read()
                            .iter()
                            .map(|w| w.z_index)
                            .max()
                            .unwrap_or(20)
                            + 1;
                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                            w.z_index = next_z;
                        }
                        drag_offset.set(Some((point.x - position.x, point.y - position.y)));
                        resize_start.set(None);
                    }
                },
                div { class: "draggable-modal-header",
                    h2 { if window.is_edit_mode { "Entity :: Edit" } else { "Entity" } }
                    div {
                        class: "draggable-modal-titlebar-actions",
                        onclick: move |event| event.stop_propagation(),
                        onpointerdown: move |event| event.stop_propagation(),
                        EntityDetailsTitlebarActions {
                            window: window.clone(),
                            windows,
                            session_key: session_key.clone(),
                            entities,
                        }
                        button {
                            class: "draggable-modal-titlebar-button draggable-modal-close",
                            "data-tooltip": "Close",
                            aria_label: "Close",
                            onclick: {
                                let win_id = win_id_close.clone();
                                move |_| {
                                    windows.write().retain(|w| w.id != win_id);
                                }
                            },
                            X { class: "app-icon", size: 15 }
                        }
                    }
                }
                div { class: "draggable-modal-content",
                    EntityDetailsContent {
                        window: window.clone(),
                        windows,
                        auth_session,
                        access_levels,
                        session_key: session_key.clone(),
                        on_open_entity,
                    }
                }
            }
            span {
                class: "draggable-modal-resize",
                "data-tooltip": "Resize",
                onpointerdown: {
                    let win_id = win_id.clone();
                    move |event: Event<PointerData>| {
                        event.stop_propagation();
                        let point = event.data().client_coordinates();
                        let next_z = windows
                            .read()
                            .iter()
                            .map(|w| w.z_index)
                            .max()
                            .unwrap_or(20)
                            + 1;
                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                            w.z_index = next_z;
                        }
                        resize_start.set(Some((size.width, size.height, point.x, point.y)));
                        drag_offset.set(None);
                    }
                },
                for _ in 0..6 {
                    span {}
                }
            }
            }
        }
    }
}

#[component]
fn EntityDetailsTitlebarActions(
    window: EntityDetailsWindow,
    windows: Signal<Vec<EntityDetailsWindow>>,
    session_key: String,
    entities: Signal<Vec<Entity>>,
) -> Element {
    let win_id = window.id.clone();
    let win_id_confirm_cancel = win_id.clone();
    let win_id_confirm_delete = win_id.clone();
    let win_id_owner = win_id.clone();
    let entity_id = window.entity_id.clone();
    let is_info_open = window.is_info_open;
    let is_delete_confirm_open = window.is_delete_confirm_open;
    let is_edit_mode = window.is_edit_mode;
    let can_save = is_edit_mode
        && window
            .edit_attributes
            .iter()
            .all(|a| !a.name.trim().is_empty());

    if is_edit_mode {
        let win_id_cancel = win_id.clone();
        let win_id_save = win_id.clone();
        let sk_save = session_key.clone();
        let eid_save = entity_id.clone();
        let win_id_del = win_id.clone();
        let eid_del = entity_id.clone();
        let sk_del = session_key.clone();
        return rsx! {
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Cancel",
                aria_label: "Cancel edit",
                onclick: move |_| {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_cancel) {
                        w.is_edit_mode = false;
                        w.edit_error = None;
                        w.edit_open_access_level_menu_id = None;
                        w.edit_open_value_type_menu_id = None;
                        w.dragged_edit_attribute_id = None;
                        // restore edit_attributes from entity
                        if let Some(entity) = &w.entity {
                            w.edit_attributes = entity.attributes.clone();
                            w.edit_listing_attribute_id = entity.listing_attribute_id.clone();
                        }
                    }
                },
                lucide_dioxus::ArrowLeft { class: "app-icon", size: 15 }
            }
            div { class: "draggable-modal-delete-action",
                button {
                    class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                    "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                    aria_label: "Delete entity",
                    onclick: move |_| {
                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_del) {
                            w.is_delete_confirm_open = true;
                            w.is_info_open = false;
                            w.is_owner_open = false;
                        }
                    },
                    Trash2 { class: "app-icon", size: 15 }
                }
                if is_delete_confirm_open {
                    DeleteConfirmPopover {
                        on_cancel: {
                            let win_id = win_id.clone();
                            move |_| {
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                                    w.is_delete_confirm_open = false;
                                }
                            }
                        },
                        on_confirm: move |_| {
                            let sk = sk_del.clone();
                            let eid = eid_del.clone();
                            let mut entities_sig = entities;
                            let mut windows_sig = windows;
                            let wid = win_id.clone();
                            spawn(async move {
                                let result = Request::delete(&format!("{API_BASE_URL}/entities/{eid}"))
                                    .header("Authorization", &format!("Bearer {sk}"))
                                    .send()
                                    .await;
                                if result.map(|r| r.ok()).unwrap_or(false) {
                                    entities_sig.write().retain(|e| e.id != eid);
                                    windows_sig.write().retain(|w| w.id != wid);
                                }
                            });
                        },
                    }
                }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": if can_save { "Save" } else { "All attributes must have names" },
                aria_label: "Save entity",
                disabled: !can_save || window.is_saving,
                onclick: move |_| {
                    if can_save {
                        save_entity_window(windows, win_id_save.clone(), sk_save.clone(), eid_save.clone(), entities);
                    }
                },
                Save { class: "app-icon", size: 15 }
            }
        };
    }

    let win_id_info = win_id.clone();
    let win_id_edit = win_id.clone();
    let win_id_del2 = win_id.clone();
    let eid_del2 = entity_id.clone();
    let sk_del2 = session_key.clone();
    let entity_id_str = window
        .entity
        .as_ref()
        .map(|e| e.id.clone())
        .unwrap_or_default();

    rsx! {
        div { class: "draggable-modal-info-action",
            button {
                class: "draggable-modal-titlebar-button draggable-modal-info-button",
                "data-tooltip": "Info",
                aria_label: "Show id",
                aria_expanded: "{is_info_open}",
                onclick: move |_| {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_info) {
                        w.is_info_open = !w.is_info_open;
                        w.is_delete_confirm_open = false;
                        w.is_owner_open = false;
                    }
                },
                Info { class: "app-icon", size: 15 }
            }
            if is_info_open {
                div {
                    class: "entity-id-popover",
                    onclick: move |event| event.stop_propagation(),
                    onpointerdown: move |event| event.stop_propagation(),
                    p { class: "entity-id-popover-title", "data-selectable": "true",
                        "id: {entity_id_str}"
                    }
                }
            }
        }
        div { class: "draggable-modal-delete-action",
            button {
                class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                aria_label: "Delete entity",
                onclick: move |_| {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_del2) {
                        w.is_delete_confirm_open = true;
                        w.is_info_open = false;
                        w.is_owner_open = false;
                    }
                },
                Trash2 { class: "app-icon", size: 15 }
            }
            if is_delete_confirm_open {
                DeleteConfirmPopover {
                    on_cancel: {
                        let wid = win_id_confirm_cancel.clone();
                        move |_| {
                            if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                w.is_delete_confirm_open = false;
                            }
                        }
                    },
                    on_confirm: move |_| {
                        let sk = sk_del2.clone();
                        let eid = eid_del2.clone();
                        let mut entities_sig = entities;
                        let mut windows_sig = windows;
                        let wid = win_id_confirm_delete.clone();
                        spawn(async move {
                            let result = Request::delete(&format!("{API_BASE_URL}/entities/{eid}"))
                                .header("Authorization", &format!("Bearer {sk}"))
                                .send()
                                .await;
                            if result.map(|r| r.ok()).unwrap_or(false) {
                                entities_sig.write().retain(|e| e.id != eid);
                                windows_sig.write().retain(|w| w.id != wid);
                            }
                        });
                    },
                }
            }
        }
        button {
            class: "draggable-modal-titlebar-button",
            "data-tooltip": "Edit",
            aria_label: "Edit entity",
            onclick: move |_| {
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_edit) {
                        w.is_edit_mode = true;
                        if w.active_tab == EntityTab::Inlinks {
                            w.active_tab = EntityTab::Attributes;
                        }
                        w.is_info_open = false;
                        w.is_delete_confirm_open = false;
                        w.edit_open_access_level_menu_id = None;
                        w.edit_open_value_type_menu_id = None;
                        w.dragged_edit_attribute_id = None;
                        if let Some(entity) = &w.entity {
                            w.edit_attributes = entity.attributes.clone();
                            w.edit_listing_attribute_id = entity.listing_attribute_id.clone();
                        }
                }
            },
            Pencil { class: "app-icon", size: 15 }
        }
        button {
            class: "draggable-modal-titlebar-button",
            "data-tooltip": "Owner",
            aria_label: "Ownership",
            onclick: move |_| {
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_owner) {
                    w.is_owner_open = !w.is_owner_open;
                    w.is_info_open = false;
                    w.is_delete_confirm_open = false;
                }
            },
            User { class: "app-icon", size: 15 }
        }
    }
}

fn save_entity_window(
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    win_id: String,
    session_key: String,
    entity_id: String,
    mut entities: Signal<Vec<Entity>>,
) {
    // Mark saving
    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
        w.is_saving = true;
        w.edit_error = None;
    }

    // Collect the current edit state and immutable entity fields required by UpdateEntityInput.
    let (attributes, listing_attribute_id, links) = windows
        .read()
        .iter()
        .find(|w| w.id == win_id)
        .and_then(|w| {
            w.entity.as_ref().map(|entity| {
                (
                    w.edit_attributes.clone(),
                    if w.edit_listing_attribute_id.is_empty() {
                        entity.listing_attribute_id.clone()
                    } else {
                        w.edit_listing_attribute_id.clone()
                    },
                    entity.links.clone(),
                )
            })
        })
        .unwrap_or_default();

    spawn(async move {
        let body = build_entity_update_body(&attributes, &listing_attribute_id, &links);
        let result = Request::put(&format!("{API_BASE_URL}/entities/{entity_id}"))
            .header("Authorization", &format!("Bearer {session_key}"))
            .header("Content-Type", "application/json")
            .body(body)
            .unwrap()
            .send()
            .await;

        match result {
            Ok(response) if response.ok() => {
                match response.json::<crate::types::EntityResponse>().await {
                    Ok(payload) => {
                        let saved = payload.data;
                        // Update entity in list
                        {
                            let mut list = entities.write();
                            if let Some(existing) = list.iter_mut().find(|e| e.id == entity_id) {
                                *existing = saved.clone();
                            }
                        }
                        // Update window
                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                            w.entity = Some(saved);
                            w.is_saving = false;
                            w.is_edit_mode = false;
                            w.edit_error = None;
                            w.edit_open_access_level_menu_id = None;
                            w.edit_open_value_type_menu_id = None;
                            w.edit_listing_attribute_id = String::new();
                            w.dragged_edit_attribute_id = None;
                        }
                    }
                    Err(_) => {
                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                            w.is_saving = false;
                            w.edit_error = Some("Unable to save entity".to_string());
                        }
                    }
                }
            }
            Ok(response) => {
                let message = read_response_error(response, "Unable to save entity").await;
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                    w.is_saving = false;
                    w.edit_error = Some(message);
                }
            }
            Err(_) => {
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                    w.is_saving = false;
                    w.edit_error = Some("Unable to save entity".to_string());
                }
            }
        }
    });
}

fn build_entity_update_body(
    attributes: &[EntityAttribute],
    listing_attribute_id: &str,
    links: &[EntityLink],
) -> String {
    let attrs_json = attributes
        .iter()
        .map(|attr| {
            format!(
                "{{\"accessLevelId\":{},\"description\":{},\"id\":{},\"isRequired\":{},\"listingIndex\":{},\"name\":{},\"value\":{},\"valueType\":{}}}",
                attr.access_level_id,
                json_string(&attr.description),
                json_string(&attr.id),
                attr.is_required,
                attr.listing_index,
                json_string(attr.name.trim()),
                json_string(&attr.value),
                json_string(&attr.value_type),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let links_json = links
        .iter()
        .map(|link| {
            format!(
                "{{\"description\":{},\"listingIndex\":{},\"name\":{},\"targetEntityId\":{}}}",
                link.description
                    .as_ref()
                    .map(|description| json_string(description))
                    .unwrap_or_else(|| "null".to_string()),
                link.listing_index,
                json_string(link.name.trim()),
                link.target_entity_id
                    .as_ref()
                    .map(|target_id| json_string(target_id))
                    .unwrap_or_else(|| "null".to_string()),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"attributes\":[{attrs_json}],\"listingAttributeId\":{},\"links\":[{links_json}]}}",
        json_string(listing_attribute_id),
    )
}

// ---------------------------------------------------------------------------
// Entity details content (tabs)
// ---------------------------------------------------------------------------

#[component]
fn EntityDetailsContent(
    window: EntityDetailsWindow,
    windows: Signal<Vec<EntityDetailsWindow>>,
    auth_session: Option<AuthSession>,
    access_levels: Vec<AccessLevel>,
    session_key: String,
    on_open_entity: EventHandler<String>,
) -> Element {
    if window.is_loading {
        return rsx! {
            div { class: "access-level-unavailable", role: "status",
                p { "Loading…" }
            }
        };
    }

    if let Some(err) = &window.error {
        return rsx! {
            div { class: "access-level-unavailable", role: "status",
                p { "{err}" }
            }
        };
    }

    let Some(entity) = window.entity.clone() else {
        return rsx! {
            div { class: "access-level-unavailable", role: "status",
                p { "No data" }
            }
        };
    };

    let active_tab = window.active_tab.clone();
    let listing_attribute = entity
        .attributes
        .iter()
        .find(|attr| attr.id == entity.listing_attribute_id)
        .cloned();
    let listing_attribute_name = listing_attribute
        .as_ref()
        .map(|attr| attr.name.clone())
        .unwrap_or_default();
    let listing_attribute_value = listing_attribute
        .as_ref()
        .map(|attr| {
            entity_attribute_visible_value(
                attr,
                &access_levels,
                window.revealed_attribute_ids.contains(&attr.id),
                can_access_attribute_value(auth_session.as_ref(), &entity, attr, &access_levels),
            )
        })
        .unwrap_or_default();
    let win_id = window.id.clone();
    let win_id2 = window.id.clone();
    let win_id3 = window.id.clone();

    let is_edit = window.is_edit_mode;
    let mut sorted_attrs = if is_edit {
        window.edit_attributes.clone()
    } else {
        entity.attributes.clone()
    };
    sorted_attrs.sort_by_key(|a| a.listing_index);
    let mut sorted_links = entity.links.clone();
    sorted_links.sort_by_key(|l| l.listing_index);
    let incoming_links = entity.incoming_links.clone().unwrap_or_default();
    let mut sorted_inlinks = incoming_links;
    sorted_inlinks.sort_by_key(|l| l.listing_index);

    let attr_count = sorted_attrs.len();
    let link_count = sorted_links.len();
    let inlink_count = sorted_inlinks.len();

    let default_access_level_id = default_entity_attribute_access_level_id(&access_levels);

    rsx! {
        div { class: if is_edit {
                "entity-template-edit-form entity-template-view-form entity-details-view-form entity-edit-form access-level-details"
            } else {
                "entity-template-edit-form entity-template-view-form entity-details-view-form access-level-details"
            },
            div { class: "entity-view-summary entity-create-summary",
                table { class: "data-table entity-create-summary-table",
                    thead {
                        tr {
                            th { "listing attribute name" }
                            th { "value" }
                        }
                    }
                    tbody {
                        tr {
                            td {
                                span { class: "entity-create-summary-value", "{listing_attribute_name}" }
                            }
                            td {
                                span { class: "entity-attribute-value-view entity-create-summary-value",
                                    span { class: "entity-attribute-value-text", "{listing_attribute_value}" }
                                }
                            }
                        }
                    }
                }
            }
            div { class: "entity-template-tabs",
                div { class: "entity-template-tab-row",
                    div {
                        class: "entity-template-tab-list",
                        role: "tablist",
                        button {
                            class: if active_tab == EntityTab::Attributes { "entity-template-tab is-active" } else { "entity-template-tab" },
                            role: "tab",
                            onpointerdown: move |event| event.stop_propagation(),
                            onclick: move |_| {
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
                                    w.active_tab = EntityTab::Attributes;
                                }
                            },
                            "Attributes"
                            span { class: "entity-template-tab-badge", "{attr_count}" }
                        }
                        button {
                            class: if active_tab == EntityTab::Links { "entity-template-tab is-active" } else { "entity-template-tab" },
                            role: "tab",
                            onpointerdown: move |event| event.stop_propagation(),
                            onclick: move |_| {
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id2) {
                                    w.active_tab = EntityTab::Links;
                                }
                            },
                            "Outlinks"
                            span { class: "entity-template-tab-badge", "{link_count}" }
                        }
                        if !is_edit {
                            button {
                                class: if active_tab == EntityTab::Inlinks { "entity-template-tab is-active" } else { "entity-template-tab" },
                                role: "tab",
                                onpointerdown: move |event| event.stop_propagation(),
                                onclick: move |_| {
                                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id3) {
                                        w.active_tab = EntityTab::Inlinks;
                                    }
                                },
                                "Inlinks"
                                span { class: "entity-template-tab-badge", "{inlink_count}" }
                            }
                        }
                    }
                }
                match active_tab {
                    EntityTab::Attributes => rsx! {
                        EntityAttributesTab {
                            attributes: sorted_attrs,
                            edit_attributes: window.edit_attributes.clone(),
                            access_levels,
                            auth_session,
                            entity,
                            is_edit,
                            is_saving: window.is_saving,
                            open_access_level_menu_id: window.edit_open_access_level_menu_id.clone(),
                            open_value_type_menu_id: window.edit_open_value_type_menu_id.clone(),
                            revealed_attribute_ids: window.revealed_attribute_ids.clone(),
                            dragged_attribute_id: window.dragged_edit_attribute_id.clone(),
                            default_access_level_id,
                            win_id: window.id.clone(),
                            windows,
                        }
                    },
                    EntityTab::Links => rsx! {
                        EntityLinksTab {
                            links: sorted_links,
                            on_open_entity,
                        }
                    },
                    EntityTab::Inlinks => rsx! {
                        EntityInlinksTab {
                            inlinks: sorted_inlinks,
                            on_open_entity,
                        }
                    },
                }
            }
            div { class: "entity-details-status-bar", role: "status",
                if let Some(err) = window.edit_error.clone() {
                    span { class: "entity-details-status-error", "{err}" }
                } else if window.is_saving {
                    span { "Saving" }
                }
            }
        }
    }
}

#[component]
fn EntityAttributesTab(
    attributes: Vec<EntityAttribute>,
    edit_attributes: Vec<EntityAttribute>,
    access_levels: Vec<AccessLevel>,
    auth_session: Option<AuthSession>,
    entity: Entity,
    is_edit: bool,
    is_saving: bool,
    open_access_level_menu_id: Option<String>,
    open_value_type_menu_id: Option<String>,
    revealed_attribute_ids: Vec<String>,
    dragged_attribute_id: Option<String>,
    default_access_level_id: u32,
    win_id: String,
    windows: Signal<Vec<EntityDetailsWindow>>,
) -> Element {
    rsx! {
        div { class: "entity-template-tab-content entity-attributes-tabpanel", role: "tabpanel",
            table { class: "data-table entity-template-modal-table entity-template-attributes-table entity-attributes-table",
                colgroup {
                    col { class: "entity-attribute-name-column" }
                    col { class: "entity-attribute-value-column" }
                    col { class: "entity-attribute-value-type-column" }
                    col { class: "entity-attribute-access-level-column" }
                    if is_edit {
                        col { class: "entity-attribute-action-column" }
                    }
                }
                thead {
                    tr {
                        th { "name" }
                        th { "value" }
                        th { "value type" }
                        th { "access level" }
                        if is_edit {
                            th { class: "data-table-action-heading",
                                span { class: "include-attribute-action entity-attribute-header-action",
                                    button {
                                        class: "section-action-button",
                                        "data-tooltip": "Add attribute",
                                        aria_label: "Add attribute",
                                        disabled: is_saving,
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: {
                                            let wid = win_id.clone();
                                            move |_| add_edit_entity_attribute(
                                                windows,
                                                wid.clone(),
                                                default_access_level_id,
                                            )
                                        },
                                        Plus { class: "app-icon", size: 16 }
                                    }
                                }
                            }
                        }
                    }
                }
                tbody {
                    if attributes.is_empty() {
                        tr {
                            td { class: "data-table-empty-cell", colspan: if is_edit { "5" } else { "4" },
                                span { "No attributes" }
                            }
                        }
                    } else {
                        for attr in attributes {
                            EntityAttributeRow {
                                key: "{attr.id}",
                                attr: attr.clone(),
                                edit_attrs: edit_attributes.clone(),
                                access_levels: access_levels.clone(),
                                auth_session: auth_session.clone(),
                                entity: entity.clone(),
                                is_edit,
                                is_saving,
                                open_access_level_menu_id: open_access_level_menu_id.clone(),
                                open_value_type_menu_id: open_value_type_menu_id.clone(),
                                is_revealed: revealed_attribute_ids.contains(&attr.id),
                                dragged_attribute_id: dragged_attribute_id.clone(),
                                win_id: win_id.clone(),
                                windows,
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn EntityAttributeRow(
    attr: EntityAttribute,
    edit_attrs: Vec<EntityAttribute>,
    access_levels: Vec<AccessLevel>,
    auth_session: Option<AuthSession>,
    entity: Entity,
    is_edit: bool,
    is_saving: bool,
    open_access_level_menu_id: Option<String>,
    open_value_type_menu_id: Option<String>,
    is_revealed: bool,
    dragged_attribute_id: Option<String>,
    win_id: String,
    windows: Signal<Vec<EntityDetailsWindow>>,
) -> Element {
    let current_edit_attribute = edit_attrs
        .iter()
        .find(|a| a.id == attr.id)
        .cloned()
        .unwrap_or_else(|| attr.clone());
    let access_level_name = access_levels
        .iter()
        .find(|al| al.id == current_edit_attribute.access_level_id)
        .map(|al| al.name.clone())
        .unwrap_or_default();
    let access_level_options = access_levels
        .iter()
        .map(|access_level| SingleSelectOption {
            label: access_level.name.clone(),
            value: access_level.id.to_string(),
        })
        .collect::<Vec<_>>();
    let value_type_options = VALUE_TYPES
        .iter()
        .map(|value_type| SingleSelectOption {
            label: value_type.to_string(),
            value: value_type.to_string(),
        })
        .collect::<Vec<_>>();

    let attr_id = attr.id.clone();
    let attr_id_value_type = attr.id.clone();
    let attr_id_value_type_select = attr.id.clone();
    let attr_id_access_level = attr.id.clone();
    let attr_id_access_level_select = attr.id.clone();
    let attr_id_name = attr.id.clone();
    let attr_id_drag = attr.id.clone();
    let attr_id_reorder = attr.id.clone();
    let attr_id_remove = attr.id.clone();
    let current_edit_value = current_edit_attribute.value.clone();
    let should_mask = !is_public_access_level(&access_levels, attr.access_level_id);
    let can_use_restricted_actions = should_mask
        && can_access_attribute_value(auth_session.as_ref(), &entity, &attr, &access_levels);
    let visible_value = entity_attribute_visible_value(
        &attr,
        &access_levels,
        is_revealed,
        can_use_restricted_actions,
    );
    let value_class = if should_mask {
        "entity-attribute-value-view entity-attribute-value-view-sensitive"
    } else {
        "entity-attribute-value-view"
    };
    let attr_id_toggle = attr.id.clone();
    let attr_name = if attr.name.trim().is_empty() {
        "attribute".to_string()
    } else {
        attr.name.clone()
    };
    let attr_value_copy = attr.value.clone();

    let is_dragging = dragged_attribute_id.as_deref() == Some(attr.id.as_str());
    let row_class = if is_dragging {
        "entity-attribute-edit-row is-dragging"
    } else {
        "entity-attribute-edit-row"
    };

    rsx! {
        tr {
            class: if is_edit { row_class } else { "" },
            "data-entity-attribute-id": "{attr.id}",
            onpointerover: {
                let wid = win_id.clone();
                let target_id = attr_id_reorder.clone();
                move |_| {
                    if is_edit {
                        reorder_dragged_edit_entity_attribute(windows, wid.clone(), target_id.clone());
                    }
                }
            },
            td {
                if is_edit {
                    input {
                        r#type: "text",
                        value: "{current_edit_attribute.name}",
                        disabled: is_saving,
                        placeholder: "name",
                        onpointerdown: move |event| event.stop_propagation(),
                        oninput: {
                            let aid = attr_id_name.clone();
                            let wid = win_id.clone();
                            move |event: Event<FormData>| {
                                let new_val = event.value();
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                    if let Some(ea) = w.edit_attributes.iter_mut().find(|a| a.id == aid) {
                                        ea.name = new_val;
                                    }
                                }
                            }
                        },
                    }
                } else {
                    "{attr.name}"
                }
            }
            td {
                if is_edit {
                    input {
                        r#type: if current_edit_attribute.value_type == "number" { "number" } else { "text" },
                        value: "{current_edit_value}",
                        disabled: is_saving,
                        onpointerdown: move |event| event.stop_propagation(),
                        oninput: {
                            let aid = attr_id.clone();
                            let wid = win_id.clone();
                            move |event: Event<FormData>| {
                                let new_val = event.value();
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                    if let Some(ea) = w.edit_attributes.iter_mut().find(|a| a.id == aid) {
                                        ea.value = new_val;
                                    }
                                }
                            }
                        },
                    }
                } else {
                    span { class: "{value_class}",
                        span { class: "entity-attribute-value-text", "{visible_value}" }
                        if can_use_restricted_actions {
                            span { class: "entity-attribute-value-actions",
                                button {
                                    class: "icon-only-button entity-attribute-value-action",
                                    "data-tooltip": if is_revealed { "Hide" } else { "Show" },
                                    aria_label: if is_revealed {
                                        "Hide {attr_name} value"
                                    } else {
                                        "Show {attr_name} value"
                                    },
                                    r#type: "button",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    onclick: {
                                        let wid = win_id.clone();
                                        let aid = attr_id_toggle.clone();
                                        move |_| {
                                            if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                                if w.revealed_attribute_ids.contains(&aid) {
                                                    w.revealed_attribute_ids.retain(|id| id != &aid);
                                                } else {
                                                    w.revealed_attribute_ids.push(aid.clone());
                                                }
                                            }
                                        }
                                    },
                                    if is_revealed {
                                        EyeOff { class: "app-icon", size: 14 }
                                    } else {
                                        Eye { class: "app-icon", size: 14 }
                                    }
                                }
                                button {
                                    class: "icon-only-button entity-attribute-value-action",
                                    "data-tooltip": "Copy",
                                    aria_label: "Copy {attr_name} value",
                                    r#type: "button",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    onclick: move |_| copy_text_to_clipboard(attr_value_copy.clone()),
                                    Clipboard { class: "app-icon", size: 14 }
                                }
                            }
                        }
                    }
                }
            }
            td {
                if is_edit {
                    span {
                        class: "entity-template-value-type-wrap",
                        onpointerdown: move |event| event.stop_propagation(),
                        SingleSelectPicker {
                            disabled: is_saving,
                            empty_text: "type",
                            is_open: open_value_type_menu_id.as_deref() == Some(&attr.id),
                            options: value_type_options,
                            selected_value: current_edit_attribute.value_type.clone(),
                            summary: current_edit_attribute.value_type.clone(),
                            on_toggle_open: {
                                let aid = attr_id_value_type.clone();
                                let wid = win_id.clone();
                                move |_| {
                                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                        w.edit_open_value_type_menu_id =
                                            if w.edit_open_value_type_menu_id.as_deref() == Some(&aid) {
                                                None
                                            } else {
                                                Some(aid.clone())
                                            };
                                        w.edit_open_access_level_menu_id = None;
                                    }
                                }
                            },
                            on_select_item: {
                                let aid = attr_id_value_type_select.clone();
                                let wid = win_id.clone();
                                move |value_type: String| {
                                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                        if let Some(a) = w.edit_attributes.iter_mut().find(|a| a.id == aid) {
                                            a.value_type = value_type;
                                            a.value.clear();
                                        }
                                        w.edit_open_value_type_menu_id = None;
                                    }
                                }
                            },
                        }
                    }
                } else {
                    span { class: "data-table-muted-cell", "{attr.value_type}" }
                }
            }
            td {
                if is_edit {
                    span {
                        class: "entity-template-access-level-wrap",
                        onpointerdown: move |event| event.stop_propagation(),
                        SingleSelectPicker {
                            disabled: is_saving,
                            empty_text: "access",
                            is_open: open_access_level_menu_id.as_deref() == Some(&attr.id),
                            options: access_level_options,
                            selected_value: current_edit_attribute.access_level_id.to_string(),
                            summary: access_level_name,
                            on_toggle_open: {
                                let aid = attr_id_access_level.clone();
                                let wid = win_id.clone();
                                move |_| {
                                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                        w.edit_open_access_level_menu_id =
                                            if w.edit_open_access_level_menu_id.as_deref() == Some(&aid) {
                                                None
                                            } else {
                                                Some(aid.clone())
                                            };
                                        w.edit_open_value_type_menu_id = None;
                                    }
                                }
                            },
                            on_select_item: {
                                let aid = attr_id_access_level_select.clone();
                                let wid = win_id.clone();
                                move |access_level_id: String| {
                                    if let Ok(access_level_id) = access_level_id.parse::<u32>() {
                                        if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                            if let Some(a) = w.edit_attributes.iter_mut().find(|a| a.id == aid) {
                                                a.access_level_id = access_level_id;
                                            }
                                            w.edit_open_access_level_menu_id = None;
                                        }
                                    }
                                }
                            },
                        }
                    }
                } else {
                    span { class: "data-table-muted-cell", "{access_level_name}" }
                }
            }
            if is_edit {
                td { class: "entity-template-attribute-actions",
                    button {
                        class: "icon-only-button entity-template-row-action-button",
                        "data-tooltip": "Remove",
                        aria_label: "Remove {attr_name}",
                        disabled: is_saving || edit_attrs.len() <= 1,
                        r#type: "button",
                        onpointerdown: move |event| event.stop_propagation(),
                        onclick: {
                            let wid = win_id.clone();
                            let aid = attr_id_remove.clone();
                            move |_| remove_edit_entity_attribute(windows, wid.clone(), aid.clone())
                        },
                        Trash2 { class: "app-icon", size: 14 }
                    }
                    button {
                        class: "icon-only-button entity-template-drag-handle",
                        "data-tooltip": "Drag up or down\nto reorder",
                        aria_label: "Drag {attr_name}",
                        disabled: is_saving,
                        r#type: "button",
                        onpointerdown: {
                            let wid = win_id.clone();
                            let aid = attr_id_drag.clone();
                            move |event| {
                                event.stop_propagation();
                                if let Some(w) = windows.write().iter_mut().find(|w| w.id == wid) {
                                    w.dragged_edit_attribute_id = Some(aid.clone());
                                    w.edit_open_access_level_menu_id = None;
                                    w.edit_open_value_type_menu_id = None;
                                }
                            }
                        },
                        GripVertical { class: "app-icon", size: 14 }
                    }
                }
            }
        }
    }
}

fn default_entity_attribute_access_level_id(access_levels: &[AccessLevel]) -> u32 {
    access_levels
        .iter()
        .find(|access_level| access_level.name.eq_ignore_ascii_case("public"))
        .or_else(|| access_levels.first())
        .map(|access_level| access_level.id)
        .unwrap_or(1)
}

fn new_entity_attribute_id() -> String {
    let mut bytes = [0_u8; 16];

    if !fill_random_bytes(&mut bytes) {
        let counter = ENTITY_ATTRIBUTE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        bytes[0..8].copy_from_slice(&counter.to_be_bytes());
        bytes[8..16].copy_from_slice(
            &counter
                .wrapping_mul(0x9e37_79b9_7f4a_7c15)
                .to_be_bytes(),
        );
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
    )
}

#[cfg(target_arch = "wasm32")]
fn fill_random_bytes(bytes: &mut [u8]) -> bool {
    web_sys::window()
        .and_then(|window| window.crypto().ok())
        .and_then(|crypto| crypto.get_random_values_with_u8_array(bytes).ok())
        .is_some()
}

#[cfg(not(target_arch = "wasm32"))]
fn fill_random_bytes(_bytes: &mut [u8]) -> bool {
    false
}

fn renumber_entity_attributes(attributes: &mut [EntityAttribute]) {
    for (index, attribute) in attributes.iter_mut().enumerate() {
        attribute.listing_index = index as i32;
    }
}

fn add_edit_entity_attribute(
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    win_id: String,
    default_access_level_id: u32,
) {
    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
        let idx = w.edit_attributes.len() as i32;
        let id = new_entity_attribute_id();

        w.edit_attributes.push(EntityAttribute {
            access_level_id: default_access_level_id,
            description: String::new(),
            id: id.clone(),
            is_required: false,
            listing_index: idx,
            name: String::new(),
            value: String::new(),
            value_type: "text".to_string(),
        });

        if w.edit_listing_attribute_id.is_empty() {
            w.edit_listing_attribute_id = id;
        }

        w.active_tab = EntityTab::Attributes;
        w.edit_error = None;
        w.edit_open_access_level_menu_id = None;
        w.edit_open_value_type_menu_id = None;
        w.dragged_edit_attribute_id = None;
    }
}

fn remove_edit_entity_attribute(
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    win_id: String,
    attribute_id: String,
) {
    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
        if w.edit_attributes.len() <= 1 {
            return;
        }

        w.edit_attributes
            .retain(|attribute| attribute.id != attribute_id);
        renumber_entity_attributes(&mut w.edit_attributes);

        if w.edit_listing_attribute_id == attribute_id || w.edit_listing_attribute_id.is_empty() {
            w.edit_listing_attribute_id = w
                .edit_attributes
                .first()
                .map(|attribute| attribute.id.clone())
                .unwrap_or_default();
        }

        w.edit_error = None;
        w.edit_open_access_level_menu_id = None;
        w.edit_open_value_type_menu_id = None;
        w.dragged_edit_attribute_id = None;
    }
}

fn reorder_dragged_edit_entity_attribute(
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    win_id: String,
    target_attribute_id: String,
) {
    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
        let Some(dragged_attribute_id) = w.dragged_edit_attribute_id.clone() else {
            return;
        };

        if dragged_attribute_id == target_attribute_id {
            return;
        }

        let Some(dragged_index) = w
            .edit_attributes
            .iter()
            .position(|attribute| attribute.id == dragged_attribute_id)
        else {
            return;
        };
        let Some(target_index) = w
            .edit_attributes
            .iter()
            .position(|attribute| attribute.id == target_attribute_id)
        else {
            return;
        };

        let dragged_attribute = w.edit_attributes.remove(dragged_index);
        let insert_index = target_index.min(w.edit_attributes.len());
        w.edit_attributes.insert(insert_index, dragged_attribute);
        renumber_entity_attributes(&mut w.edit_attributes);
    }
}

#[component]
fn EntityLinksTab(links: Vec<EntityLink>, on_open_entity: EventHandler<String>) -> Element {
    rsx! {
        div { class: "entity-template-tab-content entity-links-tabpanel", role: "tabpanel",
            table { class: "data-table entity-template-modal-table entity-template-links-table entity-template-view-links-table",
                thead {
                    tr {
                        th { "name" }
                        th { "target" }
                    }
                }
                tbody {
                    if links.is_empty() {
                        tr {
                            td { class: "data-table-empty-cell", colspan: "2",
                                span { "No links" }
                            }
                        }
                    } else {
                        for link in links {
                            tr { key: "{link.id}",
                                td { "{link.name}" }
                                td {
                                    if let Some(target_id) = link.target_entity_id.clone() {
                                        button {
                                            class: "entity-link-target-button",
                                            "data-tooltip": "Open target entity",
                                            onclick: {
                                                let tid = target_id.clone();
                                                move |_| on_open_entity.call(tid.clone())
                                            },
                                            "{link.target_entity_label.clone().unwrap_or_else(|| target_id.clone())}"
                                        }
                                    } else {
                                        span { class: "data-table-muted-cell", "—" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn EntityInlinksTab(
    inlinks: Vec<EntityIncomingLink>,
    on_open_entity: EventHandler<String>,
) -> Element {
    rsx! {
        div { class: "entity-template-tab-content entity-inlinks-tabpanel", role: "tabpanel",
            table { class: "data-table entity-template-modal-table entity-template-links-table entity-template-view-inlinks-table",
                thead {
                    tr {
                        th { "name" }
                        th { "source" }
                    }
                }
                tbody {
                    if inlinks.is_empty() {
                        tr {
                            td { class: "data-table-empty-cell", colspan: "2",
                                span { "No incoming links" }
                            }
                        }
                    } else {
                        for link in inlinks {
                            tr { key: "{link.id}",
                                td { "{link.name}" }
                                td {
                                    button {
                                        class: "entity-link-target-button",
                                        "data-tooltip": "Open source entity",
                                        onclick: {
                                            let sid = link.source_entity_id.clone();
                                            move |_| on_open_entity.call(sid.clone())
                                        },
                                        "{link.source_entity_label}"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Create entity modal
// ---------------------------------------------------------------------------

#[derive(Clone, PartialEq)]
pub struct CreateEntityState {
    pub source: CreateEntitySource,
    pub entity_template_id: String,
    pub attributes: Vec<EntityAttribute>,
    pub listing_attribute_id: String,
    pub error: Option<String>,
    pub is_saving: bool,
    pub active_tab: EntityTab,
    pub open_access_level_menu_id: Option<String>,
    pub open_value_type_menu_id: Option<String>,
    pub is_listing_attribute_menu_open: bool,
}

#[derive(Clone, PartialEq)]
pub enum CreateEntitySource {
    Template,
    Scratch,
}

#[component]
pub fn CreateEntityModal(
    state: CreateEntityState,
    create_state: Signal<Option<CreateEntityState>>,
    entity_templates: Vec<EntityTemplate>,
    access_levels: Vec<AccessLevel>,
    session_key: String,
    owner_user_id: String,
    entities: Signal<Vec<Entity>>,
    position: crate::types::ModalPosition,
    size: crate::types::ModalSize,
    z_index: u32,
) -> Element {
    let is_saving = state.is_saving;
    let active_tab = state.active_tab.clone();
    let source = state.source.clone();
    let error = state.error.clone();
    let listing_attribute_id = state.listing_attribute_id.clone();
    let selected_listing_value = state
        .attributes
        .iter()
        .find(|attribute| attribute.id == listing_attribute_id)
        .map(|attribute| attribute.value.clone())
        .unwrap_or_default();
    let listing_attribute_options = state
        .attributes
        .iter()
        .map(|attribute| SingleSelectOption {
            label: attribute.name.clone(),
            value: attribute.id.clone(),
        })
        .collect::<Vec<_>>();
    let listing_attribute_summary = state
        .attributes
        .iter()
        .find(|attribute| attribute.id == listing_attribute_id)
        .map(|attribute| attribute.name.clone())
        .unwrap_or_default();
    let default_access_level_id = access_levels
        .first()
        .map(|access_level| access_level.id)
        .unwrap_or(4);

    let can_save = !state.attributes.is_empty()
        && !state.listing_attribute_id.is_empty()
        && state.attributes.iter().all(|a| !a.name.trim().is_empty());

    let title = "Entity :: New";
    let mut modal_position = use_signal(move || position);
    let mut modal_size = use_signal(move || size);
    let mut drag_offset = use_signal(|| None::<(f64, f64)>);
    let mut resize_start = use_signal(|| None::<(f64, f64, f64, f64)>);
    let current_position = modal_position();
    let current_size = modal_size();
    let is_dragging = drag_offset().is_some();
    let is_resizing = resize_start().is_some();

    rsx! {
        div {
            class: if is_dragging {
                "draggable-modal-layer is-dragging"
            } else if is_resizing {
                "draggable-modal-layer is-resizing"
            } else {
                "draggable-modal-layer"
            },
            style: "z-index: {z_index};",
            onpointermove: move |event| {
                let point = event.data().client_coordinates();

                if let Some((offset_x, offset_y)) = drag_offset() {
                    modal_position.set(crate::types::ModalPosition {
                        x: (point.x - offset_x).max(16.0),
                        y: (point.y - offset_y).max(64.0),
                    });
                }

                if let Some((start_width, start_height, start_x, start_y)) = resize_start() {
                    modal_size.set(crate::types::ModalSize {
                        height: (start_height + point.y - start_y).max(200.0),
                        width: (start_width + point.x - start_x).max(400.0),
                    });
                }
            },
            onpointerup: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
            },
            onpointercancel: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
            },
            div {
                class: if is_dragging {
                    "draggable-modal is-dragging"
                } else if is_resizing {
                    "draggable-modal is-resizing"
                } else {
                    "draggable-modal"
                },
                style: "left: {current_position.x}px; top: {current_position.y}px; width: {current_size.width}px; height: {current_size.height}px; min-width: 400px; min-height: 200px;",
                div {
                class: "draggable-modal-body",
                onpointerdown: move |event| {
                    event.stop_propagation();
                    let point = event.data().client_coordinates();
                    let position = modal_position();
                    drag_offset.set(Some((point.x - position.x, point.y - position.y)));
                    resize_start.set(None);
                },
                div { class: "draggable-modal-header",
                    h2 { "{title}" }
                    div {
                        class: "draggable-modal-titlebar-actions",
                        onclick: move |event| event.stop_propagation(),
                        onpointerdown: move |event| event.stop_propagation(),
                        button {
                            class: "draggable-modal-titlebar-button",
                            "data-tooltip": if can_save { "Save" } else { "Add at least one attribute" },
                            aria_label: "Save entity",
                            disabled: !can_save || is_saving,
                            onclick: move |_| {
                                if can_save {
                                    save_new_entity(create_state, session_key.clone(), owner_user_id.clone(), entities);
                                }
                            },
                            Save { class: "app-icon", size: 15 }
                        }
                        button {
                            class: "draggable-modal-titlebar-button draggable-modal-close",
                            "data-tooltip": "Close",
                            aria_label: "Close",
                            onclick: move |_| create_state.set(None),
                            X { class: "app-icon", size: 15 }
                        }
                    }
                }
                div { class: "draggable-modal-content",
                    div { class: "entity-template-edit-form entity-template-view-form access-level-details entity-template-create-form",
                        if let Some(err) = error {
                            p { class: "draggable-modal-error", "{err}" }
                        }
                        div { class: "entity-view-summary entity-create-summary",
                            table { class: "data-table entity-create-summary-table",
                                thead {
                                    tr {
                                        th { "listing attribute name" }
                                        th { "value" }
                                    }
                                }
                                tbody {
                                    tr {
                                        td {
                                            span {
                                                class: "attribute-template-select-wrap entity-create-summary-select-wrap",
                                                onpointerdown: move |event| event.stop_propagation(),
                                                SingleSelectPicker {
                                                    disabled: state.attributes.is_empty() || is_saving,
                                                    empty_text: "Select attribute",
                                                    is_open: state.is_listing_attribute_menu_open,
                                                    options: listing_attribute_options,
                                                    selected_value: listing_attribute_id.clone(),
                                                    summary: listing_attribute_summary,
                                                    on_toggle_open: move |_| {
                                                        if let Some(s) = create_state.write().as_mut() {
                                                            s.is_listing_attribute_menu_open =
                                                                !s.is_listing_attribute_menu_open;
                                                            s.open_access_level_menu_id = None;
                                                            s.open_value_type_menu_id = None;
                                                        }
                                                    },
                                                    on_select_item: move |attribute_id: String| {
                                                        if let Some(s) = create_state.write().as_mut() {
                                                            s.listing_attribute_id = attribute_id;
                                                            s.is_listing_attribute_menu_open = false;
                                                        }
                                                    },
                                                }
                                            }
                                        }
                                        td {
                                            span { class: "entity-create-summary-value", "{selected_listing_value}" }
                                        }
                                    }
                                }
                            }
                        }
                        div { class: "entity-template-tabs",
                            div { class: "entity-template-tab-row",
                                div {
                                    class: "entity-template-tab-list",
                                    role: "tablist",
                                    button {
                                        class: "entity-template-tab",
                                        aria_selected: "{active_tab == EntityTab::Attributes}",
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: move |_| {
                                            if let Some(s) = create_state.write().as_mut() {
                                                s.active_tab = EntityTab::Attributes;
                                            }
                                        },
                                        span { "Attributes" }
                                        span { class: "entity-template-tab-badge", "{state.attributes.len()}" }
                                    }
                                    button {
                                        class: "entity-template-tab",
                                        aria_selected: "{active_tab == EntityTab::Links}",
                                        "data-tooltip": "Outbound Links",
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: move |_| {
                                            if let Some(s) = create_state.write().as_mut() {
                                                s.active_tab = EntityTab::Links;
                                            }
                                        },
                                        span { "Outlinks" }
                                        span { class: "entity-template-tab-badge", "0" }
                                    }
                                }
                            }
                            div { class: "entity-template-tab-content",
                                if active_tab == EntityTab::Attributes {
                                    table { class: "data-table entity-template-modal-table entity-template-attributes-table entity-attributes-table",
                                        colgroup {
                                            col { class: "entity-attribute-name-column" }
                                            col { class: "entity-attribute-value-column" }
                                            col { class: "entity-attribute-value-type-column" }
                                            col { class: "entity-attribute-access-level-column" }
                                            col { class: "entity-attribute-action-column" }
                                        }
                                        thead {
                                            tr {
                                                th { "name" }
                                                th { "value" }
                                                th { "value type" }
                                                th { "access level" }
                                                th { class: "data-table-action-heading",
                                                    span { class: "include-attribute-action entity-attribute-header-action",
                                                        if source == CreateEntitySource::Scratch {
                                                            button {
                                                                class: "section-action-button",
                                                                "data-tooltip": "Include an attribute",
                                                                aria_label: "Add attribute",
                                                                onpointerdown: move |event| event.stop_propagation(),
                                                                onclick: move |_| add_create_entity_attribute(create_state, default_access_level_id),
                                                                Plus { class: "app-icon", size: 16 }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        tbody {
                                            if state.attributes.is_empty() {
                                                tr {
                                                    td { class: "data-table-empty-cell", colspan: "5",
                                                        span { "No attributes" }
                                                    }
                                                }
                                            } else {
                                                for (index, attr) in state.attributes.iter().enumerate() {
                                                    CreateEntityAttributeRow {
                                                        key: "{attr.id}",
                                                        attr: attr.clone(),
                                                        index,
                                                        access_levels: access_levels.clone(),
                                                        is_saving,
                                                        create_state,
                                                        is_scratch: source == CreateEntitySource::Scratch,
                                                        open_access_level_menu_id: state.open_access_level_menu_id.clone(),
                                                        open_value_type_menu_id: state.open_value_type_menu_id.clone(),
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    table { class: "data-table entity-template-modal-table entity-template-links-table entity-entity-links-table",
                                        thead {
                                            tr {
                                                th { "name" }
                                                th { "target" }
                                                th { class: "data-table-action-heading", "" }
                                            }
                                        }
                                        tbody {
                                            tr {
                                                td { class: "data-table-empty-cell", colspan: "3",
                                                    span { "No links" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            span {
                class: "draggable-modal-resize",
                "data-tooltip": "Resize",
                onpointerdown: move |event| {
                    event.stop_propagation();
                    let point = event.data().client_coordinates();
                    let size = modal_size();
                    resize_start.set(Some((size.width, size.height, point.x, point.y)));
                    drag_offset.set(None);
                },
                for _ in 0..6 { span {} }
            }
            }
        }
    }
}

#[component]
fn CreateEntityAttributeRow(
    attr: EntityAttribute,
    index: usize,
    access_levels: Vec<AccessLevel>,
    is_saving: bool,
    create_state: Signal<Option<CreateEntityState>>,
    is_scratch: bool,
    open_access_level_menu_id: Option<String>,
    open_value_type_menu_id: Option<String>,
) -> Element {
    let access_level_options = access_levels
        .iter()
        .map(|access_level| SingleSelectOption {
            label: access_level.name.clone(),
            value: access_level.id.to_string(),
        })
        .collect::<Vec<_>>();
    let access_level_summary = access_levels
        .iter()
        .find(|al| al.id == attr.access_level_id)
        .map(|al| al.name.clone())
        .unwrap_or_default();
    let value_type_options = VALUE_TYPES
        .iter()
        .map(|value_type| SingleSelectOption {
            label: value_type.to_string(),
            value: value_type.to_string(),
        })
        .collect::<Vec<_>>();
    let attr_id = attr.id.clone();
    let attr_id2 = attr.id.clone();
    let attr_id3 = attr.id.clone();
    let attr_id4 = attr.id.clone();
    let attr_id5 = attr.id.clone();
    let attr_id6 = attr.id.clone();

    rsx! {
        tr { key: "{attr.id}",
            td {
                if is_scratch {
                    input {
                        r#type: "text",
                        value: "{attr.name}",
                        disabled: is_saving,
                        placeholder: "name",
                        onpointerdown: move |event| event.stop_propagation(),
                        oninput: {
                            let aid = attr_id2.clone();
                            move |event: Event<FormData>| {
                                let val = event.value();
                                if let Some(s) = create_state.write().as_mut() {
                                    if let Some(a) = s.attributes.iter_mut().find(|a| a.id == aid) {
                                        a.name = val;
                                    }
                                }
                            }
                        },
                    }
                } else {
                    span { "{attr.name}" }
                }
            }
            td {
                input {
                    r#type: if attr.value_type == "number" { "number" } else { "text" },
                    value: "{attr.value}",
                    disabled: is_saving,
                    onpointerdown: move |event| event.stop_propagation(),
                    oninput: {
                        let aid = attr_id.clone();
                        move |event: Event<FormData>| {
                            let val = event.value();
                            if let Some(s) = create_state.write().as_mut() {
                                if let Some(a) = s.attributes.iter_mut().find(|a| a.id == aid) {
                                    a.value = val;
                                }
                            }
                        }
                    },
                }
            }
            td {
                span {
                    class: "entity-template-value-type-wrap",
                    onpointerdown: move |event| event.stop_propagation(),
                    SingleSelectPicker {
                        disabled: is_saving,
                        empty_text: "type",
                        is_open: open_value_type_menu_id.as_deref() == Some(&attr.id),
                        options: value_type_options,
                        selected_value: attr.value_type.clone(),
                        summary: attr.value_type.clone(),
                        on_toggle_open: {
                            let aid = attr_id3.clone();
                            move |_| {
                                if let Some(s) = create_state.write().as_mut() {
                                    s.open_value_type_menu_id =
                                        if s.open_value_type_menu_id.as_deref() == Some(&aid) {
                                            None
                                        } else {
                                            Some(aid.clone())
                                        };
                                    s.open_access_level_menu_id = None;
                                    s.is_listing_attribute_menu_open = false;
                                }
                            }
                        },
                        on_select_item: {
                            let aid = attr_id4.clone();
                            move |value_type: String| {
                                if let Some(s) = create_state.write().as_mut() {
                                    if let Some(a) = s.attributes.iter_mut().find(|a| a.id == aid) {
                                        a.value_type = value_type;
                                        a.value.clear();
                                    }
                                    s.open_value_type_menu_id = None;
                                }
                            }
                        },
                    }
                }
            }
            td {
                span {
                    class: "entity-template-access-level-wrap",
                    onpointerdown: move |event| event.stop_propagation(),
                    SingleSelectPicker {
                        disabled: is_saving,
                        empty_text: "access",
                        is_open: open_access_level_menu_id.as_deref() == Some(&attr.id),
                        options: access_level_options,
                        selected_value: attr.access_level_id.to_string(),
                        summary: access_level_summary,
                        on_toggle_open: {
                            let aid = attr_id5.clone();
                            move |_| {
                                if let Some(s) = create_state.write().as_mut() {
                                    s.open_access_level_menu_id =
                                        if s.open_access_level_menu_id.as_deref() == Some(&aid) {
                                            None
                                        } else {
                                            Some(aid.clone())
                                        };
                                    s.open_value_type_menu_id = None;
                                    s.is_listing_attribute_menu_open = false;
                                }
                            }
                        },
                        on_select_item: {
                            let aid = attr_id6.clone();
                            move |access_level_id: String| {
                                if let Ok(access_level_id) = access_level_id.parse::<u32>() {
                                    if let Some(s) = create_state.write().as_mut() {
                                        if let Some(a) = s.attributes.iter_mut().find(|a| a.id == aid) {
                                            a.access_level_id = access_level_id;
                                        }
                                        s.open_access_level_menu_id = None;
                                    }
                                }
                            }
                        },
                    }
                }
            }
            td { class: "entity-template-attribute-actions",
                if is_scratch {
                    button {
                        class: "icon-only-button entity-attribute-value-action",
                        "data-tooltip": "Remove",
                        aria_label: "Remove attribute",
                        disabled: is_saving,
                        onpointerdown: move |event| event.stop_propagation(),
                        onclick: {
                            let aid = attr.id.clone();
                            move |_| remove_create_entity_attribute(create_state, aid.clone())
                        },
                        Trash2 { class: "app-icon", size: 13 }
                    }
                }
            }
        }
    }
}

fn add_create_entity_attribute(
    mut create_state: Signal<Option<CreateEntityState>>,
    default_access_level_id: u32,
) {
    if let Some(s) = create_state.write().as_mut() {
        let idx = s.attributes.len() as i32;
        let id = format!("new-{idx}");
        s.attributes.push(EntityAttribute {
            access_level_id: default_access_level_id,
            description: String::new(),
            id: id.clone(),
            is_required: false,
            listing_index: idx,
            name: String::new(),
            value: String::new(),
            value_type: "text".to_string(),
        });
        if s.listing_attribute_id.is_empty() {
            s.listing_attribute_id = id;
        }
        s.active_tab = EntityTab::Attributes;
        s.open_access_level_menu_id = None;
        s.open_value_type_menu_id = None;
        s.is_listing_attribute_menu_open = false;
    }
}

fn remove_create_entity_attribute(
    mut create_state: Signal<Option<CreateEntityState>>,
    attribute_id: String,
) {
    if let Some(s) = create_state.write().as_mut() {
        s.attributes
            .retain(|attribute| attribute.id != attribute_id);
        for (index, attribute) in s.attributes.iter_mut().enumerate() {
            attribute.listing_index = index as i32;
        }
        if s.listing_attribute_id == attribute_id {
            s.listing_attribute_id = s
                .attributes
                .first()
                .map(|attribute| attribute.id.clone())
                .unwrap_or_default();
        }
        s.open_access_level_menu_id = None;
        s.open_value_type_menu_id = None;
        s.is_listing_attribute_menu_open = false;
    }
}

fn save_new_entity(
    mut create_state: Signal<Option<CreateEntityState>>,
    session_key: String,
    owner_user_id: String,
    mut entities: Signal<Vec<Entity>>,
) {
    if let Some(state) = create_state.write().as_mut() {
        state.is_saving = true;
        state.error = None;
    }

    let attributes = create_state
        .read()
        .as_ref()
        .map(|s| s.attributes.clone())
        .unwrap_or_default();

    let entity_template_id = create_state
        .read()
        .as_ref()
        .map(|s| s.entity_template_id.clone())
        .unwrap_or_default();
    let listing_attribute_id = create_state
        .read()
        .as_ref()
        .map(|s| s.listing_attribute_id.clone())
        .unwrap_or_default();

    spawn(async move {
        let body = build_entity_create_body(
            &attributes,
            &owner_user_id,
            &entity_template_id,
            &listing_attribute_id,
        );
        let result = Request::post(&format!("{API_BASE_URL}/entities"))
            .header("Authorization", &format!("Bearer {session_key}"))
            .header("Content-Type", "application/json")
            .body(body)
            .unwrap()
            .send()
            .await;

        match result {
            Ok(response) if response.ok() => {
                match response.json::<crate::types::EntityResponse>().await {
                    Ok(payload) => {
                        entities.write().push(payload.data);
                        create_state.set(None);
                    }
                    Err(_) => {
                        if let Some(s) = create_state.write().as_mut() {
                            s.is_saving = false;
                            s.error = Some("Unable to create entity".to_string());
                        }
                    }
                }
            }
            Ok(response) => {
                let message = read_response_error(response, "Unable to create entity").await;
                if let Some(s) = create_state.write().as_mut() {
                    s.is_saving = false;
                    s.error = Some(message);
                }
            }
            Err(_) => {
                if let Some(s) = create_state.write().as_mut() {
                    s.is_saving = false;
                    s.error = Some("Unable to create entity".to_string());
                }
            }
        }
    });
}

fn build_entity_create_body(
    attributes: &[EntityAttribute],
    owner_user_id: &str,
    entity_template_id: &str,
    listing_attribute_id: &str,
) -> String {
    let attrs_json = attributes
        .iter()
        .enumerate()
        .map(|(i, attr)| {
            format!(
                "{{\"name\":{},\"value\":{},\"valueType\":{},\"accessLevelId\":{},\"isRequired\":{},\"description\":{},\"listingIndex\":{}}}",
                json_string(attr.name.trim()),
                json_string(&attr.value),
                json_string(&attr.value_type),
                attr.access_level_id,
                attr.is_required,
                json_string(&attr.description),
                i,
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    let template_part = if entity_template_id.is_empty() {
        String::new()
    } else {
        format!(",\"entityTemplateId\":{}", json_string(entity_template_id))
    };

    let owner_part = if owner_user_id.is_empty() {
        String::new()
    } else {
        format!(",\"ownerUserId\":{}", json_string(owner_user_id))
    };

    let listing_part = if listing_attribute_id.is_empty() {
        String::new()
    } else {
        format!(
            ",\"listingAttributeId\":{}",
            json_string(listing_attribute_id)
        )
    };

    format!("{{\"attributes\":[{attrs_json}]{template_part}{owner_part}{listing_part}}}")
}
