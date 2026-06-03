use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{ArrowLeft, Eye, EyeOff, Info, Pencil, Save, Trash2};

use crate::components::multi_select_picker::{MultiSelectOption, MultiSelectPicker};
use crate::types::{
    AccessLevel, ModalContent, ModalInteraction, ModalPosition, ModalSize, OpenModal, Permission,
    SecurityModalMode, User, UserModal, UserResponse, API_BASE_URL,
};

use super::{
    focus_element_by_id, focus_element_by_id_after_tick, json_string, next_modal_z_index,
    read_response_error, DeleteConfirmPopover,
};

pub fn open_user_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    users: Signal<Vec<User>>,
    permissions: Signal<Vec<Permission>>,
    access_levels: Signal<Vec<AccessLevel>>,
    user: Option<User>,
    position: ModalPosition,
) {
    let target_id = user.as_ref().map(|user| user.id.clone());
    let existing_modal_id = {
        let open_modals = modals.read();
        open_modals.iter().find_map(|open_modal| {
            let ModalContent::User(open_user) = &open_modal.content else {
                return None;
            };

            if open_user.id == target_id {
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
    let permission_options = permissions.read().clone();
    let access_level_options = access_levels.read().clone();
    let content = user
        .map(|user| UserModal {
            access_level_ids: user
                .access_levels
                .iter()
                .map(|access_level| access_level.id)
                .collect(),
            access_levels: access_level_options.clone(),
            email: user.email,
            error: None,
            first_name: user.first_name,
            id: Some(user.id),
            is_access_level_menu_open: false,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_password_visible: false,
            is_permission_menu_open: false,
            is_saving: false,
            last_name: user.last_name,
            mode: SecurityModalMode::Details,
            password: String::new(),
            permission_ids: user
                .permissions
                .iter()
                .map(|permission| permission.id)
                .collect(),
            permissions: permission_options.clone(),
            session_key: session_key.clone(),
            username: user.username,
            users,
        })
        .unwrap_or_else(|| {
            let default_permission_id = {
                permission_options
                    .iter()
                    .find(|permission| permission.name == "Viewer")
                    .or_else(|| permission_options.first())
                    .map(|permission| permission.id)
                    .into_iter()
                    .collect()
            };
            let default_access_level_id = {
                access_level_options
                    .iter()
                    .find(|access_level| access_level.name == "Public")
                    .or_else(|| access_level_options.first())
                    .map(|access_level| access_level.id)
                    .into_iter()
                    .collect()
            };

            UserModal {
                access_level_ids: default_access_level_id,
                access_levels: access_level_options,
                email: String::new(),
                error: None,
                first_name: String::new(),
                id: None,
                is_access_level_menu_open: false,
                is_delete_confirm_open: false,
                is_info_open: false,
                is_password_visible: false,
                is_permission_menu_open: false,
                is_saving: false,
                last_name: String::new(),
                mode: SecurityModalMode::Create,
                password: String::new(),
                permission_ids: default_permission_id,
                permissions: permission_options,
                session_key,
                username: String::new(),
                users,
            }
        });

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::User(content.clone()),
        id,
        position,
        size: ModalSize {
            height: if content.mode == SecurityModalMode::Details {
                300.0
            } else {
                400.0
            },
            width: 520.0,
        },
        title: user_modal_title(content.mode).to_string(),
        z_index,
    });
}

fn user_modal_title(mode: SecurityModalMode) -> &'static str {
    match mode {
        SecurityModalMode::Create => "User :: New",
        SecurityModalMode::Details => "User",
        SecurityModalMode::Edit => "User :: Edit",
    }
}

fn set_user_mode(mut modals: Signal<Vec<OpenModal>>, modal_id: u32, mode: SecurityModalMode) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::User(user) = &mut open_modal.content {
            user.mode = mode;
            open_modal.title = user_modal_title(mode).to_string();
        }
    }

    if mode == SecurityModalMode::Edit {
        focus_element_by_id_after_tick(&format!("security-user-first-name-{modal_id}-edit"));
    }
}

