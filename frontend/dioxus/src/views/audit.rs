use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{RefreshCw, X};

use crate::types::{
    AuditEvent, AuditEventsResponse, AuthSession, ModalPosition, ModalSize, API_BASE_URL,
};

const AUDIT_MODAL_MARGIN: f64 = 16.0;
const AUDIT_MODAL_WIDTH: f64 = 540.0;
const AUDIT_MODAL_HEIGHT: f64 = 360.0;
const AUDIT_MODAL_MIN_WIDTH: f64 = 380.0;
const AUDIT_MODAL_MIN_HEIGHT: f64 = 260.0;

#[component]
pub fn AuditView(auth_session: Option<AuthSession>) -> Element {
    let is_authenticated = auth_session.is_some();
    let is_authorized = auth_session
        .as_ref()
        .is_some_and(|session| has_audit_access(session));
    let session_key = auth_session
        .as_ref()
        .filter(|session| has_audit_access(session))
        .map(|session| session.session_key.clone());
    let initial_session_key = session_key.clone();
    let refresh_session_key = session_key.clone();
    let audit_events = use_signal(Vec::<AuditEvent>::new);
    let error = use_signal(|| None::<String>);
    let mut is_loading = use_signal(|| is_authorized);
    let mut has_loaded = use_signal(|| false);
    let mut selected_audit_event = use_signal(|| None::<AuditEvent>);
    let mut selected_audit_event_position = use_signal(|| ModalPosition {
        x: AUDIT_MODAL_MARGIN,
        y: AUDIT_MODAL_MARGIN,
    });

    use_effect(move || {
        if has_loaded() {
            return;
        }

        has_loaded.set(true);

        if let Some(session_key) = initial_session_key.clone() {
            load_audit_events(session_key, audit_events, error, is_loading);
        } else {
            is_loading.set(false);
        }
    });

    if !is_authorized {
        return rsx! {
            section { class: "types-mgmt-view audit-view",
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

    let audit_event_rows = audit_events.read().clone();

    rsx! {
        section { class: "types-mgmt-view audit-view",
            div { class: "types-mgmt-section",
                div { class: "section-heading",
                    p { "Audit" }
                }

                if let Some(message) = error() {
                    div { class: "access-level-unavailable", role: "status",
                        p { "{message}" }
                        button {
                            class: "access-level-refresh-button",
                            "data-tooltip": "Reload the entries",
                            aria_label: "Refresh audit entries",
                            r#type: "button",
                            onclick: move |_| {
                                if let Some(session_key) = refresh_session_key.clone() {
                                    load_audit_events(session_key, audit_events, error, is_loading);
                                }
                            },
                            RefreshCw { class: "app-icon", size: 16 }
                        }
                    }
                } else {
                    div { class: "data-table-wrap audit-table-wrap",
                        table { class: "data-table audit-table",
                            thead {
                                tr {
                                    th { "name" }
                                    th { "content" }
                                    th { "created at" }
                                }
                            }
                            tbody {
                                if is_loading() {
                                    tr {
                                        td { colspan: "3", "Loading audit entries" }
                                    }
                                } else if audit_event_rows.is_empty() {
                                    tr {
                                        td { class: "data-table-empty-cell", colspan: "3",
                                            span { "There are no entries" }
                                        }
                                    }
                                } else {
                                    for event in audit_event_rows {
                                        AuditEventRow {
                                            key: "{event.id}",
                                            event,
                                            on_open: move |(event, position): (AuditEvent, ModalPosition)| {
                                                selected_audit_event.set(Some(event));
                                                selected_audit_event_position.set(position);
                                            },
                                        }
                                    }
                                }
                            }
                        }
                        div { class: "audit-refresh-row",
                            button {
                                class: "access-level-refresh-button",
                                "data-tooltip": "Reload the entries",
                                aria_label: "Refresh audit entries",
                                r#type: "button",
                                onclick: move |_| {
                                    if let Some(session_key) = refresh_session_key.clone() {
                                        load_audit_events(session_key, audit_events, error, is_loading);
                                    }
                                },
                                RefreshCw { class: "app-icon", size: 16 }
                            }
                        }
                    }
                }
            }

            if let Some(event) = selected_audit_event() {
                AuditDetailsModal {
                    key: "{event.id}",
                    event,
                    initial_position: selected_audit_event_position(),
                    on_close: move |_| selected_audit_event.set(None),
                }
            }
        }
    }
}

#[component]
fn AuditEventRow(event: AuditEvent, on_open: EventHandler<(AuditEvent, ModalPosition)>) -> Element {
    let formatted_content = format_audit_content(&event.content);
    let formatted_created_at = format_audit_created_at(&event.created_at);

    rsx! {
        tr {
            class: "data-table-row",
            tabindex: "0",
            role: "button",
            onclick: {
                let event = event.clone();
                move |pointer_event| {
                    on_open.call((
                        event.clone(),
                        audit_modal_position_from_pointer(&pointer_event),
                    ));
                }
            },
            td {
                span { "{event.name}" }
            }
            td {
                span { "{formatted_content}" }
            }
            td {
                span { "{formatted_created_at}" }
            }
        }
    }
}

#[component]
fn AuditDetailsModal(
    event: AuditEvent,
    initial_position: ModalPosition,
    on_close: EventHandler<MouseEvent>,
) -> Element {
    let initial_size = audit_modal_initial_size();
    let mut position = use_signal(move || initial_position);
    let mut size = use_signal(move || initial_size);
    let mut drag_offset = use_signal(|| None::<(f64, f64)>);
    let mut resize_start = use_signal(|| None::<(f64, f64, f64, f64)>);
    let modal_position = position();
    let modal_size = size();
    let is_dragging = drag_offset().is_some();
    let is_resizing = resize_start().is_some();
    let formatted_content = format_audit_content(&event.content);
    let formatted_created_at = format_audit_created_at(&event.created_at);

    rsx! {
        div {
            class: if is_dragging {
                "draggable-modal-layer audit-details-layer is-dragging"
            } else if is_resizing {
                "draggable-modal-layer audit-details-layer is-resizing"
            } else {
                "draggable-modal-layer audit-details-layer"
            },
            style: "z-index: 80;",
            onpointermove: move |pointer_event| {
                let point = pointer_event.data().client_coordinates();

                if let Some((offset_x, offset_y)) = drag_offset() {
                    position.set(ModalPosition {
                        x: (point.x - offset_x).max(0.0),
                        y: (point.y - offset_y).max(0.0),
                    });
                }

                if let Some((start_width, start_height, start_x, start_y)) = resize_start() {
                    let (viewport_width, viewport_height) = viewport_size();
                    let current_position = position();
                    size.set(ModalSize {
                        height: (start_height + point.y - start_y)
                            .clamp(AUDIT_MODAL_MIN_HEIGHT, viewport_height - current_position.y - AUDIT_MODAL_MARGIN),
                        width: (start_width + point.x - start_x)
                            .clamp(AUDIT_MODAL_MIN_WIDTH, viewport_width - current_position.x - AUDIT_MODAL_MARGIN),
                    });
                }
            },
            onpointerup: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
            },
            onpointercancel: move |_| {
                drag_offset.set(None);
                resize_start.set(None);
            },
            div {
                class: if is_dragging {
                    "draggable-modal audit-details-modal is-dragging"
                } else if is_resizing {
                    "draggable-modal audit-details-modal is-resizing"
                } else {
                    "draggable-modal audit-details-modal"
                },
                role: "dialog",
                aria_label: "Audit entry",
                aria_modal: "false",
                style: "left: {modal_position.x}px; top: {modal_position.y}px; width: {modal_size.width}px; height: {modal_size.height}px; min-width: {AUDIT_MODAL_MIN_WIDTH}px; min-height: {AUDIT_MODAL_MIN_HEIGHT}px;",
                div {
                    class: "draggable-modal-body",
                    onpointerdown: move |pointer_event| {
                        pointer_event.stop_propagation();
                        let point = pointer_event.data().client_coordinates();
                        let current_position = position();
                        drag_offset.set(Some((
                            point.x - current_position.x,
                            point.y - current_position.y,
                        )));
                        resize_start.set(None);
                    },
                    div { class: "draggable-modal-header",
                        h2 { "Audit Entry" }
                        div {
                            class: "draggable-modal-titlebar-actions",
                            onclick: move |event| event.stop_propagation(),
                            onpointerdown: move |event| event.stop_propagation(),
                            button {
                                class: "draggable-modal-titlebar-button draggable-modal-close",
                                "data-tooltip": "Close",
                                aria_label: "Close Audit Entry",
                                r#type: "button",
                                onclick: move |event| on_close.call(event),
                                X { class: "app-icon", size: 15 }
                            }
                        }
                    }
                    div {
                        class: "draggable-modal-content audit-details-content",
                        onpointerdown: move |event| event.stop_propagation(),
                        table { class: "audit-details-meta-table",
                            tbody {
                                tr {
                                    th { "id" }
                                    td { "{event.id}" }
                                }
                                tr {
                                    th { "name" }
                                    td { "{event.name}" }
                                }
                                tr {
                                    th { "created at" }
                                    td { "{formatted_created_at}" }
                                }
                            }
                        }
                        div { class: "audit-details-content-block",
                            p { "content" }
                            pre { "{formatted_content}" }
                        }
                    }
                    button {
                        class: "draggable-modal-resize",
                        "data-tooltip": "Resize",
                        aria_label: "Resize Audit Entry",
                        r#type: "button",
                        onpointerdown: move |pointer_event| {
                            pointer_event.stop_propagation();
                            let point = pointer_event.data().client_coordinates();
                            let current_size = size();
                            resize_start.set(Some((
                                current_size.width,
                                current_size.height,
                                point.x,
                                point.y,
                            )));
                            drag_offset.set(None);
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

fn has_audit_access(session: &AuthSession) -> bool {
    session
        .user
        .permissions
        .iter()
        .any(|permission| permission.name == "Admin" || permission.name == "Audit")
}

fn load_audit_events(
    session_key: String,
    mut audit_events: Signal<Vec<AuditEvent>>,
    mut error: Signal<Option<String>>,
    mut is_loading: Signal<bool>,
) {
    is_loading.set(true);

    spawn(async move {
        match fetch_audit_events(session_key).await {
            Ok(next_events) => {
                audit_events.set(next_events);
                error.set(None);
            }
            Err(message) => error.set(Some(message)),
        }

        is_loading.set(false);
    });
}

async fn fetch_audit_events(session_key: String) -> Result<Vec<AuditEvent>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/audit-events"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Audit entries are unavailable".to_string())?;

    if !response.ok() {
        return Err("Audit entries are unavailable".to_string());
    }

    response
        .json::<AuditEventsResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Audit entries are unavailable".to_string())
}

fn format_audit_content(content: &str) -> String {
    serde_json::from_str::<serde_json::Value>(content)
        .and_then(|value| serde_json::to_string_pretty(&value))
        .unwrap_or_else(|_| content.to_string())
}

fn format_audit_created_at(created_at: &str) -> String {
    let trimmed = created_at.trim();

    if trimmed.is_empty() {
        return String::new();
    }

    let without_timezone = trimmed.trim_end_matches('Z');
    let without_fraction = without_timezone
        .split_once('.')
        .map(|(prefix, _)| prefix)
        .unwrap_or(without_timezone);

    without_fraction.replace('T', " ")
}

fn audit_modal_initial_size() -> ModalSize {
    let (viewport_width, viewport_height) = viewport_size();

    ModalSize {
        height: AUDIT_MODAL_HEIGHT.min(viewport_height - AUDIT_MODAL_MARGIN * 2.0),
        width: AUDIT_MODAL_WIDTH.min(viewport_width - AUDIT_MODAL_MARGIN * 2.0),
    }
}

fn audit_modal_position_from_pointer(event: &MouseEvent) -> ModalPosition {
    let point = event.data().client_coordinates();
    let (viewport_width, viewport_height) = viewport_size();
    let modal_size = audit_modal_initial_size();

    ModalPosition {
        x: (point.x - modal_size.width * 0.3).clamp(
            AUDIT_MODAL_MARGIN,
            viewport_width - modal_size.width - AUDIT_MODAL_MARGIN,
        ),
        y: (point.y - 48.0).clamp(
            AUDIT_MODAL_MARGIN,
            viewport_height - modal_size.height - AUDIT_MODAL_MARGIN,
        ),
    }
}

#[cfg(target_arch = "wasm32")]
fn viewport_size() -> (f64, f64) {
    web_sys::window()
        .and_then(|window| {
            Some((
                window.inner_width().ok()?.as_f64()?,
                window.inner_height().ok()?.as_f64()?,
            ))
        })
        .unwrap_or((1280.0, 720.0))
}

#[cfg(not(target_arch = "wasm32"))]
fn viewport_size() -> (f64, f64) {
    (1280.0, 720.0)
}
