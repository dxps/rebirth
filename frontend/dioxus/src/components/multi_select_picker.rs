use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
pub struct MultiSelectOption {
    pub id: u32,
    pub label: String,
    pub tooltip: Option<String>,
}

#[component]
pub fn MultiSelectPicker(
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
