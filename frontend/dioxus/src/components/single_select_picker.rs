use dioxus::prelude::*;

#[derive(Clone, PartialEq)]
pub struct SingleSelectOption {
    pub label: String,
    pub value: String,
}

#[component]
pub fn SingleSelectPicker(
    disabled: bool,
    empty_text: String,
    is_open: bool,
    on_select_item: EventHandler<String>,
    on_toggle_open: EventHandler<MouseEvent>,
    options: Vec<SingleSelectOption>,
    selected_value: String,
    summary: String,
) -> Element {
    rsx! {
        span {
            class: "security-user-permissions-picker",
            "data-tooltip": if summary.is_empty() { None } else { Some(summary.clone()) },
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            onpointerup: move |event| event.stop_propagation(),
            if is_open {
                span {
                    class: "single-select-outside-click-layer",
                    onclick: move |event| {
                        event.stop_propagation();
                        on_toggle_open.call(event);
                    },
                    onpointerdown: move |event| event.stop_propagation(),
                    onpointerup: move |event| event.stop_propagation(),
                }
            }
            button {
                class: "security-user-permissions-trigger",
                "data-empty": if summary.is_empty() { "true" },
                aria_expanded: "{is_open}",
                aria_haspopup: "listbox",
                disabled,
                r#type: "button",
                onclick: move |event| {
                    event.stop_propagation();
                    on_toggle_open.call(event);
                },
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
                    aria_multiselectable: "false",
                    onclick: move |event| event.stop_propagation(),
                    onpointerdown: move |event| event.stop_propagation(),
                    onpointerup: move |event| event.stop_propagation(),
                    for option in options {
                        button {
                            key: "{option.value}",
                            class: "security-user-permission-option single-select-option",
                            "aria-selected": "{option.value == selected_value}",
                            r#type: "button",
                            disabled,
                            onclick: move |event| {
                                event.stop_propagation();
                                on_select_item.call(option.value.clone());
                            },
                            span { "{option.label}" }
                        }
                    }
                }
            }
        }
    }
}
