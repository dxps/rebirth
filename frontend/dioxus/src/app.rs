use dioxus::prelude::*;

use crate::components::header::Header;
use crate::components::modal::ModalLayer;
use crate::types::{
    AccessLevel, AuthSession, OpenModal, Permission, Route, Theme, User, FAVICON, MAIN_CSS,
    WORK_SANS_300_NORMAL, WORK_SANS_400_ITALIC, WORK_SANS_400_NORMAL, WORK_SANS_600_NORMAL,
};
use crate::views::audit::AuditView;
use crate::views::data_explorer::DataExplorerView;
use crate::views::home::HomeView;
use crate::views::login::LoginView;
use crate::views::profile::ProfileView;
use crate::views::security::SecurityView;
use crate::views::templates::TemplatesView;

#[cfg(target_arch = "wasm32")]
const THEME_STORAGE_KEY: &str = "rebirth.theme";
#[cfg(target_arch = "wasm32")]
const AUTH_STORAGE_KEY: &str = "rebirth.auth";

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

fn load_stored_auth_session() -> Option<AuthSession> {
    load_stored_auth_session_value().and_then(|auth| serde_json::from_str(&auth).ok())
}

#[cfg(target_arch = "wasm32")]
fn load_stored_auth_session_value() -> Option<String> {
    web_sys::window()
        .and_then(|window| window.local_storage().ok().flatten())
        .and_then(|storage| storage.get_item(AUTH_STORAGE_KEY).ok().flatten())
}

#[cfg(not(target_arch = "wasm32"))]
fn load_stored_auth_session_value() -> Option<String> {
    None
}

fn store_auth_session(auth_session: &AuthSession) {
    if let Ok(auth) = serde_json::to_string(auth_session) {
        store_auth_session_value(&auth);
    }
}

#[cfg(target_arch = "wasm32")]
fn store_auth_session_value(auth_session: &str) {
    if let Some(storage) =
        web_sys::window().and_then(|window| window.local_storage().ok().flatten())
    {
        let _ = storage.set_item(AUTH_STORAGE_KEY, auth_session);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn store_auth_session_value(_auth_session: &str) {}

fn clear_stored_auth_session() {
    clear_stored_auth_session_value();
}

#[cfg(target_arch = "wasm32")]
fn clear_stored_auth_session_value() {
    if let Some(storage) =
        web_sys::window().and_then(|window| window.local_storage().ok().flatten())
    {
        let _ = storage.remove_item(AUTH_STORAGE_KEY);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn clear_stored_auth_session_value() {}

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
    let mut auth_session = use_signal(load_stored_auth_session);
    let modals = use_signal(Vec::<OpenModal>::new);
    let next_modal_id = use_signal(|| 1_u32);
    let mut security_access_levels = use_signal(Vec::<AccessLevel>::new);
    let mut security_users = use_signal(Vec::<User>::new);
    let mut security_permissions = use_signal(Vec::<Permission>::new);

    rsx! {
        document::Link { rel: "icon", href: FAVICON }
        document::Style {
            r#"
                @font-face {{
                    font-family: "Work Sans";
                    font-style: normal;
                    font-weight: 300;
                    font-display: swap;
                    src: url("{WORK_SANS_300_NORMAL}") format("woff2");
                }}

                @font-face {{
                    font-family: "Work Sans";
                    font-style: normal;
                    font-weight: 400;
                    font-display: swap;
                    src: url("{WORK_SANS_400_NORMAL}") format("woff2");
                }}

                @font-face {{
                    font-family: "Work Sans";
                    font-style: italic;
                    font-weight: 400;
                    font-display: swap;
                    src: url("{WORK_SANS_400_ITALIC}") format("woff2");
                }}

                @font-face {{
                    font-family: "Work Sans";
                    font-style: normal;
                    font-weight: 600;
                    font-display: swap;
                    src: url("{WORK_SANS_600_NORMAL}") format("woff2");
                }}
            "#
        }
        document::Stylesheet { href: MAIN_CSS }

        div { class: "app-root", "data-theme": "{theme.read().as_str()}",
            Header {
                route: route(),
                theme: theme(),
                menu_open: menu_open(),
                logged_in: auth_session.read().is_some(),
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
                    auth_session.set(None);
                    security_access_levels.write().clear();
                    security_users.write().clear();
                    security_permissions.write().clear();
                    clear_stored_auth_session();
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
                        SecurityView {
                            auth_session: auth_session(),
                            access_levels: security_access_levels,
                            users: security_users,
                            permissions: security_permissions,
                            modals,
                            next_modal_id,
                        }
                    },
                    Route::Audit => rsx! {
                        AuditView { modals, next_modal_id }
                    },
                    Route::Profile => rsx! {
                        ProfileView {
                            auth_session: auth_session(),
                            on_auth_update: move |next_session| {
                                store_auth_session(&next_session);
                                auth_session.set(Some(next_session));
                            },
                        }
                    },
                    Route::Login => rsx! {
                        LoginView {
                            on_login: move |next_session| {
                                store_auth_session(&next_session);
                                auth_session.set(Some(next_session));
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