fn update_user_modal(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    update: impl FnOnce(&mut UserModal),
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::User(user) = &mut open_modal.content {
            update(user);
        }
    }
}

pub(super) fn close_popovers(user: &mut UserModal) {
    user.is_delete_confirm_open = false;
    user.is_info_open = false;
}

fn is_user_valid(user: &UserModal) -> bool {
    !user.email.trim().is_empty()
        && !user.first_name.trim().is_empty()
        && !user.last_name.trim().is_empty()
        && !user.username.trim().is_empty()
        && !user.permission_ids.is_empty()
        && (user.mode != SecurityModalMode::Create || user.password.len() >= 8)
        && (user.password.is_empty() || user.password.len() >= 8)
}

fn save_user_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::User(mut user) = modal.content.clone() else {
        return;
    };

    if !is_user_valid(&user) {
        let message = if !user.password.is_empty() && user.password.len() < 8 {
            "Password must be at least 8 characters"
        } else {
            "Required fields must be filled"
        };
        update_user_modal(modals, modal.id, |user| {
            user.is_saving = false;
            user.error = Some(message.to_string());
        });
        return;
    }

    update_user_modal(modals, modal.id, |user| {
        user.is_saving = true;
        user.error = None;
    });

    spawn(async move {
        let result = match user.id.clone() {
            Some(id) => update_user_request(&id, &user).await,
            None => create_user_request(&user).await,
        };

        match result {
            Ok(saved_user) => {
                if user.id.is_some() {
                    user.users.write().iter_mut().for_each(|item| {
                        if item.id == saved_user.id {
                            *item = saved_user.clone();
                        }
                    });
                } else {
                    user.users.write().push(saved_user);
                }

                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => update_user_modal(modals, modal.id, |user| {
                user.is_saving = false;
                user.error = Some(message);
            }),
        }
    });
}

fn delete_user_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::User(mut user) = modal.content.clone() else {
        return;
    };
    let Some(id) = user.id.clone() else {
        return;
    };

    update_user_modal(modals, modal.id, |user| {
        user.is_saving = true;
        user.error = None;
    });

    spawn(async move {
        match delete_user_request(&id, &user.session_key).await {
            Ok(()) => {
                user.users.write().retain(|user| user.id != id);
                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => update_user_modal(modals, modal.id, |user| {
                user.is_saving = false;
                user.error = Some(message);
            }),
        }
    });
}

