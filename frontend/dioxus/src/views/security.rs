use dioxus::prelude::*;

use crate::components::modal::open_modal;
use crate::types::OpenModal;

#[derive(Clone, Copy)]
struct UserRow {
    username: &'static str,
    email: &'static str,
    permissions: &'static str,
    access: &'static str,
}

#[component]
pub fn SecurityView(modals: Signal<Vec<OpenModal>>, next_modal_id: Signal<u32>) -> Element {
    let users = [
        UserRow { username: "admin", email: "admin@rebirth.local", permissions: "Admin, Audit", access: "System" },
        UserRow { username: "editor", email: "editor@rebirth.local", permissions: "Editor", access: "Curated Data" },
        UserRow { username: "viewer", email: "viewer@rebirth.local", permissions: "Viewer", access: "Published Data" },
    ];

    rsx! {
        section { class: "security-view",
            div { class: "section-heading",
                p { "Access Levels" }
                button {
                    class: "section-action-button",
                    onclick: move |_| open_modal(modals, next_modal_id, "Access Level :: New"),
                    "+"
                }
            }
            div { class: "data-table-wrap security-table-wrap",
                table { class: "data-table security-access-levels-table",
                    thead {
                        tr {
                            th { "Name" }
                            th { "Description" }
                            th { class: "data-table-action-heading", "" }
                        }
                    }
                    tbody {
                        for row in [
                            ("System", "Full administrative control."),
                            ("Curated Data", "Can create and update owned knowledge records."),
                            ("Published Data", "Read-only access to released records."),
                        ]
                        {
                            tr { class: "data-table-row",
                                td { "{row.0}" }
                                td { "{row.1}" }
                                td {
                                    button {
                                        class: "icon-only-button",
                                        onclick: move |_| open_modal(modals, next_modal_id, row.0),
                                        "Open"
                                    }
                                }
                            }
                        }
                    }
                }
            }
            div { class: "section-heading security-users-heading",
                p { "Users" }
                button {
                    class: "section-action-button",
                    onclick: move |_| open_modal(modals, next_modal_id, "User :: New"),
                    "+"
                }
            }
            div { class: "data-table-wrap security-table-wrap",
                table { class: "data-table security-users-table",
                    thead {
                        tr {
                            th { "Username" }
                            th { "Email" }
                            th { "Permissions" }
                            th { "Access Levels" }
                            th { class: "data-table-action-heading", "" }
                        }
                    }
                    tbody {
                        for user in users {
                            tr { class: "data-table-row",
                                td { "{user.username}" }
                                td { "{user.email}" }
                                td { "{user.permissions}" }
                                td { "{user.access}" }
                                td {
                                    button {
                                        class: "icon-only-button",
                                        onclick: move |_| open_modal(modals, next_modal_id, user.username),
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
