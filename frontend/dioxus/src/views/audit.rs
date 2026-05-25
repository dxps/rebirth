use dioxus::prelude::*;
use lucide_dioxus::{ExternalLink, RefreshCw};

use crate::components::modal::open_modal;
use crate::types::OpenModal;

#[derive(Clone, Copy)]
struct AuditRow {
    event: &'static str,
    actor: &'static str,
    resource: &'static str,
    timestamp: &'static str,
}

#[component]
pub fn AuditView(modals: Signal<Vec<OpenModal>>, next_modal_id: Signal<u32>) -> Element {
    let events = [
        AuditRow {
            event: "entity.updated",
            actor: "editor",
            resource: "Ada Lovelace",
            timestamp: "2026-05-23 11:45",
        },
        AuditRow {
            event: "template.created",
            actor: "admin",
            resource: "Workstream",
            timestamp: "2026-05-23 10:18",
        },
        AuditRow {
            event: "user.login",
            actor: "viewer",
            resource: "session",
            timestamp: "2026-05-23 09:52",
        },
    ];

    rsx! {
        section { class: "types-mgmt-view audit-view",
            div { class: "types-mgmt-section",
                div { class: "section-heading",
                    p { "Audit Events" }
                    button {
                        class: "access-level-refresh-button",
                        title: "Refresh",
                        aria_label: "Refresh audit events",
                        RefreshCw { class: "app-icon", size: 16 }
                    }
                }
                div { class: "data-table-wrap",
                    table { class: "data-table audit-table",
                        thead {
                            tr {
                                th { "Event" }
                                th { "Actor" }
                                th { "Resource" }
                                th { "Timestamp" }
                                th { class: "data-table-action-heading", "" }
                            }
                        }
                        tbody {
                            for event in events {
                                tr { class: "data-table-row",
                                    td { "{event.event}" }
                                    td { "{event.actor}" }
                                    td { "{event.resource}" }
                                    td { "{event.timestamp}" }
                                    td {
                                        button {
                                            class: "icon-only-button",
                                            title: "Open audit event",
                                            aria_label: "Open audit event",
                                            onclick: move |_| open_modal(modals, next_modal_id, event.event),
                                            ExternalLink { class: "app-icon", size: 15 }
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
}
