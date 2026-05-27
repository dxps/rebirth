use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{ArrowLeft, Info, Pencil, Save, Trash2, X};

use crate::types::{
    AccessLevel, AccessLevelModal, AccessLevelResponse, ApiErrorPayload, ApiErrorValue,
    ModalContent, ModalDrag, ModalInteraction, ModalPosition, ModalResize, ModalSize, OpenModal,
    SecurityModalMode, API_BASE_URL, MODAL_DEFAULT_WIDTH, MODAL_MIN_HEIGHT, MODAL_MIN_WIDTH,
};

pub fn open_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    title: impl Into<String>,
) {
    let id = next_modal_id();
    let offset = (id.saturating_sub(1) % 6) as f64 * 28.0;
    let z_index = next_modal_z_index(&modals.read());

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::Generic,
        id,
        position: ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 150.0,
            width: MODAL_DEFAULT_WIDTH,
        },
        title: title.into(),
        z_index,
    });
}

pub fn open_access_level_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    access_levels: Signal<Vec<AccessLevel>>,
    access_level: Option<AccessLevel>,
) {
    let existing_modal_id = {
        let open_modals = modals.read();
        open_modals.iter().find_map(|open_modal| {
            let ModalContent::AccessLevel(open_access_level) = &open_modal.content else {
                return None;
            };

            if open_access_level.id == access_level.as_ref().map(|access_level| access_level.id) {
                Some(open_modal.id)
            } else {
                None
            }
        })
    };

    if let Some(existing_modal_id) = existing_modal_id {
        let next_z_index = next_modal_z_index(&modals.read());

        if let Some(open_modal) = modals
            .write()
            .iter_mut()
            .find(|open_modal| open_modal.id == existing_modal_id)
        {
            open_modal.z_index = next_z_index;
        }

        return;
    }

    let id = next_modal_id();
    let offset = (id.saturating_sub(1) % 6) as f64 * 28.0;
    let z_index = next_modal_z_index(&modals.read());
    let content = access_level
        .map(|access_level| AccessLevelModal {
            access_levels,
            description: access_level.description,
            error: None,
            id: Some(access_level.id),
            is_delete_confirm_open: false,
            is_info_open: false,
            is_saving: false,
            mode: SecurityModalMode::Details,
            name: access_level.name,
            session_key: session_key.clone(),
        })
        .unwrap_or_else(|| AccessLevelModal {
            access_levels,
            description: String::new(),
            error: None,
            id: None,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_saving: false,
            mode: SecurityModalMode::Create,
            name: String::new(),
            session_key,
        });
    let title = access_level_modal_title(content.mode);

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::AccessLevel(content),
        id,
        position: ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 120.0,
            width: 360.0,
        },
        title: title.to_string(),
        z_index,
    });
}

fn access_level_modal_title(mode: SecurityModalMode) -> &'static str {
    match mode {
        SecurityModalMode::Create => "Access Level :: New",
        SecurityModalMode::Details => "Access Level",
        SecurityModalMode::Edit => "Access Level :: Edit",
    }
}

fn next_modal_z_index(modals: &[OpenModal]) -> u32 {
    modals.iter().map(|modal| modal.z_index).max().unwrap_or(20) + 1
}

fn set_access_level_mode(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    mode: SecurityModalMode,
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.mode = mode;
            open_modal.title = access_level_modal_title(mode).to_string();
        }
    }
}

fn update_access_level_name(mut modals: Signal<Vec<OpenModal>>, modal_id: u32, name: String) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.name = name;
        }
    }
}

fn update_access_level_description(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    description: String,
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.description = description;
        }
    }
}

fn update_access_level_status(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    is_saving: bool,
    error: Option<String>,
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.is_saving = is_saving;
            access_level.error = error;
        }
    }
}

fn toggle_access_level_info(mut modals: Signal<Vec<OpenModal>>, modal_id: u32) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.is_info_open = !access_level.is_info_open;
        }
    }
}

fn set_access_level_delete_confirm(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    is_open: bool,
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AccessLevel(access_level) = &mut open_modal.content {
            access_level.is_delete_confirm_open = is_open;
        }
    }
}

fn is_built_in_access_level(access_level: &AccessLevelModal) -> bool {
    access_level.id.is_some_and(|id| id <= 4)
}

