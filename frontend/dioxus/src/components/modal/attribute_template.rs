use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{ArrowLeft, Info, Pencil, Save, Trash2, User};

use crate::components::single_select_picker::{SingleSelectOption, SingleSelectPicker};
use crate::types::{
    AccessLevel, AttributeTemplate, AttributeTemplateModal, AttributeTemplateResponse,
    ModalContent, ModalInteraction, ModalSize, OpenModal, SecurityModalMode, User, API_BASE_URL,
};

use super::{
    focus_element_by_id, focus_element_by_id_after_tick, json_string, next_modal_z_index,
    read_response_error, DeleteConfirmPopover,
};

const VALUE_TYPES: [&str; 5] = ["text", "number", "boolean", "date", "datetime"];

pub fn open_attribute_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
    access_levels: Vec<AccessLevel>,
    owner_users: Vec<User>,
    attribute_template: Option<AttributeTemplate>,
    can_assign_owner: bool,
    can_edit: bool,
) {
    let existing_modal_id = {
        let open_modals = modals.read();
        open_modals.iter().find_map(|open_modal| {
            let ModalContent::AttributeTemplate(open_attribute_template) = &open_modal.content
            else {
                return None;
            };

            if open_attribute_template.id
                == attribute_template
                    .as_ref()
                    .map(|template| template.id.clone())
            {
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
    let fallback_access_level_id = access_levels
        .first()
        .map(|access_level| access_level.id)
        .unwrap_or(4);
    let content = attribute_template
        .map(|template| AttributeTemplateModal {
            access_level_id: template.access_level_id,
            access_levels: access_levels.clone(),
            attribute_templates,
            can_assign_owner,
            can_edit,
            default_value: template.default_value.unwrap_or_default(),
            description: template.description,
            error: None,
            id: Some(template.id),
            is_access_level_menu_open: false,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_ownership_open: false,
            is_required: template.is_required,
            is_saving: false,
            is_value_type_menu_open: false,
            mode: SecurityModalMode::Details,
            name: template.name,
            owner_user_id: Some(template.owner_user_id),
            owner_username: template.owner_username,
            owner_users: owner_users.clone(),
            session_key: session_key.clone(),
            value_type: template.value_type,
        })
        .unwrap_or_else(|| AttributeTemplateModal {
            access_level_id: fallback_access_level_id,
            access_levels,
            attribute_templates,
            can_assign_owner,
            can_edit: true,
            default_value: String::new(),
            description: String::new(),
            error: None,
            id: None,
            is_access_level_menu_open: false,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_ownership_open: false,
            is_required: false,
            is_saving: false,
            is_value_type_menu_open: false,
            mode: SecurityModalMode::Create,
            name: String::new(),
            owner_user_id: None,
            owner_username: None,
            owner_users,
            session_key,
            value_type: "text".to_string(),
        });
    let title = attribute_template_modal_title(content.mode);

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::AttributeTemplate(content),
        id,
        position: crate::types::ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 362.0,
            width: 360.0,
        },
        title: title.to_string(),
        z_index,
    });
}

fn attribute_template_modal_title(mode: SecurityModalMode) -> &'static str {
    match mode {
        SecurityModalMode::Create => "Attribute Template :: New",
        SecurityModalMode::Details => "Attribute Template",
        SecurityModalMode::Edit => "Attribute Template :: Edit",
    }
}

fn set_attribute_template_mode(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    mode: SecurityModalMode,
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AttributeTemplate(attribute_template) = &mut open_modal.content {
            attribute_template.mode = mode;
            attribute_template.is_delete_confirm_open = false;
            attribute_template.is_info_open = false;
            attribute_template.is_ownership_open = false;
            attribute_template.is_access_level_menu_open = false;
            attribute_template.is_value_type_menu_open = false;
            open_modal.title = attribute_template_modal_title(mode).to_string();
        }
    }

    if mode == SecurityModalMode::Edit {
        focus_element_by_id_after_tick(&format!("attribute-template-name-{modal_id}-edit"));
    }
}

fn update_attribute_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    update: impl FnOnce(&mut AttributeTemplateModal),
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::AttributeTemplate(attribute_template) = &mut open_modal.content {
            update(attribute_template);
        }
    }
}

