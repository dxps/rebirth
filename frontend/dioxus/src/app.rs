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

#[component]
pub fn App() -> Element {
    let mut theme = use_signal(|| Theme::Light);
    let mut route = use_signal(|| Route::Home);
    let mut menu_open = use_signal(|| false);
    let mut logged_in = use_signal(|| true);
    let modals = use_signal(Vec::<OpenModal>::new);
    let next_modal_id = use_signal(|| 1_u32);

    rsx! {
        document::Link { rel: "icon", href: FAVICON }
        document::Link { rel: "stylesheet", href: MAIN_CSS }

        div { class: "app-root", "data-theme": "{theme.read().as_str()}",
            Header {
                route: route(),
                theme: theme(),
                menu_open: menu_open(),
                logged_in: logged_in(),
                on_route: move |next| {
                    route.set(next);
                    menu_open.set(false);
                },
                on_toggle_menu: move |_| menu_open.toggle(),
                on_toggle_theme: move |_| {
                    let next = if theme() == Theme::Light { Theme::Dark } else { Theme::Light };
                    theme.set(next);
                    menu_open.set(false);
                },
                on_logout: move |_| {
                    logged_in.set(false);
                    route.set(Route::Home);
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
                                route.set(Route::Home);
                            },
                        }
                    },
                }
            }
            ModalLayer { modals }
        }
    }
}
