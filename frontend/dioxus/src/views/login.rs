use dioxus::prelude::*;

#[component]
pub fn LoginView(on_login: EventHandler<MouseEvent>) -> Element {
    let mut password_visible = use_signal(|| false);
    let mut identifier = use_signal(String::new);

    rsx! {
        section { class: "login-view", aria_labelledby: "login-title",
            form {
                class: "login-form",
                onsubmit: move |event| {
                    event.prevent_default();
                },
                div { class: "login-heading",
                    span { class: "heading-icon", "L" }
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
                label {
                    span { "Password" }
                    span { class: "security-user-password-wrap login-password-wrap",
                        input {
                            name: "password",
                            autocomplete: "current-password",
                            r#type: if password_visible() { "text" } else { "password" },
                        }
                        button {
                            class: "security-user-password-toggle",
                            r#type: "button",
                            aria_label: if password_visible() { "Hide password" } else { "Show password" },
                            onclick: move |_| password_visible.toggle(),
                            if password_visible() {
                                "Hide"
                            } else {
                                "Show"
                            }
                        }
                    }
                }
                button {
                    r#type: "button",
                    onclick: move |event| on_login.call(event),
                    span { class: "button-icon", "L" }
                    "Login"
                }
            }
        }
    }
}