pub(super) fn close_popovers(attribute_template: &mut AttributeTemplateModal) {
    attribute_template.is_delete_confirm_open = false;
    attribute_template.is_info_open = false;
    attribute_template.is_ownership_open = false;
    attribute_template.is_access_level_menu_open = false;
    attribute_template.is_value_type_menu_open = false;
}

fn save_attribute_template_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::AttributeTemplate(mut attribute_template) = modal.content.clone() else {
        return;
    };
    let name = attribute_template.name.trim().to_string();
    let description = attribute_template.description.trim().to_string();
    let default_value = attribute_template.default_value.trim().to_string();

    if name.is_empty() {
        update_attribute_template_modal(modals, modal.id, |attribute_template| {
            attribute_template.is_saving = false;
            attribute_template.error = Some("Name is required".to_string());
        });
        return;
    }

    update_attribute_template_modal(modals, modal.id, |attribute_template| {
        attribute_template.is_saving = true;
        attribute_template.error = None;
    });

    spawn(async move {
        let result = match attribute_template.id.as_deref() {
            Some(id) => {
                save_attribute_template_request(
                    "PATCH",
                    &format!("{API_BASE_URL}/attribute-templates/{id}"),
                    &attribute_template.session_key,
                    &name,
                    &description,
                    &attribute_template.value_type,
                    attribute_template.access_level_id,
                    &default_value,
                    attribute_template.is_required,
                    attribute_template.owner_user_id.as_deref(),
                )
                .await
            }
            None => {
                save_attribute_template_request(
                    "POST",
                    &format!("{API_BASE_URL}/attribute-templates"),
                    &attribute_template.session_key,
                    &name,
                    &description,
                    &attribute_template.value_type,
                    attribute_template.access_level_id,
                    &default_value,
                    attribute_template.is_required,
                    attribute_template.owner_user_id.as_deref(),
                )
                .await
            }
        };

        match result {
            Ok(saved_attribute_template) => {
                if attribute_template.id.is_some() {
                    attribute_template
                        .attribute_templates
                        .write()
                        .iter_mut()
                        .for_each(|item| {
                            if item.id == saved_attribute_template.id {
                                *item = saved_attribute_template.clone();
                            }
                        });
                } else {
                    attribute_template
                        .attribute_templates
                        .write()
                        .push(saved_attribute_template);
                }

                attribute_template
                    .attribute_templates
                    .write()
                    .sort_by(|left, right| {
                        left.name
                            .to_ascii_lowercase()
                            .cmp(&right.name.to_ascii_lowercase())
                    });
                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => {
                update_attribute_template_modal(modals, modal.id, |attribute_template| {
                    attribute_template.is_saving = false;
                    attribute_template.error = Some(message);
                })
            }
        }
    });
}

fn delete_attribute_template_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::AttributeTemplate(mut attribute_template) = modal.content.clone() else {
        return;
    };
    let Some(id) = attribute_template.id.clone() else {
        return;
    };

    update_attribute_template_modal(modals, modal.id, |attribute_template| {
        attribute_template.is_saving = true;
        attribute_template.error = None;
    });

    spawn(async move {
        match delete_attribute_template_request(&id, &attribute_template.session_key).await {
            Ok(()) => {
                attribute_template
                    .attribute_templates
                    .write()
                    .retain(|attribute_template| attribute_template.id != id);
                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => {
                update_attribute_template_modal(modals, modal.id, |attribute_template| {
                    attribute_template.is_saving = false;
                    attribute_template.error = Some(message);
                })
            }
        }
    });
}

