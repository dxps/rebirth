use dioxus::prelude::*;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;

use crate::components::header::Header;
use crate::components::modal::entity::{EntityDetailsModal, EntityDetailsWindow};
use crate::components::modal::ModalLayer;
use crate::types::{
    AccessLevel, AuthSession, Entity, EntityTemplate, OpenModal, Permission, Route, Theme, User,
    FAVICON, MAIN_CSS, WORK_SANS_300_NORMAL, WORK_SANS_400_ITALIC, WORK_SANS_400_NORMAL,
    WORK_SANS_600_NORMAL,
};
use crate::views::audit::AuditView;
use crate::views::data_explorer::{open_entity_details_window, DataExplorerView};
use crate::views::home::HomeView;
use crate::views::login::LoginView;
use crate::views::profile::ProfileView;
use crate::views::security::SecurityView;
use crate::views::templates::TemplatesView;

#[cfg(target_arch = "wasm32")]
const THEME_STORAGE_KEY: &str = "rebirth.theme";
#[cfg(target_arch = "wasm32")]
const AUTH_STORAGE_KEY: &str = "rebirth.auth";

#[cfg(target_arch = "wasm32")]
const FONT_FACE_STYLE_ID: &str = "rebirth-work-sans-fonts";
#[cfg(target_arch = "wasm32")]
const FAVICON_LINK_ID: &str = "rebirth-favicon";
#[cfg(target_arch = "wasm32")]
const MAIN_CSS_LINK_ID: &str = "rebirth-main-css";

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

fn install_head_assets() {
    install_head_assets_value(
        &FAVICON.to_string(),
        &MAIN_CSS.to_string(),
        &WORK_SANS_300_NORMAL.to_string(),
        &WORK_SANS_400_NORMAL.to_string(),
        &WORK_SANS_400_ITALIC.to_string(),
        &WORK_SANS_600_NORMAL.to_string(),
    );
}

#[cfg(target_arch = "wasm32")]
fn install_head_assets_value(
    favicon: &str,
    main_css: &str,
    work_sans_300_normal: &str,
    work_sans_400_normal: &str,
    work_sans_400_italic: &str,
    work_sans_600_normal: &str,
) {
    let Some(document) = web_sys::window().and_then(|window| window.document()) else {
        return;
    };
    let Some(head) = document.head() else {
        return;
    };

    cleanup_legacy_head_assets(&document);

    if document.get_element_by_id(FAVICON_LINK_ID).is_none() {
        if let Ok(link) = document.create_element("link") {
            link.set_id(FAVICON_LINK_ID);
            let _ = link.set_attribute("rel", "icon");
            let _ = link.set_attribute("href", favicon);
            let _ = head.append_child(&link);
        }
    }

    if document.get_element_by_id(MAIN_CSS_LINK_ID).is_none() {
        if let Ok(link) = document.create_element("link") {
            link.set_id(MAIN_CSS_LINK_ID);
            let _ = link.set_attribute("rel", "stylesheet");
            let _ = link.set_attribute("type", "text/css");
            let _ = link.set_attribute("href", main_css);
            let _ = head.append_child(&link);
        }
    }

    if document.get_element_by_id(FONT_FACE_STYLE_ID).is_none() {
        if let Ok(style) = document.create_element("style") {
            style.set_id(FONT_FACE_STYLE_ID);
            style.set_text_content(Some(&format!(
                r#"
@font-face {{
    font-display: swap;
    font-family: "Work Sans";
    font-style: normal;
    font-weight: 300;
    src: url("{work_sans_300_normal}") format("woff2");
}}

@font-face {{
    font-display: swap;
    font-family: "Work Sans";
    font-style: normal;
    font-weight: 400;
    src: url("{work_sans_400_normal}") format("woff2");
}}

@font-face {{
    font-display: swap;
    font-family: "Work Sans";
    font-style: italic;
    font-weight: 400;
    src: url("{work_sans_400_italic}") format("woff2");
}}

@font-face {{
    font-display: swap;
    font-family: "Work Sans";
    font-style: normal;
    font-weight: 600;
    src: url("{work_sans_600_normal}") format("woff2");
}}
"#
            )));
            let _ = head.append_child(&style);
        }
    }
}

