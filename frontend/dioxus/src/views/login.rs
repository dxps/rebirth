use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::LogIn;

use crate::components::password_input::PasswordInput;
use crate::types::{AuthSession, LoginInput, LoginResponse, API_BASE_URL};

#[component]
pub fn LoginView(on_login: EventHandler<AuthSession>) -> Element {
    let mut identifier = use_signal(String::new);
    let mut password = use_signal(String::new);
    let mut error = use_signal(|| None::<String>);
    let mut is_submitting = use_signal(|| false);

    rsx! {
        section { class: "login-view", aria_labelledby: "login-title",
            form {
                class: "login-form",
                onsubmit: move |event| {
                    event.prevent_default();
                    let login_identifier = identifier.read().trim().to_string();
                    let login_password = password();

                    if login_identifier.is_empty() || login_password.is_empty() {
                        error.set(Some("Username and password are required.".to_string()));
                        return;
                    }

                    is_submitting.set(true);
                    error.set(None);

                    spawn(async move {
                        let request = LoginInput {
                            identifier: login_identifier,
                            password: login_password,
                        };

                        let response = Request::post(&format!("{API_BASE_URL}/auth/login"))
                            .header("Content-Type", "application/json")
                            .json(&request)
                            .map_err(|_| "Unable to build login request.".to_string());

                        let result = match response {
                            Ok(request) => match request.send().await {
                                Ok(response) if response.ok() => response
                                    .json::<LoginResponse>()
                                    .await
                                    .map(|payload| payload.data)
                                    .map_err(|_| "Unable to read login response.".to_string()),
                                Ok(_) => Err("Invalid username or password.".to_string()),
                                Err(_) => Err("Unable to login.".to_string()),
                            },
                            Err(message) => Err(message),
                        };

                        is_submitting.set(false);

                        match result {
                            Ok(session) => on_login.call(session),
                            Err(message) => error.set(Some(message)),
                        }
                    });
                },
                div { class: "login-heading",
                    LogIn { class: "heading-icon", size: 18 }
                    h1 { id: "login-title", "Login" }
                }
                label {
                    span { "Username or email" }
                    input {
                        name: "username",
                        autocomplete: "username",
                        value: "{identifier}",
                        oninput: move |event| identifier.set(event.value()),
                    }
                }
                PasswordInput {
                    label: "Password",
                    name: "password",
                    autocomplete: "current-password",
                    disabled: false,
                    placeholder: "",
                    value: password(),
                    on_change: move |value| password.set(value),
                }
                if let Some(message) = error() {
                    p { class: "form-error", "{message}" }
                }
                button {
                    r#type: "submit",
                    disabled: is_submitting(),
                    LogIn { class: "app-icon", size: 16 }
                    if is_submitting() {
                        "Logging in"
                    } else {
                        "Login"
                    }
                }
            }
        }
    }
}
