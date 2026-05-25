use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{KeyRound, Save, Shield, UserRound};

use crate::types::{AuthSession, UpdateUserInfoInput, UserResponse, API_BASE_URL};

#[component]
pub fn ProfileView(
    auth_session: Option<AuthSession>,
    on_auth_update: EventHandler<AuthSession>,
) -> Element {
    let Some(session) = auth_session else {
        return rsx! {
            section { class: "profile-view",
                div { class: "profile-empty",
                    h1 { "Profile" }
                    p { "You need to be authenticated to access this section." }
                }
            }
        };
    };

    let user = session.user.clone();
    let session_key = session.session_key.clone();
    let mut first_name = use_signal(|| user.first_name.clone());
    let mut last_name = use_signal(|| user.last_name.clone());
    let mut email = use_signal(|| user.email.clone());
    let mut username = use_signal(|| user.username.clone());
    let mut current_password = use_signal(String::new);
    let mut new_password = use_signal(String::new);
    let mut user_info_error = use_signal(|| None::<String>);
    let mut user_info_status = use_signal(|| None::<String>);
    let mut is_user_info_submitting = use_signal(|| false);
    let can_update_password =
        !current_password.read().is_empty() && !new_password.read().is_empty();

    rsx! {
        section { class: "profile-view", aria_label: "Profile",
            div { class: "profile-forms",
                form {
                    class: "profile-form",
                    onsubmit: move |event| {
                        event.prevent_default();

                        is_user_info_submitting.set(true);
                        user_info_error.set(None);
                        user_info_status.set(None);

                        let request = UpdateUserInfoInput {
                            email: email.read().trim().to_string(),
                            first_name: first_name.read().trim().to_string(),
                            last_name: last_name.read().trim().to_string(),
                            username: username.read().trim().to_string(),
                        };
                        let bearer = session_key.clone();

                        spawn(async move {
                            let response = Request::put(&format!("{API_BASE_URL}/user/info"))
                                .header("Authorization", &format!("Bearer {bearer}"))
                                .header("Content-Type", "application/json")
                                .json(&request)
                                .map_err(|_| "Unable to build update request.".to_string());

                            let result = match response {
                                Ok(request) => match request.send().await {
                                    Ok(response) if response.ok() => response
                                        .json::<UserResponse>()
                                        .await
                                        .map(|payload| payload.data)
                                        .map_err(|_| "Unable to read updated user.".to_string()),
                                    Ok(_) => Err("Unable to update user info.".to_string()),
                                    Err(_) => Err("Unable to update user info.".to_string()),
                                },
                                Err(message) => Err(message),
                            };

                            is_user_info_submitting.set(false);

                            match result {
                                Ok(updated_user) => {
                                    first_name.set(updated_user.first_name.clone());
                                    last_name.set(updated_user.last_name.clone());
                                    email.set(updated_user.email.clone());
                                    username.set(updated_user.username.clone());
                                    user_info_status.set(Some("User info updated.".to_string()));
                                    on_auth_update.call(AuthSession {
                                        session_key: bearer,
                                        user: updated_user,
                                    });
                                }
                                Err(message) => user_info_error.set(Some(message)),
                            }
                        });
                    },
                    div { class: "profile-form-heading",
                        UserRound { class: "heading-icon", size: 18 }
                        h2 { "User Info" }
                    }
                    div { class: "profile-name-row",
                        label {
                            span { "First name" }
                            input {
                                autocomplete: "given-name",
                                value: "{first_name}",
                                oninput: move |event| first_name.set(event.value()),
                            }
                        }
                        label {
                            span { "Last name" }
                            input {
                                autocomplete: "family-name",
                                value: "{last_name}",
                                oninput: move |event| last_name.set(event.value()),
                            }
                        }
                    }
                    label {
                        span { "Email" }
                        input {
                            autocomplete: "email",
                            r#type: "email",
                            value: "{email}",
                            oninput: move |event| email.set(event.value()),
                        }
                    }
                    label {
                        class: "profile-tooltip-field",
                        "data-tooltip": "Admin user cannot rename its username",
                        span { "Username" }
                        input {
                            value: "{username}",
                            readonly: user.username == "admin",
                            oninput: move |event| username.set(event.value()),
                        }
                    }
                    if let Some(message) = user_info_error() {
                        p { class: "form-error", "{message}" }
                    }
                    if let Some(message) = user_info_status() {
                        p { class: "form-status", "{message}" }
                    }
                    button { r#type: "submit",
                        disabled: is_user_info_submitting(),
                        Save { class: "app-icon", size: 16 }
                        if is_user_info_submitting() {
                            "Updating User Info"
                        } else {
                            "Update User Info"
                        }
                    }
                }
                form {
                    class: "profile-form",
                    onsubmit: move |event| event.prevent_default(),
                    div { class: "profile-form-heading",
                        KeyRound { class: "heading-icon", size: 18 }
                        h2 { "Password" }
                    }
                    label {
                        span { "Current password" }
                        input {
                            autocomplete: "current-password",
                            r#type: "password",
                            value: "{current_password}",
                            oninput: move |event| current_password.set(event.value()),
                        }
                    }
                    label {
                        span { "New password" }
                        input {
                            autocomplete: "new-password",
                            r#type: "password",
                            value: "{new_password}",
                            oninput: move |event| new_password.set(event.value()),
                        }
                    }
                    button {
                        r#type: "submit",
                        disabled: !can_update_password,
                        KeyRound { class: "app-icon", size: 16 }
                        "Update Password"
                    }
                }
                section { class: "profile-form profile-authorization-section",
                    div { class: "profile-form-heading",
                        Shield { class: "heading-icon", size: 18 }
                        h2 { "Authorization" }
                    }
                    label {
                        span { "Permissions" }
                        div { class: "profile-authorization-list",
                            if user.permissions.is_empty() {
                                span { class: "profile-authorization-empty", "None" }
                            } else {
                                for permission in user.permissions.iter() {
                                    span {
                                        key: "{permission.id}",
                                        class: "profile-authorization-item",
                                        "data-tooltip": "{permission.description}",
                                        "{permission.name}"
                                    }
                                }
                            }
                        }
                    }
                    label {
                        span { "Access Levels" }
                        div { class: "profile-authorization-list",
                            if user.access_levels.is_empty() {
                                span { class: "profile-authorization-empty", "None" }
                            } else {
                                for access_level in user.access_levels.iter() {
                                    span {
                                        key: "{access_level.id}",
                                        class: "profile-authorization-item",
                                        "data-tooltip": "{access_level.description}",
                                        "{access_level.name}"
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
