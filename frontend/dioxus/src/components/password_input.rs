use dioxus::prelude::*;
use lucide_dioxus::{Eye, EyeOff};

#[component]
pub fn PasswordInput(
    label: &'static str,
    name: &'static str,
    autocomplete: &'static str,
    value: String,
    on_change: EventHandler<String>,
) -> Element {
    let mut is_visible = use_signal(|| false);

    rsx! {
        label {
            span { "{label}" }
            div { class: "password-input-wrap",
                input {
                    name: "{name}",
                    autocomplete: "{autocomplete}",
                    r#type: if is_visible() { "text" } else { "password" },
                    value: "{value}",
                    oninput: move |event| on_change.call(event.value()),
                }
                button {
                    class: "password-input-toggle",
                    r#type: "button",
                    aria_label: if is_visible() { "Hide password" } else { "Show password" },
                    "data-tooltip": if is_visible() { "Hide password" } else { "Show password" },
                    onclick: move |_| is_visible.toggle(),
                    if is_visible() {
                        Eye { class: "app-icon", size: 16 }
                    } else {
                        EyeOff { class: "app-icon", size: 16 }
                    }
                }
            }
        }
    }
}
