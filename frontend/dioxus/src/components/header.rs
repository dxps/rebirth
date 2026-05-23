use dioxus::prelude::*;

use crate::types::{Route, Theme, LOGO};

#[component]
pub fn Header(
    route: Route,
    theme: Theme,
    menu_open: bool,
    logged_in: bool,
    on_route: EventHandler<Route>,
    on_toggle_menu: EventHandler<MouseEvent>,
    on_toggle_theme: EventHandler<MouseEvent>,
    on_logout: EventHandler<MouseEvent>,
) -> Element {
    rsx! {
        header { class: "app-header",
            button {
                class: "brand",
                aria_label: "Rebirth home",
                onclick: move |_| on_route.call(Route::Home),
                img { src: LOGO, alt: "" }
            }

            nav { class: "header-nav", aria_label: "Primary navigation",
                for item in [Route::Home, Route::DataExplorer, Route::Templates, Route::Security, Route::Audit] {
                    button {
                        class: if route == item { "header-nav-link is-active" } else { "header-nav-link" },
                        title: "{item.label()}",
                        aria_label: "{item.label()}",
                        onclick: move |_| on_route.call(item),
                        span { class: "nav-icon", "{item.icon()}" }
                    }
                }
            }

            div { class: "header-actions",
                button {
                    class: "icon-button header-user-button",
                    aria_label: "Open user menu",
                    aria_expanded: "{menu_open}",
                    onclick: move |event| on_toggle_menu.call(event),
                    span { class: "menu-lines", "" }
                }

                if menu_open {
                    div { class: "user-menu", role: "menu",
                        if logged_in {
                            button {
                                role: "menuitem",
                                onclick: move |_| on_route.call(Route::Profile),
                                span { class: "menu-icon", "U" }
                                "Profile"
                            }
                            button {
                                role: "menuitem",
                                onclick: move |event| on_logout.call(event),
                                span { class: "menu-icon", "O" }
                                "Logout"
                            }
                        } else {
                            button {
                                role: "menuitem",
                                onclick: move |_| on_route.call(Route::Login),
                                span { class: "menu-icon", "L" }
                                "Login"
                            }
                        }
                        button {
                            class: "theme-toggle",
                            role: "menuitem",
                            title: if theme == Theme::Light { "Switch to dark theme" } else { "Switch to light theme" },
                            onclick: move |event| on_toggle_theme.call(event),
                            span { class: "menu-icon",
                                if theme == Theme::Light {
                                    "M"
                                } else {
                                    "S"
                                }
                            }
                            "Toggle Theme"
                        }
                    }
                }
            }
        }
    }
}
