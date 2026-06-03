use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{ArrowLeft, Info, Pencil, Save, Trash2};

use crate::types::{
    AccessLevel, AccessLevelModal, AccessLevelResponse, ModalContent, ModalInteraction,
    ModalPosition, ModalSize, OpenModal, SecurityModalMode, API_BASE_URL,
};

use super::{
    focus_element_by_id, focus_element_by_id_after_tick, json_string, next_modal_z_index,
    read_response_error, DeleteConfirmPopover,
};

pub fn open_access_level_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    access_levels: Signal<Vec<AccessLevel>>,
    access_level: Option<AccessLevel>,
    position: ModalPosition,
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
        position,
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

    if mode == SecurityModalMode::Edit {
        focus_element_by_id_after_tick(&format!("access-level-name-{modal_id}-edit"));
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
            if access_level.is_info_open {
                access_level.is_delete_confirm_open = false;
            }
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
            if is_open {
                access_level.is_info_open = false;
            }
        }
    }
}

pub(super) fn close_popovers(access_level: &mut AccessLevelModal) {
    access_level.is_delete_confirm_open = false;
    access_level.is_info_open = false;
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

#[component]
pub(super) fn AccessLevelTitlebarActions(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
    modal_interaction: Signal<Option<ModalInteraction>>,
) -> Element {
    let ModalContent::AccessLevel(access_level) = modal.content.clone() else {
        return rsx! {};
    };

    let is_save_disabled =
        access_level.mode != SecurityModalMode::Details && access_level.name.trim().is_empty();
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
                        div {
                            class: "entity-id-popover",
                            onclick: move |event| event.stop_propagation(),
                            onpointerdown: move |event| event.stop_propagation(),
                            p {
                                class: "entity-id-popover-title",
                                "data-selectable": "true",
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
            if has_id {
                button {
                    class: "draggable-modal-titlebar-button",
                    "data-tooltip": "Back to view",
                    aria_label: "Back to access level details",
                    disabled: is_saving,
                    onclick: move |_| {
                        set_access_level_mode(modals, modal_id, SecurityModalMode::Details);
                    },
                    ArrowLeft { class: "app-icon", size: 15 }
                }
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

#[component]
pub(super) fn AccessLevelContentView(modal: OpenModal, modals: Signal<Vec<OpenModal>>) -> Element {
    let ModalContent::AccessLevel(access_level) = modal.content.clone() else {
        return rsx! {};
    };

    let is_readonly = access_level.mode == SecurityModalMode::Details;
    let form_class = if is_readonly {
        "access-level-edit-form access-level-details-form access-level-view-form"
    } else {
        "access-level-edit-form"
    };
    let form_key = match access_level.mode {
        SecurityModalMode::Create => "create",
        SecurityModalMode::Details => "details",
        SecurityModalMode::Edit => "edit",
    };
    let name_input_id = format!("access-level-name-{}-{form_key}", modal.id);
    let focus_input_id = name_input_id.clone();

    use_effect(move || {
        if !is_readonly {
            focus_element_by_id(&focus_input_id);
        }
    });

    rsx! {
        form {
            class: "{form_class}",
            "data-selectable": "true",
            onsubmit: move |event| event.prevent_default(),
            label { onpointerdown: move |event| event.stop_propagation(),
                span { "name" }
                input {
                    key: "{modal.id}-{form_key}-name",
                    id: "{name_input_id}",
                    onmounted: move |event| async move {
                        if !is_readonly {
                            let _ = event.set_focus(true).await;
                        }
                    },
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