async fn save_attribute_template_request(
    method: &str,
    url: &str,
    session_key: &str,
    name: &str,
    description: &str,
    value_type: &str,
    access_level_id: u32,
    default_value: &str,
    is_required: bool,
    owner_user_id: Option<&str>,
) -> Result<AttributeTemplate, String> {
    let owner_user_id_json = owner_user_id
        .map(|owner_user_id| format!(",\"ownerUserId\":{}", json_string(owner_user_id)))
        .unwrap_or_default();
    let body = format!(
        "{{\"accessLevelId\":{},\"defaultValue\":{},\"description\":{},\"isRequired\":{},\"name\":{},\"valueType\":{}{} }}",
        access_level_id,
        if default_value.is_empty() { "null".to_string() } else { json_string(default_value) },
        json_string(description),
        is_required,
        json_string(name),
        json_string(value_type),
        owner_user_id_json,
    );
    let request = if method == "PATCH" {
        Request::patch(url)
    } else {
        Request::post(url)
    };
    let response = request
        .header("Authorization", &format!("Bearer {session_key}"))
        .header("Content-Type", "application/json")
        .body(body)
        .map_err(|_| "Unable to save attribute template".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to save attribute template".to_string())?;

    parse_attribute_template_response(response, "Unable to save attribute template").await
}

async fn delete_attribute_template_request(id: &str, session_key: &str) -> Result<(), String> {
    let response = Request::delete(&format!("{API_BASE_URL}/attribute-templates/{id}"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Unable to delete attribute template".to_string())?;

    if response.ok() {
        Ok(())
    } else {
        Err(read_response_error(response, "Unable to delete attribute template").await)
    }
}

async fn parse_attribute_template_response(
    response: gloo_net::http::Response,
    fallback: &str,
) -> Result<AttributeTemplate, String> {
    if response.ok() {
        response
            .json::<AttributeTemplateResponse>()
            .await
            .map(|payload| payload.data)
            .map_err(|_| fallback.to_string())
    } else {
        Err(read_response_error(response, fallback).await)
    }
}

#[component]
pub(super) fn AttributeTemplateTitlebarActions(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
    modal_interaction: Signal<Option<ModalInteraction>>,
) -> Element {
    let ModalContent::AttributeTemplate(attribute_template) = modal.content.clone() else {
        return rsx! {};
    };

    let is_save_disabled = attribute_template.mode != SecurityModalMode::Details
        && attribute_template.name.trim().is_empty();
    let modal_id = modal.id;
    let has_id = attribute_template.id.is_some();
    let can_edit = attribute_template.can_edit;
    let is_info_open = attribute_template.is_info_open;
    let is_ownership_open = attribute_template.is_ownership_open;
    let is_delete_confirm_open = attribute_template.is_delete_confirm_open;
    let is_saving = attribute_template.is_saving;
    let owner_label = owner_label(&attribute_template);
    let owner_users = attribute_template.owner_users.clone();
    let can_assign_owner = attribute_template.can_assign_owner;
    let owner_user_id = attribute_template.owner_user_id.clone().unwrap_or_default();
    let details_delete_modal = modal.clone();
    let edit_delete_modal = modal.clone();
    let save_modal = modal.clone();

    rsx! {
        if attribute_template.mode == SecurityModalMode::Details {
            if let Some(id) = attribute_template.id.clone() {
                div { class: "draggable-modal-info-action",
                    button {
                        class: "draggable-modal-titlebar-button draggable-modal-info-button",
                        "data-tooltip": "Info",
                        aria_label: "Show id",
                        aria_expanded: "{is_info_open}",
                        onclick: move |_| update_attribute_template_modal(
                            modals,
                            modal_id,
                            |attribute_template| {
                                attribute_template.is_info_open = !attribute_template.is_info_open;
                                attribute_template.is_delete_confirm_open = false;
                            },
                        ),
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
            div { class: "draggable-modal-delete-action",
                button {
                    class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                    "data-tooltip": if !can_edit || is_delete_confirm_open { "" } else { "Delete" },
                    aria_label: "Delete attribute template",
                    aria_expanded: "{is_delete_confirm_open}",
                    disabled: !can_edit || is_saving,
                    onclick: move |_| update_attribute_template_modal(
                        modals,
                        modal_id,
                        |attribute_template| {
                            attribute_template.is_delete_confirm_open = true;
                            attribute_template.is_info_open = false;
                        },
                    ),
                    Trash2 { class: "app-icon", size: 15 }
                }
                if is_delete_confirm_open {
                    DeleteConfirmPopover {
                        on_cancel: move |_| update_attribute_template_modal(
                            modals,
                            modal_id,
                            |attribute_template| attribute_template.is_delete_confirm_open = false,
                        ),
                        on_confirm: move |_| {
                            modal_interaction.set(None);
                            delete_attribute_template_modal(modals, details_delete_modal.clone());
                        },
                    }
                }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": if can_edit { "Edit" } else { "You cannot edit this attribute template" },
                aria_label: "Edit attribute template",
                disabled: !can_edit || is_saving,
                onclick: move |_| set_attribute_template_mode(modals, modal_id, SecurityModalMode::Edit),
                Pencil { class: "app-icon", size: 15 }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Owner",
                aria_label: "Ownership",
                aria_expanded: "{is_ownership_open}",
                onclick: move |_| update_attribute_template_modal(
                    modals,
                    modal_id,
                    |attribute_template| {
                        attribute_template.is_ownership_open = !attribute_template.is_ownership_open;
                        attribute_template.is_info_open = false;
                        attribute_template.is_delete_confirm_open = false;
                    },
                ),
                User { class: "app-icon", size: 15 }
            }
            if is_ownership_open {
                OwnershipPopover {
                    owner_label: owner_label.clone(),
                    owner_user_id: owner_user_id.clone(),
                    owner_users: owner_users.clone(),
                    can_assign_owner: false,
                    is_saving,
                    on_owner_change: move |owner_user_id: String| update_attribute_template_modal(
                        modals,
                        modal_id,
                        |attribute_template| {
                            attribute_template.owner_user_id = Some(owner_user_id.clone());
                            attribute_template.owner_username = owner_username_from_id(
                                &attribute_template.owner_users,
                                &owner_user_id,
                            );
                        },
                    ),
                }
            }
        } else {
            if attribute_template.mode == SecurityModalMode::Edit {
                div { class: "draggable-modal-delete-action",
                    button {
                        class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                        "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                        aria_label: "Delete attribute template",
                        aria_expanded: "{is_delete_confirm_open}",
                        disabled: is_saving,
                        onclick: move |_| update_attribute_template_modal(
                            modals,
                            modal_id,
                            |attribute_template| attribute_template.is_delete_confirm_open = true,
                        ),
                        Trash2 { class: "app-icon", size: 15 }
                    }
                    if is_delete_confirm_open {
                        DeleteConfirmPopover {
                            on_cancel: move |_| update_attribute_template_modal(
                                modals,
                                modal_id,
                                |attribute_template| attribute_template.is_delete_confirm_open = false,
                            ),
                            on_confirm: move |_| {
                                modal_interaction.set(None);
                                delete_attribute_template_modal(modals, edit_delete_modal.clone());
                            },
                        }
                    }
                }
            }
            if has_id {
                button {
                    class: "draggable-modal-titlebar-button",
                    "data-tooltip": "Back to view",
                    aria_label: "Back to attribute template details",
                    disabled: is_saving,
                    onclick: move |_| set_attribute_template_mode(modals, modal_id, SecurityModalMode::Details),
                    ArrowLeft { class: "app-icon", size: 15 }
                }
            } else {
                button {
                    class: "draggable-modal-titlebar-button",
                    "data-tooltip": "Back",
                    aria_label: "Back",
                    disabled: is_saving,
                    onclick: move |_| {
                        modals.write().retain(|open_modal| open_modal.id != modal_id);
                    },
                    ArrowLeft { class: "app-icon", size: 15 }
                }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Owner",
                aria_label: "Ownership",
                aria_expanded: "{is_ownership_open}",
                onclick: move |_| update_attribute_template_modal(
                    modals,
                    modal_id,
                    |attribute_template| {
                        attribute_template.is_ownership_open = !attribute_template.is_ownership_open;
                        attribute_template.is_info_open = false;
                        attribute_template.is_delete_confirm_open = false;
                    },
                ),
                User { class: "app-icon", size: 15 }
            }
            if is_ownership_open {
                OwnershipPopover {
                    owner_label: owner_label.clone(),
                    owner_user_id: owner_user_id.clone(),
                    owner_users: owner_users.clone(),
                    can_assign_owner,
                    is_saving,
                    on_owner_change: move |owner_user_id: String| update_attribute_template_modal(
                        modals,
                        modal_id,
                        |attribute_template| {
                            attribute_template.owner_user_id = Some(owner_user_id.clone());
                            attribute_template.owner_username = owner_username_from_id(
                                &attribute_template.owner_users,
                                &owner_user_id,
                            );
                        },
                    ),
                }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": if is_save_disabled { "A name is required" } else { "Save" },
                aria_label: "Save attribute template",
                disabled: is_save_disabled || is_saving,
                onclick: move |_| {
                    if !is_save_disabled {
                        save_attribute_template_modal(modals, save_modal.clone());
                    }
                },
                Save { class: "app-icon", size: 15 }
            }
        }
    }
}

#[component]
fn OwnershipPopover(
    owner_label: String,
    owner_user_id: String,
    owner_users: Vec<User>,
    can_assign_owner: bool,
    is_saving: bool,
    on_owner_change: EventHandler<String>,
) -> Element {
    let owner_options = owner_users
        .iter()
        .map(|owner| SingleSelectOption {
            label: owner.username.clone(),
            value: owner.id.clone(),
        })
        .collect::<Vec<_>>();
    let owner_summary = owner_users
        .iter()
        .find(|owner| owner.id == owner_user_id)
        .map(|owner| owner.username.clone())
        .unwrap_or(owner_label.clone());
    let mut is_owner_menu_open = use_signal(|| false);

    rsx! {
        div {
            class: "include-attribute-popover entity-ownership-popover entity-ownership-read-popover",
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            if can_assign_owner {
                label {
                    span { "Owner:" }
                    SingleSelectPicker {
                        disabled: is_saving,
                        empty_text: "Select owner",
                        is_open: is_owner_menu_open(),
                        options: owner_options,
                        selected_value: owner_user_id,
                        summary: owner_summary,
                        on_toggle_open: move |_| is_owner_menu_open.toggle(),
                        on_select_item: move |owner_user_id: String| {
                            is_owner_menu_open.set(false);
                            on_owner_change.call(owner_user_id);
                        },
                    }
                }
            } else {
                p { class: "entity-ownership-read-title", "Owner: {owner_label}" }
            }
        }
    }
}

#[component]
pub(super) fn AttributeTemplateContentView(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
) -> Element {
    let ModalContent::AttributeTemplate(attribute_template) = modal.content.clone() else {
        return rsx! {};
    };

    let is_readonly = attribute_template.mode == SecurityModalMode::Details;
    let form_class = if is_readonly {
        "access-level-details access-level-edit-form attribute-template-view-form"
    } else {
        "access-level-edit-form"
    };
    let form_key = match attribute_template.mode {
        SecurityModalMode::Create => "create",
        SecurityModalMode::Details => "details",
        SecurityModalMode::Edit => "edit",
    };
    let name_input_id = format!("attribute-template-name-{}-{form_key}", modal.id);
    let focus_input_id = name_input_id.clone();
    let access_level_options = access_level_options(
        &attribute_template.access_levels,
        attribute_template.access_level_id,
    );
    let value_type_options = VALUE_TYPES
        .iter()
        .map(|value_type| SingleSelectOption {
            label: value_type.to_string(),
            value: value_type.to_string(),
        })
        .collect::<Vec<_>>();
    let access_level_picker_options = access_level_options
        .iter()
        .map(|access_level| SingleSelectOption {
            label: access_level.name.clone(),
            value: access_level.id.to_string(),
        })
        .collect::<Vec<_>>();
    let access_level_summary = access_level_options
        .iter()
        .find(|access_level| access_level.id == attribute_template.access_level_id)
        .map(|access_level| access_level.name.clone())
        .unwrap_or_else(|| attribute_template.access_level_id.to_string());

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
                    disabled: attribute_template.is_saving,
                    r#type: "text",
                    value: "{attribute_template.name}",
                    oninput: move |event| update_attribute_template_modal(
                        modals,
                        modal.id,
                        |attribute_template| attribute_template.name = event.value(),
                    ),
                }
            }
            label { onpointerdown: move |event| event.stop_propagation(),
                span { "description" }
                textarea {
                    class: "attribute-template-description-input",
                    readonly: is_readonly,
                    disabled: attribute_template.is_saving,
                    rows: "1",
                    value: "{attribute_template.description}",
                    oninput: move |event| update_attribute_template_modal(
                        modals,
                        modal.id,
                        |attribute_template| attribute_template.description = event.value(),
                    ),
                }
            }
            div { class: if is_readonly { "attribute-template-detail-pair-row" } else { "attribute-template-select-row" },
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "value type" }
                    SingleSelectPicker {
                        disabled: is_readonly || attribute_template.is_saving,
                        empty_text: "Select value type",
                        is_open: attribute_template.is_value_type_menu_open,
                        options: value_type_options,
                        selected_value: attribute_template.value_type.clone(),
                        summary: attribute_template.value_type.clone(),
                        on_toggle_open: move |_| update_attribute_template_modal(
                            modals,
                            modal.id,
                            |attribute_template| {
                                attribute_template.is_value_type_menu_open =
                                    !attribute_template.is_value_type_menu_open;
                                attribute_template.is_access_level_menu_open = false;
                            },
                        ),
                        on_select_item: move |value_type: String| update_attribute_template_modal(
                            modals,
                            modal.id,
                            |attribute_template| {
                                attribute_template.value_type = value_type;
                                attribute_template.is_value_type_menu_open = false;
                            },
                        ),
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "access level" }
                    SingleSelectPicker {
                        disabled: is_readonly || attribute_template.is_saving,
                        empty_text: "Select access level",
                        is_open: attribute_template.is_access_level_menu_open,
                        options: access_level_picker_options,
                        selected_value: attribute_template.access_level_id.to_string(),
                        summary: access_level_summary,
                        on_toggle_open: move |_| update_attribute_template_modal(
                            modals,
                            modal.id,
                            |attribute_template| {
                                attribute_template.is_access_level_menu_open =
                                    !attribute_template.is_access_level_menu_open;
                                attribute_template.is_value_type_menu_open = false;
                            },
                        ),
                        on_select_item: move |access_level_id: String| update_attribute_template_modal(
                            modals,
                            modal.id,
                            |attribute_template| {
                                if let Ok(access_level_id) = access_level_id.parse::<u32>() {
                                    attribute_template.access_level_id = access_level_id;
                                    attribute_template.is_access_level_menu_open = false;
                                }
                            },
                        ),
                    }
                }
            }
            label { onpointerdown: move |event| event.stop_propagation(),
                span { "default value" }
                input {
                    readonly: is_readonly,
                    disabled: attribute_template.is_saving,
                    r#type: "text",
                    value: "{attribute_template.default_value}",
                    oninput: move |event| update_attribute_template_modal(
                        modals,
                        modal.id,
                        |attribute_template| attribute_template.default_value = event.value(),
                    ),
                }
            }
            label {
                class: if is_readonly {
                    "attribute-template-checkbox-label attribute-template-readonly-checkbox"
                } else {
                    "attribute-template-checkbox-label"
                },
                onpointerdown: move |event| event.stop_propagation(),
                input {
                    checked: attribute_template.is_required,
                    disabled: is_readonly || attribute_template.is_saving,
                    readonly: is_readonly,
                    r#type: "checkbox",
                    onchange: move |event| update_attribute_template_modal(
                        modals,
                        modal.id,
                        |attribute_template| attribute_template.is_required = event.checked(),
                    ),
                }
                span { "required" }
            }
            if let Some(error) = &attribute_template.error {
                p { class: "form-error", "{error}" }
            }
            if attribute_template.is_saving {
                p { class: "form-status", "Saving" }
            }
        }
    }
}

fn access_level_options(
    access_levels: &[AccessLevel],
    current_access_level_id: u32,
) -> Vec<AccessLevel> {
    if access_levels.is_empty() {
        return vec![AccessLevel {
            description: String::new(),
            id: current_access_level_id,
            name: current_access_level_id.to_string(),
        }];
    }

    access_levels.to_vec()
}

fn owner_label(attribute_template: &AttributeTemplateModal) -> String {
    attribute_template
        .owner_username
        .clone()
        .or_else(|| {
            attribute_template
                .owner_user_id
                .as_ref()
                .and_then(|owner_user_id| {
                    attribute_template
                        .owner_users
                        .iter()
                        .find(|user| &user.id == owner_user_id)
                        .map(|user| user.username.clone())
                })
        })
        .or_else(|| attribute_template.owner_user_id.clone())
        .unwrap_or_else(|| "Unknown".to_string())
}

fn owner_username_from_id(owner_users: &[User], owner_user_id: &str) -> Option<String> {
    owner_users
        .iter()
        .find(|user| user.id == owner_user_id)
        .map(|user| user.username.clone())
}
