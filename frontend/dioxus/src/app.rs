use dioxus::prelude::*;

use crate::components::header::Header;
use crate::components::modal::ModalLayer;
use crate::types::{OpenModal, Route, Theme, FAVICON, MAIN_CSS};
use crate::views::audit::AuditView;
use crate::views::data_explorer::DataExplorerView;
use crate::views::home::HomeView;
use crate::views::login::LoginView;
use crate::views::profile::ProfileView;
use crate::views::security::SecurityView;
use crate::views::templates::TemplatesView;

#[cfg(target_arch = "wasm32")]
const THEME_STORAGE_KEY: &str = "rebirth.theme";

fn load_stored_theme() -> Theme {
    load_stored_theme_value()
        .and_then(|theme| Theme::from_str(&theme))
        .unwrap_or(Theme::Light)
}

#[cfg(target_arch = "wasm32")]
fn load_stored_theme_value() -> Option<String> {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| storage.get_item(THEME_STORAGE_KEY).ok().flatten())
}

#[cfg(not(target_arch = "wasm32"))]
fn load_stored_theme_value() -> Option<String> {
    None
}

fn store_theme(theme: Theme) {
    store_theme_value(theme.as_str());
}

#[cfg(target_arch = "wasm32")]
fn store_theme_value(theme: &str) {
    if let Some(storage) =
        web_sys::window().and_then(|window| window.local_storage().ok().flatten())
    {
        let _ = storage.set_item(THEME_STORAGE_KEY, theme);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn store_theme_value(_theme: &str) {}

fn load_initial_route() -> Route {
    Route::from_path(current_path().as_deref().unwrap_or("/"))
}

#[cfg(target_arch = "wasm32")]
fn current_path() -> Option<String> {
    web_sys::window()
        .and_then(|window| window.location().pathname().ok())
        .filter(|path| !path.is_empty())
}

#[cfg(not(target_arch = "wasm32"))]
fn current_path() -> Option<String> {
    None
}

fn navigate_to(route: Route, current_route: &mut Signal<Route>) {
    current_route.set(route);
    push_route_path(route);
}

#[cfg(target_arch = "wasm32")]
fn push_route_path(route: Route) {
    if let Some(window) = web_sys::window() {
        let next_path = route.path();
        if window.location().pathname().ok().as_deref() != Some(next_path) {
            if let Ok(history) = window.history() {
                let _ =
                    history.push_state_with_url(&wasm_bindgen::JsValue::NULL, "", Some(next_path));
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn push_route_path(_route: Route) {}

#[component]
pub fn App() -> Element {
    let mut theme = use_signal(load_stored_theme);
    let mut route = use_signal(load_initial_route);
    let mut menu_open = use_signal(|| false);
    let mut logged_in = use_signal(|| true);
    let modals = use_signal(Vec::<OpenModal>::new);
    let next_modal_id = use_signal(|| 1_u32);

    rsx! {
        document::Link { rel: "icon", href: FAVICON }
        document::Stylesheet { href: MAIN_CSS }

        div { class: "app-root", "data-theme": "{theme.read().as_str()}",
            Header {
                route: route(),
                theme: theme(),
                menu_open: menu_open(),
                logged_in: logged_in(),
                on_route: move |next| {
                    navigate_to(next, &mut route);
                    menu_open.set(false);
                },
                on_toggle_menu: move |_| menu_open.toggle(),
                on_toggle_theme: move |_| {
                    let next = if theme() == Theme::Light { Theme::Dark } else { Theme::Light };
                    theme.set(next);
                    store_theme(next);
                    menu_open.set(false);
                },
                on_logout: move |_| {
                    logged_in.set(false);
                    navigate_to(Route::Home, &mut route);
                    menu_open.set(false);
                },
            }
            main { class: "app-shell",
                match route() {
                    Route::Home => rsx! {
                        HomeView {}
                    },
                    Route::DataExplorer => rsx! {
                        DataExplorerView { modals, next_modal_id }
                    },
                    Route::Templates => rsx! {
                        TemplatesView { modals, next_modal_id }
                    },
                    Route::Security => rsx! {
                        SecurityView { modals, next_modal_id }
                    },
                    Route::Audit => rsx! {
                        AuditView { modals, next_modal_id }
                    },
                    Route::Profile => rsx! {
                        ProfileView { logged_in: logged_in() }
                    },
                    Route::Login => rsx! {
                        LoginView {
                            on_login: move |_| {
                                logged_in.set(true);
                                navigate_to(Route::Home, &mut route);
                            },
                        }
                    },
                }
            }
            ModalLayer { modals }
        }
    }
}