async fn create_user_request(user: &UserModal) -> Result<User, String> {
    let response = Request::post(&format!("{API_BASE_URL}/users"))
        .header("Authorization", &format!("Bearer {}", user.session_key))
        .header("Content-Type", "application/json")
        .body(user_json_body(user, true))
        .map_err(|_| "Unable to create user".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to create user".to_string())?;

    parse_user_response(response, "Unable to create user").await
}

async fn update_user_request(id: &str, user: &UserModal) -> Result<User, String> {
    let response = Request::patch(&format!("{API_BASE_URL}/users/{id}"))
        .header("Authorization", &format!("Bearer {}", user.session_key))
        .header("Content-Type", "application/json")
        .body(user_json_body(user, false))
        .map_err(|_| "Unable to save user".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to save user".to_string())?;

    parse_user_response(response, "Unable to save user").await
}

async fn delete_user_request(id: &str, session_key: &str) -> Result<(), String> {
    let response = Request::delete(&format!("{API_BASE_URL}/users/{id}"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Unable to delete user".to_string())?;

    if response.ok() {
        Ok(())
    } else {
        Err(read_response_error(response, "Unable to delete user").await)
    }
}

async fn parse_user_response(
    response: gloo_net::http::Response,
    fallback: &str,
) -> Result<User, String> {
    if response.ok() {
        response
            .json::<UserResponse>()
            .await
            .map(|payload| payload.data)
            .map_err(|_| fallback.to_string())
    } else {
        Err(read_response_error(response, fallback).await)
    }
}

fn ids_json(ids: &[u32]) -> String {
    format!(
        "[{}]",
        ids.iter().map(u32::to_string).collect::<Vec<_>>().join(",")
    )
}

fn names_from_ids<T>(
    ids: &[u32],
    items: &[T],
    get_id: impl Fn(&T) -> u32,
    get_name: impl Fn(&T) -> &str,
) -> String {
    items
        .iter()
        .filter(|item| ids.contains(&get_id(item)))
        .map(get_name)
        .collect::<Vec<_>>()
        .join(", ")
}

fn toggle_id(ids: &mut Vec<u32>, id: u32) {
    if ids.contains(&id) {
        ids.retain(|current_id| *current_id != id);
    } else {
        ids.push(id);
    }
}

fn user_json_body(user: &UserModal, include_password: bool) -> String {
    let password = if include_password || !user.password.is_empty() {
        format!(",\"password\":{}", json_string(&user.password))
    } else {
        String::new()
    };

    format!(
        "{{\"email\":{},\"firstName\":{},\"lastName\":{},\"username\":{},\"permissionIds\":{},\"accessLevelIds\":{}{}}}",
        json_string(user.email.trim()),
        json_string(user.first_name.trim()),
        json_string(user.last_name.trim()),
        json_string(user.username.trim()),
        ids_json(&user.permission_ids),
        ids_json(&user.access_level_ids),
        password
    )
}

#[component]
pub(super) fn UserTitlebarActions(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
    modal_interaction: Signal<Option<ModalInteraction>>,
) -> Element {
    let ModalContent::User(user) = modal.content.clone() else {
        return rsx! {};
    };

    let modal_id = modal.id;
    let is_details = user.mode == SecurityModalMode::Details;
    let has_id = user.id.is_some();
    let is_info_open = user.is_info_open;
    let is_delete_confirm_open = user.is_delete_confirm_open;
    let is_saving = user.is_saving;
    let is_save_disabled = !is_user_valid(&user);
    let details_delete_modal = modal.clone();
    let edit_delete_modal = modal.clone();
    let save_modal = modal.clone();

    rsx! {
        if is_details {
            if let Some(id) = &user.id {
                div { class: "draggable-modal-info-action",
                    button {
                        class: "draggable-modal-titlebar-button draggable-modal-info-button",
                        "data-tooltip": "Info",
                        aria_label: "Show id",
                        aria_expanded: "{is_info_open}",
                        onclick: move |_| update_user_modal(
                            modals,
                            modal_id,
                            |user| {
                                user.is_info_open = !user.is_info_open;
                                if user.is_info_open {
                                    user.is_delete_confirm_open = false;
                                }
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
                    "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                    aria_label: "Delete user",
                    aria_expanded: "{is_delete_confirm_open}",
                    disabled: is_saving,
                    onclick: move |_| update_user_modal(
                        modals,
                        modal_id,
                        |user| {
                            user.is_delete_confirm_open = true;
                            user.is_info_open = false;
                        },
                    ),
                    Trash2 { class: "app-icon", size: 15 }
                }
                if is_delete_confirm_open {
                    DeleteConfirmPopover {
                        on_cancel: move |_| update_user_modal(
                            modals,
                            modal_id,
                            |user| user.is_delete_confirm_open = false,
                        ),
                        on_confirm: move |_| {
                            modal_interaction.set(None);
                            delete_user_modal(modals, details_delete_modal.clone());
                        },
                    }
                }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Edit",
                aria_label: "Edit user",
                disabled: is_saving,
                onclick: move |_| set_user_mode(modals, modal_id, SecurityModalMode::Edit),
                Pencil { class: "app-icon", size: 15 }
            }
        } else {
            if has_id {
                div { class: "draggable-modal-delete-action",
                    button {
                        class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                        "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                        aria_label: "Delete user",
                        aria_expanded: "{is_delete_confirm_open}",
                        disabled: is_saving,
                        onclick: move |_| update_user_modal(
                            modals,
                            modal_id,
                            |user| {
                                user.is_delete_confirm_open = true;
                                user.is_info_open = false;
                            },
                        ),
                        Trash2 { class: "app-icon", size: 15 }
                    }
                    if is_delete_confirm_open {
                        DeleteConfirmPopover {
                            on_cancel: move |_| update_user_modal(
                                modals,
                                modal_id,
                                |user| user.is_delete_confirm_open = false,
                            ),
                            on_confirm: move |_| {
                                modal_interaction.set(None);
                                delete_user_modal(modals, edit_delete_modal.clone());
                            },
                        }
                    }
                }
                button {
                    class: "draggable-modal-titlebar-button",
                    "data-tooltip": "Back to view",
                    aria_label: "Back to user details",
                    disabled: is_saving,
                    onclick: move |_| set_user_mode(modals, modal_id, SecurityModalMode::Details),
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
                "data-tooltip": if is_save_disabled { "Required fields must be filled" } else { "Save" },
                aria_label: "Save user",
                disabled: is_save_disabled || is_saving,
                onclick: move |_| {
                    if !is_save_disabled {
                        save_user_modal(modals, save_modal.clone());
                    }
                },
                Save { class: "app-icon", size: 15 }
            }
        }
    }
}

#[component]
pub(super) fn UserContentView(modal: OpenModal, modals: Signal<Vec<OpenModal>>) -> Element {
    let ModalContent::User(user) = modal.content.clone() else {
        return rsx! {};
    };

    let is_readonly = user.mode == SecurityModalMode::Details;
    let form_class = if is_readonly {
        "access-level-edit-form security-user-edit-form security-user-details-form"
    } else {
        "access-level-edit-form security-user-edit-form"
    };
    let form_key = match user.mode {
        SecurityModalMode::Create => "create",
        SecurityModalMode::Details => "details",
        SecurityModalMode::Edit => "edit",
    };
    let first_name_input_id = format!("security-user-first-name-{}-{form_key}", modal.id);
    let focus_input_id = first_name_input_id.clone();
    let permissions = user.permissions.clone();
    let access_levels = user.access_levels.clone();
    let permission_summary = names_from_ids(
        &user.permission_ids,
        &permissions,
        |permission| permission.id,
        |permission| permission.name.as_str(),
    );
    let access_level_summary = names_from_ids(
        &user.access_level_ids,
        &access_levels,
        |access_level| access_level.id,
        |access_level| access_level.name.as_str(),
    );
    let permission_options = permissions
        .iter()
        .map(|permission| MultiSelectOption {
            id: permission.id,
            label: permission.name.clone(),
            tooltip: Some(permission.description.clone()),
        })
        .collect::<Vec<_>>();
    let access_level_options = access_levels
        .iter()
        .map(|access_level| MultiSelectOption {
            id: access_level.id,
            label: access_level.name.clone(),
            tooltip: None,
        })
        .collect::<Vec<_>>();

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
            div { class: "security-user-name-row",
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "first name" }
                    input {
                        key: "{modal.id}-{form_key}-first-name",
                        id: "{first_name_input_id}",
                        onmounted: move |event| async move {
                            if !is_readonly {
                                let _ = event.set_focus(true).await;
                            }
                        },
                        readonly: is_readonly,
                        disabled: user.is_saving,
                        value: "{user.first_name}",
                        oninput: move |event| update_user_modal(
                            modals,
                            modal.id,
                            |user| user.first_name = event.value(),
                        ),
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "last name" }
                    input {
                        readonly: is_readonly,
                        disabled: user.is_saving,
                        value: "{user.last_name}",
                        oninput: move |event| update_user_modal(
                            modals,
                            modal.id,
                            |user| user.last_name = event.value(),
                        ),
                    }
                }
            }
            label { onpointerdown: move |event| event.stop_propagation(),
                span { "email" }
                input {
                    readonly: is_readonly,
                    disabled: user.is_saving,
                    r#type: "email",
                    value: "{user.email}",
                    oninput: move |event| update_user_modal(modals, modal.id, |user| user.email = event.value()),
                }
            }
            div { class: "security-user-two-column-row",
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "username" }
                    input {
                        readonly: is_readonly,
                        disabled: user.is_saving,
                        value: "{user.username}",
                        oninput: move |event| update_user_modal(
                            modals,
                            modal.id,
                            |user| user.username = event.value(),
                        ),
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "permissions" }
                    if is_readonly {
                        input {
                            readonly: true,
                            value: "{permission_summary}",
                        }
                    } else {
                        MultiSelectPicker {
                            disabled: user.is_saving,
                            empty_text: "Select permissions",
                            is_open: user.is_permission_menu_open,
                            options: permission_options,
                            selected_ids: user.permission_ids.clone(),
                            summary: permission_summary,
                            on_toggle_open: move |_| update_user_modal(
                                modals,
                                modal.id,
                                |user| {
                                    user.is_permission_menu_open = !user.is_permission_menu_open;
                                    user.is_access_level_menu_open = false;
                                },
                            ),
                            on_toggle_item: move |permission_id| update_user_modal(
                                modals,
                                modal.id,
                                move |user| toggle_id(&mut user.permission_ids, permission_id),
                            ),
                        }
                    }
                }
            }
            label { onpointerdown: move |event| event.stop_propagation(),
                span { "access levels" }
                if is_readonly {
                    input {
                        readonly: true,
                        value: "{access_level_summary}",
                    }
                } else {
                    MultiSelectPicker {
                        disabled: user.is_saving,
                        empty_text: "No access levels",
                        is_open: user.is_access_level_menu_open,
                        options: access_level_options,
                        selected_ids: user.access_level_ids.clone(),
                        summary: access_level_summary,
                        on_toggle_open: move |_| update_user_modal(
                            modals,
                            modal.id,
                            |user| {
                                user.is_access_level_menu_open = !user.is_access_level_menu_open;
                                user.is_permission_menu_open = false;
                            },
                        ),
                        on_toggle_item: move |access_level_id| update_user_modal(
                            modals,
                            modal.id,
                            move |user| toggle_id(&mut user.access_level_ids, access_level_id),
                        ),
                    }
                }
            }
            if !is_readonly {
                label { onpointerdown: move |event| event.stop_propagation(),
                    span {
                        if user.mode == SecurityModalMode::Create {
                            "password"
                        } else {
                            "new password"
                        }
                    }
                    span { class: "security-user-password-wrap",
                        input {
                            disabled: user.is_saving,
                            placeholder: if user.mode == SecurityModalMode::Create { "" } else { "Leave empty to keep current" },
                            r#type: if user.is_password_visible { "text" } else { "password" },
                            value: "{user.password}",
                            oninput: move |event| update_user_modal(
                                modals,
                                modal.id,
                                |user| user.password = event.value(),
                            ),
                        }
                        button {
                            class: "security-user-password-toggle",
                            aria_label: if user.is_password_visible { "Hide password" } else { "Show password" },
                            disabled: user.is_saving,
                            r#type: "button",
                            onclick: move |_| update_user_modal(
                                modals,
                                modal.id,
                                |user| user.is_password_visible = !user.is_password_visible,
                            ),
                            if user.is_password_visible {
                                Eye { class: "app-icon", size: 14 }
                            } else {
                                EyeOff { class: "app-icon", size: 14 }
                            }
                        }
                    }
                }
            }
            if let Some(error) = &user.error {
                p { class: "form-error", "{error}" }
            }
            if user.is_saving {
                p { class: "form-status", "Saving" }
            }
        }
    }
}