fn save_access_level_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::AccessLevel(mut access_level) = modal.content.clone() else {
        return;
    };
    let name = access_level.name.trim().to_string();
    let description = access_level.description.trim().to_string();

    if name.is_empty() {
        update_access_level_status(
            modals,
            modal.id,
            false,
            Some("Name is required".to_string()),
        );
        return;
    }

    update_access_level_status(modals, modal.id, true, None);

    spawn(async move {
        let result = match access_level.id {
            Some(id) => {
                update_access_level_request(id, &access_level.session_key, &name, &description)
                    .await
            }
            None => {
                create_access_level_request(&access_level.session_key, &name, &description).await
            }
        };

        match result {
            Ok(saved_access_level) => {
                if access_level.id.is_some() {
                    access_level
                        .access_levels
                        .write()
                        .iter_mut()
                        .for_each(|item| {
                            if item.id == saved_access_level.id {
                                *item = saved_access_level.clone();
                            }
                        });
                } else {
                    access_level.access_levels.write().push(saved_access_level);
                }

                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => update_access_level_status(modals, modal.id, false, Some(message)),
        }
    });
}

fn delete_access_level_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::AccessLevel(mut access_level) = modal.content.clone() else {
        return;
    };
    let Some(id) = access_level.id else {
        return;
    };

    if is_built_in_access_level(&access_level) {
        update_access_level_status(
            modals,
            modal.id,
            false,
            Some("Built-in access levels cannot be deleted".to_string()),
        );
        return;
    }

    update_access_level_status(modals, modal.id, true, None);

    spawn(async move {
        match delete_access_level_request(id, &access_level.session_key).await {
            Ok(()) => {
                access_level
                    .access_levels
                    .write()
                    .retain(|access_level| access_level.id != id);
                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => update_access_level_status(modals, modal.id, false, Some(message)),
        }
    });
}

