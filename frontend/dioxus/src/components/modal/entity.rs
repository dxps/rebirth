use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{Info, Pencil, Plus, Save, Trash2, User, X};

use crate::types::{
    AccessLevel, AccessLevelsResponse, Entity, EntityAttribute, EntityIncomingLink, EntityLink,
    EntityResponse, EntityTemplate, EntityTemplatesResponse, EntitiesResponse, SavedView,
    User as RebirthUser, UsersResponse, API_BASE_URL,
};

use super::{json_string, read_response_error, DeleteConfirmPopover};

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
}

// ---------------------------------------------------------------------------
// Helper: find listing value for an entity
// ---------------------------------------------------------------------------
fn entity_listing_value(entity: &Entity) -> String {
    entity
        .attributes
        .iter()
        .find(|attr| attr.id == entity.listing_attribute_id)
        .map(|attr| attr.value.clone())
        .unwrap_or_default()
}

fn entity_listing_name(entity: &Entity) -> String {
    entity
        .attributes
        .iter()
        .find(|attr| attr.id == entity.listing_attribute_id)
        .map(|attr| attr.name.clone())
        .unwrap_or_default()
}

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

pub async fn fetch_entity_templates_list(
    session_key: &str,
) -> Result<Vec<EntityTemplate>, String> {
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
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~'
            | b'*' | b'\'' | b'(' | b')' => encoded.push(byte as char),
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
        if let Some(storage) =
            web_sys::window().and_then(|w| w.local_storage().ok().flatten())
        {
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

    let mut raise_window = {
        let win_id = win_id.clone();
        move || {
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
        }
    };

    let position = window.position;
    let size = window.size;
    let z_index = window.z_index;

    rsx! {
        div {
            key: "{window.id}",
            class: "draggable-modal",
            style: "left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; min-width: 400px; min-height: 200px; z-index: {z_index};",
            onpointerdown: move |_| raise_window(),
            div {
                class: "draggable-modal-body",
                onclick: move |_| {
                    // close popovers
                    if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_click) {
                        w.is_info_open = false;
                        w.is_delete_confirm_open = false;
                        w.is_owner_open = false;
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
                            // store drag origin in a signal via a side-channel — we use the
                            // draggable-modal-layer drag mechanism; for self-contained windows
                            // we reuse a simple approach: store offset in z_index scratch space.
                            // Instead, we delegate to the parent layer's pointermove.
                            let _ = point;
                        }
                    }
                },
                div { class: "draggable-modal-header",
                    h2 { "Entity" }
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
                    let win_id = win_id_resize.clone();
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
                        let _ = point;
                    }
                },
                for _ in 0..6 {
                    span {}
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
                        // restore edit_attributes from entity
                        if let Some(entity) = &w.entity {
                            w.edit_attributes = entity.attributes.clone();
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
    let entity_id_str = window.entity.as_ref().map(|e| e.id.clone()).unwrap_or_default();

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
                    w.is_info_open = false;
                    w.is_delete_confirm_open = false;
                    if let Some(entity) = &w.entity {
                        w.edit_attributes = entity.attributes.clone();
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

    // Collect attributes
    let attributes = windows
        .read()
        .iter()
        .find(|w| w.id == win_id)
        .map(|w| w.edit_attributes.clone())
        .unwrap_or_default();

    spawn(async move {
        let body = build_entity_update_body(&attributes);
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

fn build_entity_update_body(attributes: &[EntityAttribute]) -> String {
    let attrs_json = attributes
        .iter()
        .map(|attr| {
            format!(
                "{{\"id\":{},\"value\":{}}}",
                json_string(&attr.id),
                json_string(&attr.value),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!("{{\"attributes\":[{attrs_json}]}}")
}

// ---------------------------------------------------------------------------
// Entity details content (tabs)
// ---------------------------------------------------------------------------

#[component]
fn EntityDetailsContent(
    window: EntityDetailsWindow,
    windows: Signal<Vec<EntityDetailsWindow>>,
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
    let win_id = window.id.clone();
    let win_id2 = window.id.clone();
    let win_id3 = window.id.clone();

    let mut sorted_attrs = entity.attributes.clone();
    sorted_attrs.sort_by_key(|a| a.listing_index);
    let mut sorted_links = entity.links.clone();
    sorted_links.sort_by_key(|l| l.listing_index);
    let incoming_links = entity.incoming_links.clone().unwrap_or_default();
    let mut sorted_inlinks = incoming_links;
    sorted_inlinks.sort_by_key(|l| l.listing_index);

    let attr_count = sorted_attrs.len();
    let link_count = sorted_links.len();
    let inlink_count = sorted_inlinks.len();

    let is_edit = window.is_edit_mode;

    rsx! {
        div { class: "entity-template-edit-form entity-template-view-form access-level-details",
            if let Some(err) = window.edit_error.clone() {
                p { class: "draggable-modal-error", "{err}" }
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
                            "Links"
                            span { class: "entity-template-tab-badge", "{link_count}" }
                        }
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
                match active_tab {
                    EntityTab::Attributes => rsx! {
                        EntityAttributesTab {
                            attributes: sorted_attrs,
                            edit_attributes: window.edit_attributes.clone(),
                            access_levels,
                            is_edit,
                            is_saving: window.is_saving,
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
        }
    }
}

#[component]
fn EntityAttributesTab(
    attributes: Vec<EntityAttribute>,
    edit_attributes: Vec<EntityAttribute>,
    access_levels: Vec<AccessLevel>,
    is_edit: bool,
    is_saving: bool,
    win_id: String,
    windows: Signal<Vec<EntityDetailsWindow>>,
) -> Element {
    rsx! {
        div { class: "entity-template-tab-content",
            table { class: "data-table",
                thead {
                    tr {
                        th { "name" }
                        th { "value" }
                        th { "access level" }
                    }
                }
                tbody {
                    if attributes.is_empty() {
                        tr {
                            td { class: "data-table-empty-cell", colspan: "3",
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
                                is_edit,
                                is_saving,
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
    is_edit: bool,
    is_saving: bool,
    win_id: String,
    windows: Signal<Vec<EntityDetailsWindow>>,
) -> Element {
    let access_level_name = access_levels
        .iter()
        .find(|al| al.id == attr.access_level_id)
        .map(|al| al.name.clone())
        .unwrap_or_default();

    let attr_id = attr.id.clone();
    let current_edit_value = edit_attrs
        .iter()
        .find(|a| a.id == attr.id)
        .map(|a| a.value.clone())
        .unwrap_or_else(|| attr.value.clone());

    rsx! {
        tr {
            td { "{attr.name}" }
            td {
                if is_edit {
                    input {
                        r#type: "text",
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
                    span { class: "empty-value-space", "{attr.value}" }
                }
            }
            td { class: "data-table-muted-cell", "{access_level_name}" }
        }
    }
}

#[component]
fn EntityLinksTab(
    links: Vec<EntityLink>,
    on_open_entity: EventHandler<String>,
) -> Element {
    rsx! {
        div { class: "entity-template-tab-content",
            table { class: "data-table",
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
        div { class: "entity-template-tab-content",
            table { class: "data-table",
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
    pub error: Option<String>,
    pub is_saving: bool,
    pub active_tab: EntityTab,
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

    let can_save = !state.attributes.is_empty()
        && state
            .attributes
            .iter()
            .all(|a| !a.name.trim().is_empty());

    let title = "Entity :: New";

    rsx! {
        div {
            class: "draggable-modal",
            style: "left: {position.x}px; top: {position.y}px; width: {size.width}px; height: {size.height}px; min-width: 400px; min-height: 200px; z-index: {z_index};",
            div {
                class: "draggable-modal-body",
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
                        div { class: "entity-template-tabs",
                            div { class: "entity-template-tab-row",
                                div {
                                    class: "entity-template-tab-list",
                                    role: "tablist",
                                    button {
                                        class: if active_tab == EntityTab::Attributes { "entity-template-tab is-active" } else { "entity-template-tab" },
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: move |_| {
                                            if let Some(s) = create_state.write().as_mut() {
                                                s.active_tab = EntityTab::Attributes;
                                            }
                                        },
                                        "Attributes"
                                        span { class: "entity-template-tab-badge", "{state.attributes.len()}" }
                                    }
                                }
                                // Add attribute button
                                if active_tab == EntityTab::Attributes && source == CreateEntitySource::Scratch {
                                    button {
                                        class: "section-action-button",
                                        "data-tooltip": "Add attribute",
                                        aria_label: "Add attribute",
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: move |_| {
                                            if let Some(s) = create_state.write().as_mut() {
                                                let idx = s.attributes.len() as i32;
                                                s.attributes.push(EntityAttribute {
                                                    access_level_id: 0,
                                                    description: String::new(),
                                                    id: format!("new-{}", idx),
                                                    is_required: false,
                                                    listing_index: idx,
                                                    name: String::new(),
                                                    value: String::new(),
                                                    value_type: "text".to_string(),
                                                });
                                            }
                                        },
                                        Plus { class: "app-icon", size: 16 }
                                    }
                                }
                            }
                            div { class: "entity-template-tab-content",
                                table { class: "data-table",
                                    thead {
                                        tr {
                                            th { "name" }
                                            th { "value" }
                                            th { "access level" }
                                        }
                                    }
                                    tbody {
                                        if state.attributes.is_empty() {
                                            tr {
                                                td { class: "data-table-empty-cell", colspan: "3",
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
                for _ in 0..6 { span {} }
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
) -> Element {
    let access_level_name = access_levels
        .iter()
        .find(|al| al.id == attr.access_level_id)
        .map(|al| al.name.clone())
        .unwrap_or_default();
    let attr_id = attr.id.clone();
    let attr_id2 = attr.id.clone();

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
                    r#type: "text",
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
            td { class: "data-table-muted-cell", "{access_level_name}" }
        }
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

    spawn(async move {
        let body = build_entity_create_body(&attributes, &owner_user_id, &entity_template_id);
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

    format!("{{\"attributes\":[{attrs_json}]{template_part}{owner_part}}}")
}
