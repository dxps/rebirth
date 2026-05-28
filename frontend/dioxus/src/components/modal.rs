mod access_level;
mod attribute_template;
mod entity_template;
mod user;

use dioxus::prelude::*;
use lucide_dioxus::{Info, Pencil, Trash2, X};

pub use access_level::open_access_level_modal;
pub use attribute_template::open_attribute_template_modal;
pub use entity_template::open_entity_template_modal;
pub use user::open_user_modal;

use crate::types::{
    ApiErrorPayload, ApiErrorValue, ModalContent, ModalDrag, ModalInteraction, ModalPosition,
    ModalResize, ModalSize, OpenModal, MODAL_DEFAULT_WIDTH, MODAL_MIN_HEIGHT, MODAL_MIN_WIDTH,
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

pub(super) fn next_modal_z_index(modals: &[OpenModal]) -> u32 {
    modals.iter().map(|modal| modal.z_index).max().unwrap_or(20) + 1
}

fn close_modal_popovers(mut modals: Signal<Vec<OpenModal>>, modal_id: u32) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        match &mut open_modal.content {
            ModalContent::AccessLevel(access_level) => access_level::close_popovers(access_level),
            ModalContent::AttributeTemplate(attribute_template) => {
                attribute_template::close_popovers(attribute_template)
            }
            ModalContent::EntityTemplate(entity_template) => {
                entity_template::close_popovers(entity_template)
            }
            ModalContent::User(user) => user::close_popovers(user),
            ModalContent::Generic => {}
        }
    }
}

pub(super) async fn read_response_error(
    response: gloo_net::http::Response,
    fallback: &str,
) -> String {
    response
        .json::<ApiErrorPayload>()
        .await
        .map(|payload| match payload.error {
            ApiErrorValue::Message(message) => message,
            ApiErrorValue::Details { message } => message,
        })
        .unwrap_or_else(|_| fallback.to_string())
}

pub(super) fn json_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
    )
}

pub(super) fn focus_element_by_id(id: &str) {
    focus_element_by_id_impl(id);
}

pub(super) fn focus_element_by_id_after_tick(id: &str) {
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
        ModalContent::AccessLevel(_) => rsx! {
            access_level::AccessLevelTitlebarActions { modal, modals, modal_interaction }
        },
        ModalContent::AttributeTemplate(_) => rsx! {
            attribute_template::AttributeTemplateTitlebarActions { modal, modals, modal_interaction }
        },
        ModalContent::EntityTemplate(_) => rsx! {
            entity_template::EntityTemplateTitlebarActions { modal, modals, modal_interaction }
        },
        ModalContent::User(_) => rsx! {
            user::UserTitlebarActions { modal, modals, modal_interaction }
        },
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
pub(super) fn DeleteConfirmPopover(
    on_cancel: EventHandler<MouseEvent>,
    on_confirm: EventHandler<MouseEvent>,
) -> Element {
    rsx! {
        div {
            class: "delete-confirm-popover",
            role: "dialog",
            aria_label: "Confirm delete access level",
            onclick: move |event| event.stop_propagation(),
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
        ModalContent::AccessLevel(_) => rsx! {
            access_level::AccessLevelContentView { modal, modals }
        },
        ModalContent::AttributeTemplate(_) => rsx! {
            attribute_template::AttributeTemplateContentView { modal, modals }
        },
        ModalContent::EntityTemplate(_) => rsx! {
            entity_template::EntityTemplateContentView { modal, modals }
        },
        ModalContent::User(_) => rsx! {
            user::UserContentView { modal, modals }
        },
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
                            onclick: move |_| close_modal_popovers(modals, modal.id),
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
                                close_modal_popovers(modals, modal.id);
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
                                    onclick: move |event| event.stop_propagation(),
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
