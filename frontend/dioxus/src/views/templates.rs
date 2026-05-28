use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{Plus, RefreshCw};

use crate::components::modal::{open_attribute_template_modal, open_modal};
use crate::types::{
    AccessLevel, AccessLevelsResponse, AttributeTemplate, AttributeTemplatesResponse, AuthSession,
    OpenModal, User, UsersResponse, API_BASE_URL,
};

#[derive(Clone, Copy, PartialEq)]
struct EntityTemplateRow {
    name: &'static str,
    description: &'static str,
}

#[component]
pub fn TemplatesView(
    auth_session: Option<AuthSession>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: Signal<u32>,
) -> Element {
    let is_authenticated = auth_session.is_some();
    let is_authorized = auth_session.as_ref().is_some_and(|session| {
        has_any_permission(session, &["Admin", "Editor", "ManageOwnData", "Viewer"])
    });
    let can_create_managed_data = auth_session
        .as_ref()
        .is_some_and(|session| has_any_permission(session, &["Admin", "Editor", "ManageOwnData"]));
    let can_manage_templates = auth_session
        .as_ref()
        .is_some_and(|session| has_any_permission(session, &["Admin", "Editor"]));
    let can_manage_own_data = auth_session
        .as_ref()
        .is_some_and(|session| has_any_permission(session, &["ManageOwnData"]));
    let current_user_id = auth_session.as_ref().map(|session| session.user.id.clone());
    let session_key = auth_session
        .as_ref()
        .filter(|_| is_authorized)
        .map(|session| session.session_key.clone());
    let initial_session_key = session_key.clone();
    let refresh_session_key = session_key.clone();
    let attribute_templates = use_signal(Vec::<AttributeTemplate>::new);
    let access_levels = use_signal(Vec::<AccessLevel>::new);
    let owner_users = use_signal(Vec::<User>::new);
    let attribute_templates_error = use_signal(|| None::<String>);
    let is_attribute_templates_loading = use_signal(|| is_authorized);
    let mut has_loaded_templates_data = use_signal(|| false);

    use_effect(move || {
        if has_loaded_templates_data() {
            return;
        }

        has_loaded_templates_data.set(true);

        if let Some(session_key) = initial_session_key.clone() {
            load_attribute_templates(
                session_key,
                attribute_templates,
                access_levels,
                owner_users,
                can_manage_templates,
                attribute_templates_error,
                is_attribute_templates_loading,
            );
        }
    });

    if !is_authorized {
        return rsx! {
            section { class: "types-mgmt-view",
                div { class: "access-level-unavailable", role: "status",
                    p {
                        if is_authenticated {
                            "You are not authorized to access this section."
                        } else {
                            "You must be authenticated to access this section."
                        }
                    }
                }
            }
        };
    }

    let entity_templates = [
        EntityTemplateRow {
            name: "Researcher",
            description: "People, teams, and organizations that create knowledge.",
        },
        EntityTemplateRow {
            name: "Document",
            description: "Source material with provenance and version metadata.",
        },
        EntityTemplateRow {
            name: "Workstream",
            description: "Operational units for ongoing knowledge work.",
        },
    ];
    let access_level_rows = access_levels.read().clone();
    let owner_user_rows = owner_users.read().clone();
    let create_session_key = session_key.clone().unwrap_or_default();
    let attribute_template_rows = attribute_templates
        .read()
        .iter()
        .cloned()
        .map(|attribute_template| {
            let can_edit = can_manage_templates
                || (can_manage_own_data
                    && current_user_id
                        .as_ref()
                        .is_some_and(|user_id| user_id == &attribute_template.owner_user_id));

            (attribute_template, can_edit)
        })
        .collect::<Vec<_>>();
    let create_access_level_rows = access_level_rows.clone();
    let create_owner_user_rows = owner_user_rows.clone();
    let create_attribute_session_key = create_session_key.clone();

    rsx! {
        section { class: "types-mgmt-view",
            div { class: "types-mgmt-section",
                div { class: "section-heading",
                    p { "Entity Templates" }
                }
                div { class: "data-table-wrap templates-table-wrap",
                    table { class: "data-table entity-templates-table",
                        thead {
                            tr {
                                th { "name" }
                                th { "description" }
                                th { class: "data-table-action-heading",
                                    if can_create_managed_data {
                                        button {
                                            class: "section-action-button",
                                            "data-tooltip": "Add an entity template",
                                            aria_label: "Create entity template",
                                            onclick: move |_| open_modal(modals, next_modal_id, "Entity Template :: New"),
                                            Plus { class: "app-icon", size: 16 }
                                        }
                                    }
                                }
                            }
                        }
                        tbody {
                            for row in entity_templates {
                                tr {
                                    class: "data-table-row",
                                    tabindex: "0",
                                    onclick: move |_| open_modal(modals, next_modal_id, row.name),
                                    td { "{row.name}" }
                                    td { class: "data-table-muted-cell",
                                        span { class: "empty-value-space", "{row.description}" }
                                    }
                                    td { aria_hidden: "true", "" }
                                }
                            }
                        }
                    }
                }
            }

            div { class: "types-mgmt-section",
                div { class: "section-heading",
                    p { "Attribute Templates" }
                }

                if let Some(message) = attribute_templates_error() {
                    div { class: "access-level-unavailable", role: "status",
                        p { "{message}" }
                        button {
                            class: "access-level-refresh-button",
                            "data-tooltip": "Try again",
                            aria_label: "Refresh attribute templates",
                            onclick: move |_| {
                                if let Some(session_key) = refresh_session_key.clone() {
                                    load_attribute_templates(
                                        session_key,
                                        attribute_templates,
                                        access_levels,
                                        owner_users,
                                        can_manage_templates,
                                        attribute_templates_error,
                                        is_attribute_templates_loading,
                                    );
                                }
                            },
                            RefreshCw { class: "app-icon", size: 16 }
                        }
                    }
                } else {
                    div { class: "data-table-wrap templates-table-wrap",
                        table { class: "data-table attribute-templates-table",
                            thead {
                                tr {
                                    th { "name" }
                                    th { "description" }
                                    th { "value type" }
                                    th { class: "data-table-action-heading",
                                        if can_create_managed_data {
                                            button {
                                            class: "section-action-button",
                                            "data-tooltip": "Add an attribute template",
                                            aria_label: "Create attribute template",
                                                onclick: move |_| open_attribute_template_modal(
                                                    modals,
                                                    next_modal_id,
                                                    create_attribute_session_key.clone(),
                                                    attribute_templates,
                                                    create_access_level_rows.clone(),
                                                    create_owner_user_rows.clone(),
                                                    None,
                                                    can_manage_templates,
                                                    true,
                                                ),
                                                Plus { class: "app-icon", size: 16 }
                                            }
                                        }
                                    }
                                }
                            }
                            tbody {
                                if is_attribute_templates_loading() {
                                    tr {
                                        td { colspan: "4", "Loading attribute templates" }
                                    }
                                } else if attribute_template_rows.is_empty() {
                                    tr {
                                        td { class: "data-table-empty-cell", colspan: "4",
                                            span { "There are no entries" }
                                        }
                                    }
                                } else {
                                    for (attribute_template, can_edit_attribute_template) in attribute_template_rows {
                                        AttributeTemplateTableRow {
                                            key: "{attribute_template.id}",
                                            access_levels: access_level_rows.clone(),
                                            owner_users: owner_user_rows.clone(),
                                            attribute_template,
                                            attribute_templates,
                                            can_assign_owner: can_manage_templates,
                                            can_edit: can_edit_attribute_template,
                                            modals,
                                            next_modal_id,
                                            session_key: create_session_key.clone(),
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
}

#[component]
fn AttributeTemplateTableRow(
    access_levels: Vec<AccessLevel>,
    owner_users: Vec<User>,
    attribute_template: AttributeTemplate,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
    can_assign_owner: bool,
    can_edit: bool,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: Signal<u32>,
    session_key: String,
) -> Element {
    rsx! {
        tr {
            class: "data-table-row",
            tabindex: "0",
            onclick: move |_| open_attribute_template_modal(
                modals,
                next_modal_id,
                session_key.clone(),
                attribute_templates,
                access_levels.clone(),
                owner_users.clone(),
                Some(attribute_template.clone()),
                can_assign_owner,
                can_edit,
            ),
            td { "{attribute_template.name}" }
            AttributeTemplateDescriptionValue {
                description: attribute_template.description.clone(),
            }
            td { "{attribute_template.value_type}" }
            td { aria_hidden: "true", "" }
        }
    }
}

#[component]
fn AttributeTemplateDescriptionValue(description: String) -> Element {
    let trimmed_description = description.trim().to_string();

    rsx! {
        td {
            class: "attribute-template-description-value data-table-muted-cell",
            "data-tooltip": if trimmed_description.len() > 42 { Some(trimmed_description.clone()) } else { None },
            span { class: "empty-value-space", "{trimmed_description}" }
        }
    }
}

fn has_any_permission(session: &AuthSession, names: &[&str]) -> bool {
    session
        .user
        .permissions
        .iter()
        .any(|permission| names.contains(&permission.name.as_str()))
}

fn load_attribute_templates(
    session_key: String,
    mut attribute_templates: Signal<Vec<AttributeTemplate>>,
    mut access_levels: Signal<Vec<AccessLevel>>,
    mut owner_users: Signal<Vec<User>>,
    can_manage_templates: bool,
    mut attribute_templates_error: Signal<Option<String>>,
    mut is_attribute_templates_loading: Signal<bool>,
) {
    is_attribute_templates_loading.set(true);

    spawn(async move {
        let result = fetch_template_data(session_key, can_manage_templates).await;

        match result {
            Ok((mut next_attribute_templates, next_access_levels, next_owner_users)) => {
                next_attribute_templates.sort_by(|left, right| {
                    left.name
                        .to_ascii_lowercase()
                        .cmp(&right.name.to_ascii_lowercase())
                });
                attribute_templates.set(next_attribute_templates);
                access_levels.set(next_access_levels);
                owner_users.set(next_owner_users);
                attribute_templates_error.set(None);
            }
            Err(message) => attribute_templates_error.set(Some(message)),
        }

        is_attribute_templates_loading.set(false);
    });
}

async fn fetch_template_data(
    session_key: String,
    can_manage_templates: bool,
) -> Result<(Vec<AttributeTemplate>, Vec<AccessLevel>, Vec<User>), String> {
    let attribute_templates = fetch_attribute_templates(session_key.clone()).await?;
    let access_levels = fetch_access_levels(session_key.clone()).await?;
    let owner_users = if can_manage_templates {
        fetch_owner_users(session_key).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok((attribute_templates, access_levels, owner_users))
}

async fn fetch_attribute_templates(session_key: String) -> Result<Vec<AttributeTemplate>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/attribute-templates"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<AttributeTemplatesResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

async fn fetch_access_levels(session_key: String) -> Result<Vec<AccessLevel>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/access-levels"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<AccessLevelsResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}

async fn fetch_owner_users(session_key: String) -> Result<Vec<User>, String> {
    let response = Request::get(&format!("{API_BASE_URL}/entity-owners"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .send()
        .await
        .map_err(|_| "Data is unavailable".to_string())?;

    if !response.ok() {
        return Err("Data is unavailable".to_string());
    }

    response
        .json::<UsersResponse>()
        .await
        .map(|payload| payload.data)
        .map_err(|_| "Data is unavailable".to_string())
}
