use dioxus::prelude::*;

use crate::types::LOGO;

#[component]
pub fn HomeView() -> Element {
    rsx! {
        section { class: "intro",
            img { class: "home-logo", src: LOGO, alt: "" }
            h1 { class: "striped-title", "Rebirth" }
            p { "An ontology simplified knowledge system" }
        }
    }
}
