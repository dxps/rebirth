use dioxus::prelude::*;
use lucide_dioxus::{Shield, User};

#[component]
pub fn ProfileView(logged_in: bool) -> Element {
    if !logged_in {
        return rsx! {
            section { class: "profile-empty",
                h1 { "Profile unavailable" }
                p { "Login to see account details and authorization assignments." }
            }
        };
    }

    rsx! {
        section { class: "profile-view",
            div { class: "profile-heading",
                h1 { "Profile" }
                p { "Personal details and effective authorization for the current session." }
            }
            div { class: "profile-forms",
                form { class: "profile-form",
                    div { class: "profile-form-heading",
                        User { class: "heading-icon", size: 18 }
                        h2 { "User Info" }
                    }
                    div { class: "profile-name-row",
                        label {
                            span { "First name" }
                            input { value: "Ada", readonly: true }
                        }
                        label {
                            span { "Last name" }
                            input { value: "Lovelace", readonly: true }
                        }
                    }
                    label {
                        span { "Username" }
                        input { value: "ada", readonly: true }
                    }
                    label {
                        span { "Email" }
                        input { value: "ada@rebirth.local", readonly: true }
                    }
                }
                form { class: "profile-form",
                    div { class: "profile-form-heading",
                        Shield { class: "heading-icon", size: 18 }
                        h2 { "Authorization" }
                    }
                    div { class: "profile-authorization-list",
                        span { class: "profile-authorization-item", "Editor" }
                        span { class: "profile-authorization-item", "Audit" }
                        span { class: "profile-authorization-item", "Curated Data" }
                    }
                }
            }
        }
    }
}
