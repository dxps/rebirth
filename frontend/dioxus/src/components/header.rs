use dioxus::prelude::*;
use lucide_dioxus::{
    Database, House, LogIn, LogOut, Menu, Moon, ScrollText, Shapes, Shield, Sun, User,
};

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
                        RouteIcon { route: item }
                    }
                }
            }

            div { class: "header-actions",
                button {
                    class: "icon-button header-user-button",
                    aria_label: "Open user menu",
                    aria_expanded: "{menu_open}",
                    onclick: move |event| on_toggle_menu.call(event),
                    Menu { class: "app-icon", size: 18 }
                }

                if menu_open {
                    div { class: "user-menu", role: "menu",
                        if logged_in {
                            button {
                                role: "menuitem",
                                onclick: move |_| on_route.call(Route::Profile),
                                User { class: "app-icon", size: 16 }
                                "Profile"
                            }
                            button {
                                role: "menuitem",
                                onclick: move |event| on_logout.call(event),
                                LogOut { class: "app-icon", size: 16 }
                                "Logout"
                            }
                        } else {
                            button {
                                role: "menuitem",
                                onclick: move |_| on_route.call(Route::Login),
                                LogIn { class: "app-icon", size: 16 }
                                "Login"
                            }
                        }
                        button {
                            class: "theme-toggle",
                            role: "menuitem",
                            title: if theme == Theme::Light { "Switch to dark theme" } else { "Switch to light theme" },
                            onclick: move |event| on_toggle_theme.call(event),
                            if theme == Theme::Light {
                                Moon { class: "app-icon", size: 16 }
                            } else {
                                Sun { class: "app-icon", size: 16 }
                            }
                            "Toggle Theme"
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn RouteIcon(route: Route) -> Element {
    rsx! {
        match route {
            Route::Home => rsx! { House { class: "app-icon", size: 18 } },
            Route::DataExplorer => rsx! { Database { class: "app-icon", size: 18 } },
            Route::Templates => rsx! { Shapes { class: "app-icon", size: 18 } },
            Route::Security => rsx! { Shield { class: "app-icon", size: 18 } },
            Route::Audit => rsx! { ScrollText { class: "app-icon", size: 18 } },
            Route::Profile => rsx! { User { class: "app-icon", size: 18 } },
            Route::Login => rsx! { LogIn { class: "app-icon", size: 18 } },
        }
    }
}
