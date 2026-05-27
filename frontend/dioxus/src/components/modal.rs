use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{ArrowLeft, Eye, EyeOff, Info, Pencil, Save, Trash2, X};

use crate::types::{
    AccessLevel, AccessLevelModal, AccessLevelResponse, ApiErrorPayload, ApiErrorValue,
    ModalContent, ModalDrag, ModalInteraction, ModalPosition, ModalResize, ModalSize, OpenModal,
    Permission, SecurityModalMode, User, UserModal, UserResponse, API_BASE_URL,
    MODAL_DEFAULT_WIDTH, MODAL_MIN_HEIGHT, MODAL_MIN_WIDTH,
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

pub fn open_user_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    users: Signal<Vec<User>>,
    permissions: Signal<Vec<Permission>>,
    access_levels: Signal<Vec<AccessLevel>>,
    user: Option<User>,
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
    let offset = (id.saturating_sub(1) % 6) as f64 * 28.0;
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
        position: ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
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

fn access_level_modal_title(mode: SecurityModalMode) -> &'static str {
    match mode {
        SecurityModalMode::Create => "Access Level :: New",
        SecurityModalMode::Details => "Access Level",
        SecurityModalMode::Edit => "Access Level :: Edit",
    }
}

fn user_modal_title(mode: SecurityModalMode) -> &'static str {
    match mode {
        SecurityModalMode::Create => "User :: New",
        SecurityModalMode::Details => "User",
        SecurityModalMode::Edit => "User :: Edit",
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

    if mode == SecurityModalMode::Edit {
        focus_element_by_id_after_tick(&format!("access-level-name-{modal_id}-edit"));
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

#[derive(Clone, PartialEq)]
struct MultiSelectOption {
    id: u32,
    label: String,
    tooltip: Option<String>,
}

#[component]
fn MultiSelectPicker(
    disabled: bool,
    empty_text: &'static str,
    is_open: bool,
    on_toggle_item: EventHandler<u32>,
    on_toggle_open: EventHandler<MouseEvent>,
    options: Vec<MultiSelectOption>,
    selected_ids: Vec<u32>,
    summary: String,
) -> Element {
    rsx! {
        span { class: "security-user-permissions-picker",
            button {
                class: "security-user-permissions-trigger",
                "data-empty": if summary.is_empty() { "true" },
                aria_expanded: "{is_open}",
                aria_haspopup: "listbox",
                disabled,
                r#type: "button",
                onclick: move |event| on_toggle_open.call(event),
                span {
                    if summary.is_empty() {
                        "{empty_text}"
                    } else {
                        "{summary}"
                    }
                }
            }
            if is_open {
                div {
                    class: "security-user-permissions-menu",
                    role: "listbox",
                    aria_multiselectable: "true",
                    for option in options {
                        label {
                            key: "{option.id}",
                            class: "security-user-permission-option",
                            "data-tooltip": option.tooltip.as_deref().unwrap_or(""),
                            input {
                                r#type: "checkbox",
                                checked: selected_ids.contains(&option.id),
                                disabled,
                                onchange: move |_| on_toggle_item.call(option.id),
                            }
                            span { "{option.label}" }
                        }
                    }
                }
            }
        }
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

fn focus_element_by_id(id: &str) {
    focus_element_by_id_impl(id);
}

fn focus_element_by_id_after_tick(id: &str) {
    focus_element_by_id_after_tick_impl(id);
}

#[cfg(target_arch = "wasm32")]
fn focus_element_by_id_impl(id: &str) {
    if let Some(element) = web_sys::window()
        .and_then(|window| window.document())
        .and_then(|document| document.get_element_by_id(id))
    {
        if let Some(element) = wasm_bindgen::JsCast::dyn_ref::<web_sys::HtmlElement>(&element) {
            let _ = element.focus();
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn focus_element_by_id_after_tick_impl(id: &str) {
    if let Some(window) = web_sys::window() {
        let id = id.to_string();
        let callback = wasm_bindgen::closure::Closure::once(move || {
            focus_element_by_id(&id);
        });
        let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(
            wasm_bindgen::JsCast::unchecked_ref(callback.as_ref()),
            0,
        );
        callback.forget();
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn focus_element_by_id_impl(_id: &str) {}

#[cfg(not(target_arch = "wasm32"))]
fn focus_element_by_id_after_tick_impl(_id: &str) {}

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
        ModalContent::User(user) => {
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
                                    |user| user.is_info_open = !user.is_info_open,
                                ),
                                Info { class: "app-icon", size: 15 }
                            }
                            if is_info_open {
                                div { class: "entity-id-popover",
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
                                |user| user.is_delete_confirm_open = true,
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
                                    |user| user.is_delete_confirm_open = true,
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
        ModalContent::User(user) => {
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
