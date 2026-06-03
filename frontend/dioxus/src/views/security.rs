use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{Plus, RefreshCw};

use crate::components::modal::{
    modal_position_from_pointer, open_access_level_modal, open_user_modal,
};
use crate::types::{
    AccessLevel, AccessLevelsResponse, AuthSession, OpenModal, Permission, PermissionsResponse,
    User, UsersResponse, API_BASE_URL,
};

#[component]
pub fn SecurityView(
    auth_session: Option<AuthSession>,
    access_levels: Signal<Vec<AccessLevel>>,
    users: Signal<Vec<User>>,
    permissions: Signal<Vec<Permission>>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: Signal<u32>,
) -> Element {
    let is_authenticated = auth_session.is_some();
    let is_authorized = auth_session
        .as_ref()
        .is_some_and(|session| has_admin_permission(session));
    let session_key = auth_session
        .as_ref()
        .filter(|session| has_admin_permission(session))
        .map(|session| session.session_key.clone());
    let initial_session_key = session_key.clone();
    let access_refresh_session_key = session_key.clone();
    let users_refresh_session_key = session_key.clone();
    let access_levels_error = use_signal(|| None::<String>);
    let users_error = use_signal(|| None::<String>);
    let is_access_levels_loading = use_signal(|| is_authorized);
    let is_users_loading = use_signal(|| is_authorized);
    let mut has_loaded_security_data = use_signal(|| false);

    use_effect(move || {
        if has_loaded_security_data() {
            return;
        }

        has_loaded_security_data.set(true);

        if let Some(session_key) = initial_session_key.clone() {
            load_access_levels(
                session_key.clone(),
                access_levels,
                access_levels_error,
                is_access_levels_loading,
            );
            load_users_and_permissions(
                session_key,
                users,
                permissions,
                users_error,
                is_users_loading,
            );
        }
    });

    if !is_authorized {
        return rsx! {
            section { class: "security-view",
                div { class: "access-level-unavailable", role: "status",
                    p {
                        if is_authenticated {
                            "You are not authorized to access this section."
                        } else {
                            "You must be authenticated to access this section."
                        }
                    }
                }
            }
        };
    }

    let access_level_modal_session_key = session_key.clone().unwrap_or_default();
    let access_level_create_session_key = access_level_modal_session_key.clone();
    let access_level_rows = access_levels
        .read()
        .iter()
        .cloned()
        .map(|access_level| (access_level, access_level_modal_session_key.clone()))
        .collect::<Vec<_>>();
    let user_modal_session_key = session_key.clone().unwrap_or_default();
    let user_create_session_key = user_modal_session_key.clone();
    let user_rows = users
        .read()
        .iter()
        .cloned()
        .map(|user| (user, user_modal_session_key.clone()))
        .collect::<Vec<_>>();

    rsx! {
        section { class: "security-view",
            div { class: "section-heading",
                p { "Access Levels" }
            }

            if let Some(message) = access_levels_error() {
                div { class: "access-level-unavailable", role: "status",
                    p { "{message}" }
                    button {
                        class: "access-level-refresh-button",
                        "data-tooltip": "Try again",
                        aria_label: "Refresh access levels",
                        onclick: move |_| {
                            if let Some(session_key) = access_refresh_session_key.clone() {
                                load_access_levels(
                                    session_key,
                                    access_levels,
                                    access_levels_error,
                                    is_access_levels_loading,
                                );
                            }
                        },
                        RefreshCw { class: "app-icon", size: 16 }
                    }
                }
            } else {
                div { class: "data-table-wrap security-table-wrap",
                    table { class: "data-table security-access-levels-table",
                        thead {
                            tr {
                                th { "name" }
                                th { "description" }
                                th { class: "data-table-action-heading",
                                    button {
                                        class: "section-action-button",
                                        "data-tooltip": "Add an access level",
                                        aria_label: "Create access level",
                                        onclick: move |event| open_access_level_modal(
                                            modals,
                                            next_modal_id,
                                            access_level_create_session_key.clone(),
                                            access_levels,
                                            None,
                                            modal_position_from_pointer(&event),
                                        ),
                                        Plus { class: "app-icon", size: 16 }
                                    }
                                }
                            }
                        }
                        tbody {
                            if is_access_levels_loading() {
                                tr {
                                    td { colspan: "3", "Loading access levels" }
                                }
                            } else if access_level_rows.is_empty() {
                                tr {
                                    td { class: "data-table-empty-cell", colspan: "3",
                                        span { "There are no entries" }
                                    }
                                }
                            } else {
                                for (access_level, row_session_key) in access_level_rows {
                                    tr {
                                        key: "{access_level.id}",
                                        class: "data-table-row",
                                        tabindex: "0",
                                        onclick: move |event| open_access_level_modal(
                                            modals,
                                            next_modal_id,
                                            row_session_key.clone(),
                                            access_levels,
                                            Some(access_level.clone()),
                                            modal_position_from_pointer(&event),
                                        ),
                                        td { "{access_level.name}" }
                                        td { class: "data-table-muted-cell", "{access_level.description}" }
                                        td { aria_hidden: "true", "" }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            div { class: "section-heading security-users-heading",
                p { "Users" }
            }

            if let Some(message) = users_error() {
                div { class: "access-level-unavailable", role: "status",
                    p { "{message}" }
                    button {
                        class: "access-level-refresh-button",
                        "data-tooltip": "Try again",
                        aria_label: "Refresh users",
                        onclick: move |_| {
                            if let Some(session_key) = users_refresh_session_key.clone() {
                                load_users_and_permissions(
                                    session_key,
                                    users,
                                    permissions,
                                    users_error,
                                    is_users_loading,
                                );
                            }
                        },
                        RefreshCw { class: "app-icon", size: 16 }
                    }
                }
            } else {
                div { class: "data-table-wrap security-table-wrap",
                    table { class: "data-table security-users-table",
                        thead {
                            tr {
                                th { class: "security-users-username-column", "username" }
                                th { class: "security-users-email-column", "email" }
                                th { class: "security-users-permissions-column", "permissions" }
                                th { class: "security-users-access-levels-column", "access levels" }
                                th { class: "data-table-action-heading",
                                    button {
                                        class: "section-action-button",
                                        "data-tooltip": "Add a user",
                                        aria_label: "Create user",
                                        onclick: move |event| open_user_modal(
                                            modals,
                                            next_modal_id,
                                            user_create_session_key.clone(),
                                            users,
                                            permissions,
                                            access_levels,
                                            None,
                                            modal_position_from_pointer(&event),
                                        ),
                                        Plus { class: "app-icon", size: 16 }
                                    }
                                }
                            }
                        }
                        tbody {
                            if is_users_loading() {
                                tr {
                                    td { colspan: "5", "Loading users" }
                                }
                            } else if user_rows.is_empty() {
                                tr {
                                    td { class: "data-table-empty-cell", colspan: "5",
                                        span { "There are no entries" }
                                    }
                                }
                            } else {
                                for (user, row_session_key) in user_rows {
                                    tr {
                                        key: "{user.id}",
                                        class: "data-table-row",
                                        tabindex: "0",
                                        onclick: move |event| open_user_modal(
                                            modals,
                                            next_modal_id,
                                            row_session_key.clone(),
                                            users,
                                            permissions,
                                            access_levels,
                                            Some(user.clone()),
                                            modal_position_from_pointer(&event),
                                        ),
                                        td { "{user.username}" }
                                        td { class: "data-table-muted-cell", "{user.email}" }
                                        td { "{permission_names(&user)}" }
                                        td { "{access_level_names(&user)}" }
                                        td { aria_hidden: "true", "" }
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

fn has_admin_permission(session: &AuthSession) -> bool {
    session
        .user
        .permissions
        .iter()
        .any(|permission| permission.name == "Admin")
}

fn load_access_levels(
    session_key: String,
    mut access_levels: Signal<Vec<AccessLevel>>,
    mut access_levels_error: Signal<Option<String>>,
    mut is_access_levels_loading: Signal<bool>,
) {
    is_access_levels_loading.set(true);

    spawn(async move {
        let result = fetch_access_levels(session_key).await;

        match result {
            Ok(next_access_levels) => {
                access_levels.set(next_access_levels);
                access_levels_error.set(None);
            }
            Err(message) => access_levels_error.set(Some(message)),
        }

        is_access_levels_loading.set(false);
    });
}

async fn fetch_access_levels(session_key: String) -> Result<Vec<AccessLevel>, String> {
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

fn load_users_and_permissions(
    session_key: String,
    mut users: Signal<Vec<User>>,
    mut permissions: Signal<Vec<Permission>>,
    mut users_error: Signal<Option<String>>,
    mut is_users_loading: Signal<bool>,
) {
    is_users_loading.set(true);

    spawn(async move {
        let result = fetch_users_and_permissions(session_key).await;

        match result {
            Ok((next_users, next_permissions)) => {
                users.set(
                    next_users
                        .into_iter()
                        .filter(|user| user.username != "admin")
                        .collect(),
                );
                permissions.set(next_permissions);
                users_error.set(None);
            }
            Err(message) => users_error.set(Some(message)),
        }

        is_users_loading.set(false);
    });
}

async fn fetch_users_and_permissions(
    session_key: String,
) -> Result<(Vec<User>, Vec<Permission>), String> {
    let permissions_response = Request::get(&format!("{API_BASE_URL}/permissions"))
        .send()
        .await
        .map_err(|_| "Unable to load permissions".to_string())?;

    if !permissions_response.ok() {
        return Err("Unable to load permissions".to_string());
    }

    let users_response = Request::get(&format!("{API_BASE_URL}/users"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Users are unavailable".to_string())?;

    if !users_response.ok() {
        return Err(match users_response.status() {
            401 | 403 => "Admin permission is required to manage users".to_string(),
            _ => "Unable to load users".to_string(),
        });
    }

    let permissions = permissions_response
        .json::<PermissionsResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Unable to load permissions".to_string())?;
    let users = users_response
        .json::<UsersResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Users are unavailable".to_string())?;

    Ok((users, permissions))
}

fn permission_names(user: &User) -> String {
    user.permissions
        .iter()
        .map(|permission| permission.name.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}

fn access_level_names(user: &User) -> String {
    user.access_levels
        .iter()
        .map(|access_level| access_level.name.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
