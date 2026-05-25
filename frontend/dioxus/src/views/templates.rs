use dioxus::prelude::*;
use lucide_dioxus::{ExternalLink, Plus};

use crate::components::modal::open_modal;
use crate::types::OpenModal;

#[derive(Clone, Copy, PartialEq)]
struct TemplateRow {
    name: &'static str,
    description: &'static str,
    owner: &'static str,
    details: &'static str,
}

#[component]
pub fn TemplatesView(modals: Signal<Vec<OpenModal>>, next_modal_id: Signal<u32>) -> Element {
    let entity_templates = [
        TemplateRow {
            name: "Researcher",
            description: "People, teams, and organizations that create knowledge.",
            owner: "admin",
            details: "6 attributes, 3 links",
        },
        TemplateRow {
            name: "Document",
            description: "Source material with provenance and version metadata.",
            owner: "editor",
            details: "8 attributes, 2 links",
        },
        TemplateRow {
            name: "Workstream",
            description: "Operational units for ongoing knowledge work.",
            owner: "admin",
            details: "5 attributes, 5 links",
        },
    ];
    let attribute_templates = [
        TemplateRow {
            name: "Title",
            description: "Human readable display name.",
            owner: "admin",
            details: "Text, required",
        },
        TemplateRow {
            name: "Published at",
            description: "Date or timestamp for source publication.",
            owner: "editor",
            details: "DateTime",
        },
        TemplateRow {
            name: "Verified",
            description: "Review state used by knowledge curators.",
            owner: "admin",
            details: "Boolean",
        },
    ];

    rsx! {
        section { class: "types-mgmt-view",
            TemplateSection {
                title: "Entity Templates",
                rows: entity_templates,
                modals,
                next_modal_id,
            }
            TemplateSection {
                title: "Attribute Templates",
                rows: attribute_templates,
                modals,
                next_modal_id,
            }
        }
    }
}

#[component]
fn TemplateSection(
    title: &'static str,
    rows: [TemplateRow; 3],
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: Signal<u32>,
) -> Element {
    rsx! {
        div { class: "types-mgmt-section",
            div { class: "section-heading",
                p { "{title}" }
                button {
                    class: "section-action-button",
                    title: "Create template",
                    aria_label: "Create template",
                    onclick: move |_| open_modal(modals, next_modal_id, "Template :: New"),
                    Plus { class: "app-icon", size: 16 }
                }
            }
            div { class: "data-table-wrap templates-table-wrap",
                table { class: "data-table entity-templates-table",
                    thead {
                        tr {
                            th { "Name" }
                            th { "Description" }
                            th { "Owner" }
                            th { "Details" }
                            th { class: "data-table-action-heading", "" }
                        }
                    }
                    tbody {
                        for row in rows {
                            tr { class: "data-table-row",
                                td { "{row.name}" }
                                td { "{row.description}" }
                                td { "{row.owner}" }
                                td { "{row.details}" }
                                td {
                                    button {
                                        class: "icon-only-button",
                                        title: "Open template",
                                        aria_label: "Open template",
                                        onclick: move |_| open_modal(modals, next_modal_id, row.name),
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