async fn create_access_level_request(
    session_key: &str,
    name: &str,
    description: &str,
) -> Result<AccessLevel, String> {
    let response = Request::post(&format!("{API_BASE_URL}/access-levels"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .header("Content-Type", "application/json")
        .body(format!(
            "{{\"name\":{},\"description\":{}}}",
            json_string(name),
            json_string(description)
        ))
        .map_err(|_| "Unable to create access level".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to create access level".to_string())?;

    parse_access_level_response(response, "Unable to create access level").await
}

async fn update_access_level_request(
    id: u32,
    session_key: &str,
    name: &str,
    description: &str,
) -> Result<AccessLevel, String> {
    let response = Request::patch(&format!("{API_BASE_URL}/access-levels/{id}"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .header("Content-Type", "application/json")
        .body(format!(
            "{{\"name\":{},\"description\":{}}}",
            json_string(name),
            json_string(description)
        ))
        .map_err(|_| "Unable to save access level".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to save access level".to_string())?;

    parse_access_level_response(response, "Unable to save access level").await
}

async fn delete_access_level_request(id: u32, session_key: &str) -> Result<(), String> {
    let response = Request::delete(&format!("{API_BASE_URL}/access-levels/{id}"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Unable to delete access level".to_string())?;

    if response.ok() {
        Ok(())
    } else {
        Err(read_response_error(response, "Unable to delete access level").await)
    }
}

async fn parse_access_level_response(
    response: gloo_net::http::Response,
    fallback: &str,
) -> Result<AccessLevel, String> {
    if response.ok() {
        response
            .json::<AccessLevelResponse>()
            .await
            .map(|payload| payload.data)
            .map_err(|_| fallback.to_string())
    } else {
        Err(read_response_error(response, fallback).await)
    }
}

async fn read_response_error(response: gloo_net::http::Response, fallback: &str) -> String {
    response
        .json::<ApiErrorPayload>()
        .await
        .map(|payload| match payload.error {
            ApiErrorValue::Message(message) => message,
            ApiErrorValue::Details { message } => message,
        })
        .unwrap_or_else(|_| fallback.to_string())
}

fn json_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
    )
}

#[component]
fn ModalTitlebarActions(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
    modal_interaction: Signal<Option<ModalInteraction>>,
) -> Element {
    match modal.content.clone() {
        ModalContent::AccessLevel(access_level) => {
            let is_save_disabled = access_level.mode != SecurityModalMode::Details
                && access_level.name.trim().is_empty();
            let is_built_in = is_built_in_access_level(&access_level);
            let modal_id = modal.id;
            let has_id = access_level.id.is_some();
            let is_info_open = access_level.is_info_open;
            let is_delete_confirm_open = access_level.is_delete_confirm_open;
            let is_saving = access_level.is_saving;
            let details_delete_modal = modal.clone();
            let edit_delete_modal = modal.clone();
            let save_modal = modal.clone();

            rsx! {
                if access_level.mode == SecurityModalMode::Details {
                    if let Some(id) = access_level.id {
                        div { class: "draggable-modal-info-action",
                            button {
                                class: "draggable-modal-titlebar-button draggable-modal-info-button",
                                "data-tooltip": "Info",
                                aria_label: "Show id",
                                aria_expanded: "{is_info_open}",
                                onclick: move |_| toggle_access_level_info(modals, modal_id),
                                Info { class: "app-icon", size: 15 }
                            }
                            if is_info_open {
                                div { class: "entity-id-popover",
                                    p { class: "entity-id-popover-title", "data-selectable": "true",
                                        "id: {id}"
                                    }
                                }
                            }
                        }
                    }
                    div {
                        class: "draggable-modal-delete-action",
                        "data-tooltip": if is_built_in { "This built-in access level cannot be deleted." } else { "" },
                        button {
                            class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                            "data-tooltip": if is_built_in || is_delete_confirm_open { "" } else { "Delete" },
                            aria_label: "Delete access level",
                            aria_expanded: "{is_delete_confirm_open}",
                            disabled: is_built_in || is_saving,
                            onclick: move |_| {
                                if !is_built_in {
                                    set_access_level_delete_confirm(modals, modal_id, true);
                                }
                            },
                            Trash2 { class: "app-icon", size: 15 }
                        }
                        if is_delete_confirm_open {
                            DeleteConfirmPopover {
                                on_cancel: move |_| set_access_level_delete_confirm(modals, modal_id, false),
                                on_confirm: move |_| {
                                    modal_interaction.set(None);
                                    delete_access_level_modal(modals, details_delete_modal.clone());
                                },
                            }
                        }
                    }
                    button {
                        class: "draggable-modal-titlebar-button",
                        "data-tooltip": if is_built_in { "This built-in access level cannot be edited." } else { "Edit" },
                        aria_label: "Edit access level",
                        disabled: is_built_in || is_saving,
                        onclick: move |_| {
                            if !is_built_in {
                                set_access_level_mode(modals, modal_id, SecurityModalMode::Edit);
                            }
                        },
                        Pencil { class: "app-icon", size: 15 }
                    }
                } else {
                    if access_level.mode == SecurityModalMode::Edit {
                        div { class: "draggable-modal-delete-action",
                            button {
                                class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                                "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                                aria_label: "Delete access level",
                                aria_expanded: "{is_delete_confirm_open}",
                                disabled: is_saving,
                                onclick: move |_| set_access_level_delete_confirm(modals, modal_id, true),
                                Trash2 { class: "app-icon", size: 15 }
                            }
                            if is_delete_confirm_open {
                                DeleteConfirmPopover {
                                    on_cancel: move |_| set_access_level_delete_confirm(modals, modal_id, false),
                                    on_confirm: move |_| {
                                        modal_interaction.set(None);
                                        delete_access_level_modal(modals, edit_delete_modal.clone());
                                    },
                                }
                            }
                        }
                    }
                    button {
                        class: "draggable-modal-titlebar-button",
                        "data-tooltip": "Back to view",
                        aria_label: "Back to access level details",
                        disabled: is_saving,
                        onclick: move |_| {
                            if has_id {
                                set_access_level_mode(modals, modal_id, SecurityModalMode::Details);
                            } else {
                                modal_interaction.set(None);
                                modals.write().retain(|open_modal| open_modal.id != modal_id);
                            }
                        },
                        ArrowLeft { class: "app-icon", size: 15 }
                    }
                    button {
                        class: "draggable-modal-titlebar-button",
                        "data-tooltip": if is_save_disabled { "A name is required" } else { "Save" },
                        aria_label: "Save access level",
                        disabled: is_save_disabled || is_saving,
                        onclick: move |_| {
                            if !is_save_disabled {
                                save_access_level_modal(modals, save_modal.clone());
                            }
                        },
                        Save { class: "app-icon", size: 15 }
                    }
                }
            }
        }
        ModalContent::Generic => rsx! {
            button {
                class: "draggable-modal-titlebar-button draggable-modal-info-button",
                "data-tooltip": "Info",
                aria_label: "Info",
                Info { class: "app-icon", size: 15 }
            }
            button {
                class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                "data-tooltip": "Delete",
                aria_label: "Delete",
                Trash2 { class: "app-icon", size: 15 }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Edit",
                aria_label: "Edit",
                Pencil { class: "app-icon", size: 15 }
            }
        },
    }
}

#[component]
fn DeleteConfirmPopover(
    on_cancel: EventHandler<MouseEvent>,
    on_confirm: EventHandler<MouseEvent>,
) -> Element {
    rsx! {
        div {
            class: "delete-confirm-popover",
            role: "dialog",
            aria_label: "Confirm delete access level",
            onpointerdown: move |event| event.stop_propagation(),
            p { "Delete this entry?" }
            div {
                button {
                    class: "delete-confirm-secondary",
                    r#type: "button",
                    onclick: move |event| on_cancel.call(event),
                    "Cancel"
                }
                button {
                    class: "delete-confirm-danger",
                    r#type: "button",
                    onclick: move |event| on_confirm.call(event),
                    "Delete"
                }
            }
        }
    }
}

#[component]
fn ModalContentView(modal: OpenModal, modals: Signal<Vec<OpenModal>>) -> Element {
    match modal.content.clone() {
        ModalContent::AccessLevel(access_level) => {
            let is_readonly = access_level.mode == SecurityModalMode::Details;
            let form_class = if is_readonly {
                "access-level-edit-form access-level-details-form access-level-view-form"
            } else {
                "access-level-edit-form"
            };

            rsx! {
                div { class: "{form_class}", "data-selectable": "true",
                    label { onpointerdown: move |event| event.stop_propagation(),
                        span { "name" }
                        input {
                            readonly: is_readonly,
                            disabled: access_level.is_saving,
                            r#type: "text",
                            value: "{access_level.name}",
                            oninput: move |event| {
                                update_access_level_name(modals, modal.id, event.value());
                            },
                        }
                    }
                    label { onpointerdown: move |event| event.stop_propagation(),
                        span { "description" }
                        textarea {
                            class: "access-level-description-input",
                            readonly: is_readonly,
                            disabled: access_level.is_saving,
                            rows: "1",
                            value: "{access_level.description}",
                            oninput: move |event| {
                                update_access_level_description(modals, modal.id, event.value());
                            },
                        }
                    }
                    if let Some(error) = &access_level.error {
                        p { class: "form-error", "{error}" }
                    }
                    if access_level.is_saving {
                        p { class: "form-status", "Saving" }
                    }
                }
            }
        }
        ModalContent::Generic => rsx! {
            div { class: "entity-template-edit-form entity-template-view-form",
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "Name" }
                    input { value: "{modal.title}", readonly: true }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "Description" }
                    textarea { readonly: true,
                        "Dioxus modal surface mirroring the draggable editor/detail panels from the TypeScript UI."
                    }
                }
                div { class: "entity-template-tabs",
                    div { class: "entity-template-tab-list",
                        button {
                            class: "entity-template-tab is-active",
                            onpointerdown: move |event| event.stop_propagation(),
                            "Attributes"
                            span { class: "entity-template-tab-badge", "4" }
                        }
                        button {
                            class: "entity-template-tab",
                            onpointerdown: move |event| event.stop_propagation(),
                            "Links"
                            span { class: "entity-template-tab-badge", "2" }
                        }
                        button {
                            class: "entity-template-tab",
                            onpointerdown: move |event| event.stop_propagation(),
                            "Inlinks"
                            span { class: "entity-template-tab-badge", "1" }
                        }
                    }
                }
            }
        },
    }
}

#[component]
pub fn ModalLayer(modals: Signal<Vec<OpenModal>>) -> Element {
    let mut modal_interaction = use_signal(|| None::<ModalInteraction>);

    rsx! {
        if !modals.read().is_empty() {
            div {
                class: match modal_interaction() {
                    Some(ModalInteraction::Drag(_)) => "draggable-modal-layer is-dragging",
                    Some(ModalInteraction::Resize(_)) => "draggable-modal-layer is-resizing",
                    None => "draggable-modal-layer",
                },
                onpointermove: move |event| {
                    if let Some(interaction) = modal_interaction() {
                        let point = event.data().client_coordinates();
                        let mut open_modals = modals.write();

                        match interaction {
                            ModalInteraction::Drag(drag) => {
                                if let Some(modal) = open_modals
                                    .iter_mut()
                                    .find(|modal| modal.id == drag.modal_id)
                                {
                                    modal.position = ModalPosition {
                                        x: (point.x - drag.offset_x).max(16.0),
                                        y: (point.y - drag.offset_y).max(64.0),
                                    };
                                }
                            }
                            ModalInteraction::Resize(resize) => {
                                if let Some(modal) = open_modals
                                    .iter_mut()
                                    .find(|modal| modal.id == resize.modal_id)
                                {
                                    modal.size = ModalSize {
                                        height: (resize.start_height + point.y - resize.start_y)
                                            .max(MODAL_MIN_HEIGHT),
                                        width: (resize.start_width + point.x - resize.start_x)
                                            .max(MODAL_MIN_WIDTH),
                                    };
                                }
                            }
                        }
                    }
                },
                onpointerup: move |_| modal_interaction.set(None),
                onpointercancel: move |_| modal_interaction.set(None),

                for modal in modals.read().iter().cloned() {
                    div {
                        key: "{modal.id}",
                        class: match modal_interaction() {
                            Some(ModalInteraction::Drag(drag)) if drag.modal_id == modal.id => {
                                "draggable-modal is-dragging"
                            }
                            Some(ModalInteraction::Resize(resize)) if resize.modal_id == modal.id => {
                                "draggable-modal is-resizing"
                            }
                            _ => "draggable-modal",
                        },
                        style: "left: {modal.position.x}px; top: {modal.position.y}px; width: {modal.size.width}px; height: {modal.size.height}px; min-width: {MODAL_MIN_WIDTH}px; min-height: {MODAL_MIN_HEIGHT}px; z-index: {modal.z_index};",
                        onpointerdown: move |_| {
                            let next_z_index = next_modal_z_index(&modals.read());
                            if let Some(open_modal) = modals
                                .write()
                                .iter_mut()
                                .find(|open_modal| open_modal.id == modal.id)
                            {
                                open_modal.z_index = next_z_index;
                            }
                        },
                        div {
                            class: "draggable-modal-body",
                            onpointerdown: move |event| {
                                event.stop_propagation();

                                let point = event.data().client_coordinates();
                                let next_z_index = next_modal_z_index(&modals.read());

                                if let Some(open_modal) = modals
                                    .write()
                                    .iter_mut()
                                    .find(|open_modal| open_modal.id == modal.id)
                                {
                                    open_modal.z_index = next_z_index;
                                }
                                modal_interaction
                                    .set(
                                        Some(
                                            ModalInteraction::Drag(ModalDrag {
                                                modal_id: modal.id,
                                                offset_x: point.x - modal.position.x,
                                                offset_y: point.y - modal.position.y,
                                            }),
                                        ),
                                    );
                            },
                            div { class: "draggable-modal-header",
                                h2 { "{modal.title}" }
                                div {
                                    class: "draggable-modal-titlebar-actions",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    ModalTitlebarActions {
                                        modal: modal.clone(),
                                        modals,
                                        modal_interaction,
                                    }
                                    button {
                                        class: "draggable-modal-titlebar-button draggable-modal-close",
                                        "data-tooltip": "Close",
                                        aria_label: "Close",
                                        onclick: move |_| {
                                            modal_interaction.set(None);
                                            modals.write().retain(|open_modal| open_modal.id != modal.id);
                                        },
                                        X { class: "app-icon", size: 15 }
                                    }
                                }
                            }
                            div { class: "draggable-modal-content",
                                ModalContentView { modal: modal.clone(), modals }
                            }
                        }
                        span {
                            class: "draggable-modal-resize",
                            "data-tooltip": "Resize",
                            onpointerdown: move |event| {
                                event.stop_propagation();

                                let point = event.data().client_coordinates();
                                let next_z_index = next_modal_z_index(&modals.read());

                                if let Some(open_modal) = modals
                                    .write()
                                    .iter_mut()
                                    .find(|open_modal| open_modal.id == modal.id)
                                {
                                    open_modal.z_index = next_z_index;
                                }

                                modal_interaction
                                    .set(
                                        Some(
                                            ModalInteraction::Resize(ModalResize {
                                                modal_id: modal.id,
                                                start_height: modal.size.height,
                                                start_width: modal.size.width,
                                                start_x: point.x,
                                                start_y: point.y,
                                            }),
                                        ),
                                    );
                            },
                            for _ in 0..6 {
                                span {}
                            }
                        }
                    }
                }
            }
        }
    }
}
