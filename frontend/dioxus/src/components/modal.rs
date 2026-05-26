use dioxus::prelude::*;
use lucide_dioxus::{ArrowLeft, Pencil, X};

use crate::types::{
    ModalDrag, ModalInteraction, ModalPosition, ModalResize, ModalSize, OpenModal,
    MODAL_DEFAULT_HEIGHT, MODAL_DEFAULT_WIDTH, MODAL_MIN_HEIGHT, MODAL_MIN_WIDTH,
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
        id,
        position: ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: MODAL_DEFAULT_HEIGHT,
            width: MODAL_DEFAULT_WIDTH,
        },
        title: title.into(),
        z_index,
    });
}

fn next_modal_z_index(modals: &[OpenModal]) -> u32 {
    modals.iter().map(|modal| modal.z_index).max().unwrap_or(20) + 1
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
                            div {
                                class: "draggable-modal-header",
                                h2 { "{modal.title}" }
                                div {
                                    class: "draggable-modal-titlebar-actions",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    button {
                                        class: "draggable-modal-titlebar-button",
                                        title: "Back",
                                        aria_label: "Back",
                                        ArrowLeft { class: "app-icon", size: 15 }
                                    }
                                    button {
                                        class: "draggable-modal-titlebar-button",
                                        title: "Edit",
                                        aria_label: "Edit",
                                        Pencil { class: "app-icon", size: 15 }
                                    }
                                    button {
                                        class: "draggable-modal-titlebar-button draggable-modal-close",
                                        title: "Close",
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
                                div { class: "entity-template-edit-form entity-template-view-form",
                                    label {
                                        onpointerdown: move |event| event.stop_propagation(),
                                        span { "Name" }
                                        input {
                                            value: "{modal.title}",
                                            readonly: true,
                                        }
                                    }
                                    label {
                                        onpointerdown: move |event| event.stop_propagation(),
                                        span { "Description" }
                                        textarea { readonly: true,
                                            "Dioxus modal surface mirroring the draggable editor/detail panels from the TypeScript UI."
                                        }
                                    }
                                    div { class: "entity-template-tabs",
                                        div { class: "entity-template-tab-list",
                                            button { class: "entity-template-tab is-active",
                                                onpointerdown: move |event| event.stop_propagation(),
                                                "Attributes"
                                                span { class: "entity-template-tab-badge",
                                                    "4"
                                                }
                                            }
                                            button { class: "entity-template-tab",
                                                onpointerdown: move |event| event.stop_propagation(),
                                                "Links"
                                                span { class: "entity-template-tab-badge",
                                                    "2"
                                                }
                                            }
                                            button { class: "entity-template-tab",
                                                onpointerdown: move |event| event.stop_propagation(),
                                                "Inlinks"
                                                span { class: "entity-template-tab-badge",
                                                    "1"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        span {
                            class: "draggable-modal-resize",
                            title: "Resize",
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
                            ""
                        }
                    }
                }
            }
        }
    }
}