#[cfg(target_arch = "wasm32")]
fn cleanup_legacy_head_assets(document: &web_sys::Document) {
    if let Ok(nodes) = document.query_selector_all("style, link") {
        for index in 0..nodes.length() {
            let Some(node) = nodes.item(index) else {
                continue;
            };
            let Some(element) = node.dyn_ref::<web_sys::Element>() else {
                continue;
            };

            if !element.id().is_empty() {
                continue;
            }

            let tag_name = element.tag_name();
            let text = element.text_content().unwrap_or_default();
            let href = element.get_attribute("href").unwrap_or_default();
            let rel = element.get_attribute("rel").unwrap_or_default();
            let is_legacy_font_style =
                tag_name == "STYLE" && text.contains("Work Sans") && text.contains("@font-face");
            let is_legacy_main_css =
                tag_name == "LINK" && rel == "stylesheet" && href.contains("/assets/main-");
            let is_legacy_favicon =
                tag_name == "LINK" && rel == "icon" && href.contains("/assets/favicon-");

            if is_legacy_font_style || is_legacy_main_css || is_legacy_favicon {
                element.remove();
            }
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn install_head_assets_value(
    _favicon: &str,
    _main_css: &str,
    _work_sans_300_normal: &str,
    _work_sans_400_normal: &str,
    _work_sans_400_italic: &str,
    _work_sans_600_normal: &str,
) {
}

#[component]
pub fn App() -> Element {
    let mut theme = use_signal(load_stored_theme);
    let mut route = use_signal(load_initial_route);
    let mut menu_open = use_signal(|| false);
    let mut auth_session = use_signal(load_stored_auth_session);
    let modals = use_signal(Vec::<OpenModal>::new);
    let next_modal_id = use_signal(|| 1_u32);
    let mut data_entities = use_signal(Vec::<Entity>::new);
    let mut data_entity_templates = use_signal(Vec::<EntityTemplate>::new);
    let mut data_access_levels = use_signal(Vec::<AccessLevel>::new);
    let mut data_owner_users = use_signal(Vec::<User>::new);
    let mut entity_details_windows = use_signal(Vec::<EntityDetailsWindow>::new);
    let next_entity_window_id = use_signal(|| 1_u32);
    let mut security_access_levels = use_signal(Vec::<AccessLevel>::new);
    let mut security_users = use_signal(Vec::<User>::new);
    let mut security_permissions = use_signal(Vec::<Permission>::new);
    use_hook(install_head_assets);

    rsx! {
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
                    data_entities.write().clear();
                    data_entity_templates.write().clear();
                    data_access_levels.write().clear();
                    data_owner_users.write().clear();
                    entity_details_windows.write().clear();
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
                        DataExplorerView {
                            auth_session: auth_session(),
                            modals,
                            next_modal_id,
                            entities: data_entities,
                            entity_templates: data_entity_templates,
                            access_levels: data_access_levels,
                            owner_users: data_owner_users,
                            entity_details_windows,
                            next_window_id: next_entity_window_id,
                        }
                    },
                    Route::Templates => rsx! {
                        TemplatesView {
                            auth_session: auth_session(),
                            modals,
                            next_modal_id,
                        }
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
            for window in entity_details_windows.read().iter().cloned() {
                EntityDetailsModal {
                    key: "{window.id}",
                    window: window.clone(),
                    windows: entity_details_windows,
                    auth_session: auth_session(),
                    session_key: auth_session
                        .read()
                        .as_ref()
                        .map(|session| session.session_key.clone())
                        .unwrap_or_default(),
                    access_levels: data_access_levels.read().clone(),
                    entities: data_entities,
                    owner_users: data_owner_users.read().clone(),
                    on_open_entity: move |(entity_id, position)| {
                        let session_key = auth_session
                            .read()
                            .as_ref()
                            .map(|session| session.session_key.clone())
                            .unwrap_or_default();
                        open_entity_details_window(
                            entity_id,
                            entity_details_windows,
                            next_entity_window_id,
                            session_key,
                            position,
                        );
                    },
                }
            }
            ModalLayer { modals }
        }
    }
}
