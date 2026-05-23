use dioxus::prelude::*;

use crate::components::modal::open_modal;
use crate::types::OpenModal;

#[derive(Clone, Copy)]
struct EntityRow {
    name: &'static str,
    value: &'static str,
    template: &'static str,
    outgoing: usize,
    incoming: usize,
}

#[component]
pub fn DataExplorerView(modals: Signal<Vec<OpenModal>>, next_modal_id: Signal<u32>) -> Element {
    let entities = [
        EntityRow { name: "Person", value: "Ada Lovelace", template: "Researcher", outgoing: 4, incoming: 2 },
        EntityRow { name: "Concept", value: "Analytical Engine", template: "Machine", outgoing: 2, incoming: 6 },
        EntityRow { name: "Archive", value: "Notes on Menabrea", template: "Document", outgoing: 3, incoming: 1 },
        EntityRow { name: "Project", value: "Ontology migration", template: "Workstream", outgoing: 8, incoming: 3 },
    ];

    rsx! {
        section { class: "data-explorer-view",
            div { class: "section-heading",
                p { "Data Explorer" }
                div { class: "entity-search-controls",
                    button { class: "entity-views-manage-button", "Views" }
                    input {
                        class: "entity-search-field",
                        placeholder: "Search entities",
                    }
                    button {
                        class: "section-action-button",
                        title: "Create entity",
                        onclick: move |_| open_modal(modals, next_modal_id, "Entity :: New"),
                        "+"
                    }
                }
            }
            div { class: "data-table-wrap",
                table { class: "data-table entities-table",
                    thead {
                        tr {
                            th { "Listing" }
                            th { "Value" }
                            th { "Template" }
                            th { "Links" }
                            th { class: "data-table-action-heading", "" }
                        }
                    }
                    tbody {
                        for entity in entities {
                            tr { class: "data-table-row",
                                td { class: "entity-listing-name-cell", "{entity.name}" }
                                td { class: "entity-listing-value-cell", "{entity.value}" }
                                td { "{entity.template}" }
                                td {
                                    span { class: "entity-link-summary", "{entity.outgoing} out" }
                                    span { class: "entity-link-summary", "{entity.incoming} in" }
                                }
                                td {
                                    button {
                                        class: "icon-only-button",
                                        title: "Open entity",
                                        onclick: move |_| open_modal(modals, next_modal_id, entity.value),
                                        "Open"
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
