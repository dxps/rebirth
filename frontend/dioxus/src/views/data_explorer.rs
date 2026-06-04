use dioxus::prelude::*;
use lucide_dioxus::{
    ArrowDownLeft, ArrowUpRight, ClipboardCopy, ListFilter, Plus, RefreshCw, Save, Trash2,
};

use crate::components::modal::entity::{
    fetch_access_levels_list, fetch_entities, fetch_entity, fetch_entity_owners,
    fetch_entity_templates_list, load_saved_views, new_entity_attribute_id, store_saved_views,
    CreateEntityModal, CreateEntitySource, CreateEntityState, EntityDetailsWindow, EntityTab,
};
use crate::components::modal::{modal_position_from_pointer, DeleteConfirmPopover};
use crate::components::single_select_picker::{SingleSelectOption, SingleSelectPicker};
use crate::types::{
    AccessLevel, AuthSession, Entity, EntityAttribute, EntityTemplate, ModalPosition, ModalSize,
    OpenModal, SavedView, User,
};

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

fn has_any_permission(session: &AuthSession, names: &[&str]) -> bool {
    session
        .user
        .permissions
        .iter()
        .any(|p| names.contains(&p.name.as_str()))
}

// ---------------------------------------------------------------------------
// DataExplorerView
// ---------------------------------------------------------------------------

#[component]
pub fn DataExplorerView(
    auth_session: Option<AuthSession>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: Signal<u32>,
    entities: Signal<Vec<Entity>>,
    entity_templates: Signal<Vec<EntityTemplate>>,
    access_levels: Signal<Vec<AccessLevel>>,
    owner_users: Signal<Vec<User>>,
    entity_details_windows: Signal<Vec<EntityDetailsWindow>>,
    next_window_id: Signal<u32>,
) -> Element {
    let is_authenticated = auth_session.is_some();
    let is_authorized = auth_session
        .as_ref()
        .is_some_and(|s| has_any_permission(s, &["Admin", "Editor", "Manage Own Data", "Viewer"]));
    let can_create = auth_session
        .as_ref()
        .is_some_and(|s| has_any_permission(s, &["Admin", "Editor", "Manage Own Data"]));
    let can_assign_owner = auth_session
        .as_ref()
        .is_some_and(|s| has_any_permission(s, &["Admin"]));

    let session_key = auth_session
        .as_ref()
        .filter(|_| is_authorized)
        .map(|s| s.session_key.clone());
    let user_id = auth_session.as_ref().map(|s| s.user.id.clone());

    // Saved views — loaded from localStorage
    let initial_saved_views = user_id.as_deref().map(load_saved_views).unwrap_or_default();
    let mut saved_views = use_signal(move || initial_saved_views);

    // UI state
    let mut search_term = use_signal(String::new);
    let mut selected_view_id = use_signal(String::new);
    let mut is_saved_views_menu_open = use_signal(|| false);
    let mut page = use_signal(|| 1_u32);
    let mut total = use_signal(|| 0_u32);
    let mut is_loading = use_signal(|| is_authorized);
    let mut error = use_signal(|| None::<String>);

    // Create-choice popover
    let mut is_create_choice_open = use_signal(|| false);
    let mut create_choice_source = use_signal(|| CreateEntitySource::Template);
    let mut create_choice_template_id = use_signal(String::new);

    // Create entity modal state
    let mut create_entity_state = use_signal(|| None::<CreateEntityState>);

    // Views management modal
    let mut is_views_modal_open = use_signal(|| false);
    let mut views_modal_selected_id = use_signal(|| None::<String>);
    let mut views_modal_name = use_signal(String::new);
    let mut views_modal_desc = use_signal(String::new);
    let mut views_modal_search = use_signal(String::new);
    let mut views_modal_error = use_signal(|| None::<String>);
    let mut views_modal_initial_position = use_signal(|| ModalPosition { x: 160.0, y: 80.0 });

    // --- Initial load ---
    let mut has_loaded = use_signal(|| false);
    let initial_sk = session_key.clone();
    let initial_can_assign_owner = can_assign_owner;

    use_effect(move || {
        if has_loaded() {
            return;
        }
        has_loaded.set(true);

        if let Some(sk) = initial_sk.clone() {
            let sk2 = sk.clone();
            let sk3 = sk.clone();
            let sk4 = sk.clone();

            spawn(async move {
                if let Ok(templates) = fetch_entity_templates_list(&sk2).await {
                    entity_templates.set(templates);
                }
            });
            spawn(async move {
                if let Ok(levels) = fetch_access_levels_list(&sk3).await {
                    access_levels.set(levels);
                }
            });
            if initial_can_assign_owner {
                spawn(async move {
                    if let Ok(users) = fetch_entity_owners(&sk4).await {
                        owner_users.set(users);
                    }
                });
            }

            load_entities_page(sk, String::new(), 1, entities, total, is_loading, error);
        }
    });

    let current_search = search_term();
    let current_search2 = current_search.clone();
    let current_search3 = current_search.clone();
    let current_search4 = current_search.clone();
    let current_page = page();

    if !is_authorized {
        return rsx! {
            section { class: "types-mgmt-view data-explorer-view",
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

    let sk_search = session_key.clone().unwrap_or_default();
    let sk_search2 = sk_search.clone();
    let sk_page_prev = session_key.clone().unwrap_or_default();
    let sk_page_next = session_key.clone().unwrap_or_default();
    let sk_create_choice = session_key.clone().unwrap_or_default();
    let sk_open_entity = session_key.clone().unwrap_or_default();
    let sk_retry = session_key.clone().unwrap_or_default();
    let create_owner_user_id = user_id.clone().unwrap_or_default();
    let modal_owner_user_id = create_owner_user_id.clone();

    let entity_rows = entities.read().clone();
    let access_level_rows = access_levels.read().clone();
    let template_rows = entity_templates.read().clone();
    let owner_user_rows = owner_users.read().clone();
    let has_template_rows = !template_rows.is_empty();
    let saved_view_rows = saved_views.read().clone();
    let saved_view_options = std::iter::once(SingleSelectOption {
        label: "Views".to_string(),
        value: String::new(),
    })
    .chain(saved_view_rows.iter().map(|view| SingleSelectOption {
        label: view.name.clone(),
        value: view.id.clone(),
    }))
    .collect::<Vec<_>>();
    let selected_view_summary = saved_view_rows
        .iter()
        .find(|view| view.id == selected_view_id())
        .map(|view| view.name.clone())
        .unwrap_or_default();
    let selected_view_tooltip = saved_view_rows
        .iter()
        .find(|view| view.id == selected_view_id())
        .map(|view| {
            if view.description.is_empty() {
                format!("View filter: {}", view.search_text)
            } else {
                view.description.clone()
            }
        })
        .unwrap_or_else(|| {
            "Search through entities' attributes and links names and values".to_string()
        });
    let total_pages = if total() == 0 { 1 } else { (total() + 9) / 10 };
    let uid = user_id.clone().unwrap_or_default();

    rsx! {
        section { class: "types-mgmt-view data-explorer-view",
            div { class: "types-mgmt-section",
                div { class: "section-heading",
                    p { "Entities" }
                    div { class: "entity-search-controls",

                        // Views management button
                        div { class: "entity-views-manage-action",
                            button {
                                class: "entity-views-manage-button",
                                "data-tooltip": "Manage views",
                                aria_label: "Manage data explorer views",
                                onclick: move |event| {
                                    views_modal_initial_position.set(modal_position_from_pointer(&event));
                                    is_views_modal_open.set(!is_views_modal_open());
                                },
                                ListFilter { class: "app-icon", size: 16 }
                            }
                        }

                        // Saved views selector
                        span { class: "entity-view-select-wrap",
                            SingleSelectPicker {
                                disabled: false,
                                empty_text: "Views",
                                is_open: is_saved_views_menu_open(),
                                options: saved_view_options,
                                selected_value: selected_view_id(),
                                summary: selected_view_summary,
                                on_toggle_open: move |_| is_saved_views_menu_open.toggle(),
                                on_select_item: move |val: String| {
                                    if val.is_empty() {
                                        is_saved_views_menu_open.set(false);
                                        selected_view_id.set(String::new());
                                        search_term.set(String::new());
                                        page.set(1);
                                        load_entities_page(
                                            sk_search.clone(),
                                            String::new(),
                                            1,
                                            entities,
                                            total,
                                            is_loading,
                                            error,
                                        );
                                        return;
                                    }
                                    let views = saved_views.read();
                                    if let Some(view) = views.iter().find(|v| v.id == val) {
                                        let new_search = view.search_text.clone();
                                        drop(views);
                                        is_saved_views_menu_open.set(false);
                                        selected_view_id.set(val);
                                        search_term.set(new_search.clone());
                                        page.set(1);
                                        load_entities_page(
                                            sk_search.clone(),
                                            new_search,
                                            1,
                                            entities,
                                            total,
                                            is_loading,
                                            error,
                                        );
                                    } else {
                                        is_saved_views_menu_open.set(false);
                                        selected_view_id.set(String::new());
                                    }
                                },
                            }
                        }

                        // Search input
                        label {
                            class: "entity-search-field",
                            "data-tooltip": "{selected_view_tooltip}",
                            input {
                                r#type: "search",
                                aria_label: "Search entities",
                                placeholder: "Search",
                                value: "{search_term}",
                                oninput: move |event| {
                                    let val = event.value();
                                    selected_view_id.set(String::new());
                                    search_term.set(val.clone());
                                    page.set(1);
                                    let effective = if val.len() >= 3 { val } else { String::new() };
                                    load_entities_page(
                                        sk_search2.clone(),
                                        effective,
                                        1,
                                        entities,
                                        total,
                                        is_loading,
                                        error,
                                    );
                                },
                            }
                        }
                    }
                }

                // Error banner
                if let Some(err_msg) = error() {
                    div { class: "access-level-unavailable", role: "status",
                        p { "{err_msg}" }
                        button {
                            class: "access-level-refresh-button",
                            "data-tooltip": "Try again",
                            aria_label: "Refresh entities",
                            onclick: move |_| {
                                let search = if current_search2.len() >= 3 { current_search2.clone() } else { String::new() };
                                load_entities_page(sk_retry.clone(), search, current_page, entities, total, is_loading, error);
                            },
                            RefreshCw { class: "app-icon", size: 16 }
                        }
                    }
                } else {
                    div { class: "data-table-wrap templates-table-wrap",
                        table { class: "data-table entities-table",
                            colgroup {
                                col { class: "entity-listing-name-column" }
                                col { class: "entity-listing-value-column" }
                            }
                            thead {
                                tr {
                                    th { colspan: "2", class: "data-table-action-heading",
                                        if can_create {
                                            div { class: "entity-create-action",
                                                button {
                                                    class: "section-action-button",
                                                    "data-tooltip": "Create entity",
                                                    aria_label: "Create entity",
                                                    aria_expanded: "{is_create_choice_open()}",
                                                    onclick: move |_| {
                                                        if !has_template_rows {
                                                            create_choice_source.set(CreateEntitySource::Scratch);
                                                        }
                                                        is_create_choice_open.set(!is_create_choice_open());
                                                    },
                                                    Plus { class: "app-icon", size: 16 }
                                                }
                                                if is_create_choice_open() {
                                                    span {
                                                        class: "entity-create-outside-click-layer",
                                                        onclick: move |event| {
                                                            event.stop_propagation();
                                                            is_create_choice_open.set(false);
                                                        },
                                                        onpointerdown: move |event| event.stop_propagation(),
                                                        onpointerup: move |event| event.stop_propagation(),
                                                    }
                                                    CreateChoicePopover {
                                                        entity_templates: template_rows.clone(),
                                                        selected_source: create_choice_source(),
                                                        selected_template_id: create_choice_template_id(),
                                                        on_source_change: move |source| create_choice_source.set(source),
                                                        on_template_change: move |id| create_choice_template_id.set(id),
                                                        on_open_create: move |event| {
                                                            let source = if entity_templates.read().is_empty() {
                                                                CreateEntitySource::Scratch
                                                            } else {
                                                                create_choice_source()
                                                            };
                                                            let tmpl_id = create_choice_template_id();
                                                            let mut listing_attribute_id = String::new();
                                                            let attrs = match &source {
                                                                CreateEntitySource::Template => {
                                                                    entity_templates
                                                                        .read()
                                                                        .iter()
                                                                        .find(|t| t.id == tmpl_id)
                                                                        .map(|t| {
                                                                            let template_listing_attribute_id =
                                                                                t.listing_attribute_id.clone();
                                                                            let mut sorted = t.attributes.clone();
                                                                            sorted.sort_by_key(|a| a.listing_index);
                                                                            let attrs = sorted
                                                                                .into_iter()
                                                                                .map(|ta| {
                                                                                    let id = new_entity_attribute_id();
                                                                                    if ta.id == template_listing_attribute_id {
                                                                                        listing_attribute_id = id.clone();
                                                                                    }
                                                                                    EntityAttribute {
                                                                                        access_level_id: ta.access_level_id,
                                                                                        description: ta.description.clone(),
                                                                                        id,
                                                                                        is_required: ta.is_required,
                                                                                        listing_index: ta.listing_index,
                                                                                        name: ta.name.clone(),
                                                                                        value: String::new(),
                                                                                        value_type: ta.value_type.clone(),
                                                                                    }
                                                                                })
                                                                                .collect::<Vec<_>>();
                                                                            if listing_attribute_id.is_empty() {
                                                                                listing_attribute_id =
                                                                                    attrs.first().map(|a| a.id.clone()).unwrap_or_default();
                                                                            }
                                                                            attrs
                                                                        })
                                                                        .unwrap_or_default()
                                                                }
                                                                CreateEntitySource::Scratch => Vec::new(),
                                                            };
                                                            create_entity_state.set(Some(CreateEntityState {
                                                                source,
                                                                entity_template_id: tmpl_id,
                                                                owner_user_id: create_owner_user_id.clone(),
                                                                attributes: attrs,
                                                                listing_attribute_id,
                                                                error: None,
                                                                is_saving: false,
                                                                active_tab: EntityTab::Attributes,
                                                                open_access_level_menu_id: None,
                                                                open_value_type_menu_id: None,
                                                                is_listing_attribute_menu_open: false,
                                                                is_owner_open: false,
                                                                dragged_attribute_id: None,
                                                                position: modal_position_from_pointer(&event),
                                                            }));
                                                            is_create_choice_open.set(false);
                                                        },
                                                        session_key: sk_create_choice.clone(),
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            tbody {
                                if is_loading() {
                                    for _ in 0..10_u32 {
                                        tr { class: "entities-skeleton-row",
                                            td { colspan: "2",
                                                span { class: "skeleton-cell" }
                                            }
                                        }
                                    }
                                } else if entity_rows.is_empty() {
                                    tr {
                                        td { class: "data-table-empty-cell", colspan: "2",
                                            div { class: "entities-empty-state",
                                                span { "There are no entries" }
                                                button {
                                                    class: "access-level-refresh-button",
                                                    "data-tooltip": "Try again",
                                                    aria_label: "Refresh entities",
                                                    onclick: move |_| {
                                                        let search = if current_search2.len() >= 3 { current_search2.clone() } else { String::new() };
                                                        load_entities_page(sk_retry.clone(), search, current_page, entities, total, is_loading, error);
                                                    },
                                                    RefreshCw { class: "app-icon", size: 16 }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    for entity in entity_rows.iter().cloned() {
                                        EntityTableRow {
                                            key: "{entity.id}",
                                            entity: entity.clone(),
                                            on_open: {
                                                let sk = sk_open_entity.clone();
                                                move |(entity_id, position): (String, ModalPosition)| {
                                                    open_entity_details_window(
                                                        entity_id,
                                                        entity_details_windows,
                                                        next_window_id,
                                                        sk.clone(),
                                                        position,
                                                    );
                                                }
                                            },
                                        }
                                    }
                                }
                            }
                        }

                        if total() > 10 {
                            div { class: "entities-pagination",
                                button {
                                    disabled: current_page <= 1,
                                    onclick: move |_| {
                                        if current_page > 1 {
                                            let next = current_page - 1;
                                            page.set(next);
                                            let search = if current_search3.len() >= 3 { current_search3.clone() } else { String::new() };
                                            load_entities_page(sk_page_prev.clone(), search, next, entities, total, is_loading, error);
                                        }
                                    },
                                    "Previous"
                                }
                                span { "Page {current_page} of {total_pages}" }
                                button {
                                    disabled: current_page >= total_pages,
                                    onclick: move |_| {
                                        if current_page < total_pages {
                                            let next = current_page + 1;
                                            page.set(next);
                                            let search = if current_search4.len() >= 3 { current_search4.clone() } else { String::new() };
                                            load_entities_page(sk_page_next.clone(), search, next, entities, total, is_loading, error);
                                        }
                                    },
                                    "Next"
                                }
                            }
                        }
                    }
                }
            }

            // Create entity modal
            if let Some(state) = create_entity_state() {
                CreateEntityModal {
                    state: state.clone(),
                    create_state: create_entity_state,
                    windows: entity_details_windows,
                    next_window_id,
                    entity_templates: template_rows.clone(),
                    access_levels: access_level_rows.clone(),
                    session_key: session_key.clone().unwrap_or_default(),
                    owner_user_id: modal_owner_user_id.clone(),
                    owner_users: owner_user_rows.clone(),
                    can_assign_owner,
                    entities,
                    position: state.position,
                    size: ModalSize { height: 440.0, width: 640.0 },
                    z_index: 50,
                }
            }

            // Views management modal
            if is_views_modal_open() {
                ViewsManagementModal {
                    saved_views,
                    user_id: uid.clone(),
                    is_open: is_views_modal_open,
                    selected_id: views_modal_selected_id,
                    name_input: views_modal_name,
                    desc_input: views_modal_desc,
                    search_input: views_modal_search,
                    form_error: views_modal_error,
                    current_search: current_search.clone(),
                    initial_position: views_modal_initial_position(),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// EntityTableRow
// ---------------------------------------------------------------------------

#[component]
fn EntityTableRow(entity: Entity, on_open: EventHandler<(String, ModalPosition)>) -> Element {
    let listing_value = entity
        .attributes
        .iter()
        .find(|a| a.id == entity.listing_attribute_id)
        .map(|a| a.value.clone())
        .unwrap_or_default();
    let listing_name = entity
        .attributes
        .iter()
        .find(|a| a.id == entity.listing_attribute_id)
        .map(|a| a.name.clone())
        .unwrap_or_default();

    let outgoing = entity
        .outgoing_links_count
        .unwrap_or_else(|| entity.links.len() as u32);
    let incoming = entity.incoming_links_count.unwrap_or_else(|| {
        entity
            .incoming_links
            .as_ref()
            .map(|l| l.len() as u32)
            .unwrap_or(0)
    });

    let entity_id = entity.id.clone();

    let outgoing_tooltip = format!(
        "{outgoing} outgoing {}",
        if outgoing == 1 { "link" } else { "links" }
    );
    let incoming_tooltip = format!(
        "{incoming} incoming {}",
        if incoming == 1 { "link" } else { "links" }
    );

    rsx! {
        tr {
            class: "data-table-row",
            tabindex: "0",
            role: "button",
            aria_label: "Open entity {listing_value}",
            onclick: move |event| {
                on_open.call((entity_id.clone(), modal_position_from_pointer(&event)))
            },
            td { class: "entity-listing-name-cell",
                span { "{listing_name}" }
            }
            td { class: "entity-listing-value-cell",
                div { class: "entity-listing-value-content",
                    strong { "{listing_value}" }
                    span {
                        class: "entity-link-summary",
                        aria_label: "{outgoing} outgoing links, {incoming} incoming links",
                        span {
                            class: "entity-link-summary-item",
                            "data-tooltip": "{outgoing_tooltip}",
                            ArrowUpRight { size: 13 }
                            span { "{outgoing}" }
                        }
                        span {
                            class: "entity-link-summary-item",
                            "data-tooltip": "{incoming_tooltip}",
                            ArrowDownLeft { size: 13 }
                            span { "{incoming}" }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Create choice popover
// ---------------------------------------------------------------------------

#[component]
fn CreateChoicePopover(
    entity_templates: Vec<EntityTemplate>,
    selected_source: CreateEntitySource,
    selected_template_id: String,
    on_source_change: EventHandler<CreateEntitySource>,
    on_template_change: EventHandler<String>,
    on_open_create: EventHandler<MouseEvent>,
    session_key: String,
) -> Element {
    let has_templates = !entity_templates.is_empty();
    let template_options = entity_templates
        .iter()
        .map(|template| SingleSelectOption {
            label: template.name.clone(),
            value: template.id.clone(),
        })
        .collect::<Vec<_>>();
    let template_summary = entity_templates
        .iter()
        .find(|template| template.id == selected_template_id)
        .map(|template| template.name.clone())
        .unwrap_or_default();
    let mut is_template_menu_open = use_signal(|| false);
    let effective_source = if has_templates {
        selected_source.clone()
    } else {
        CreateEntitySource::Scratch
    };
    let is_template_source = effective_source == CreateEntitySource::Template;
    let can_open = match &effective_source {
        CreateEntitySource::Template => has_templates && !selected_template_id.is_empty(),
        CreateEntitySource::Scratch => true,
    };

    rsx! {
        div {
            class: "include-attribute-popover entity-create-popover",
            role: "dialog",
            aria_label: "Create entity",
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            p { class: "entity-create-popover-title", "Create an entity from:" }
            div { class: "entity-create-radio-group",
                label {
                    "data-tooltip": if has_templates { "" } else { "There is not entity template to select" },
                    input {
                        r#type: "radio",
                        name: "entity-create-source",
                        value: "template",
                        checked: is_template_source,
                        disabled: !has_templates,
                        onchange: move |_| {
                            is_template_menu_open.set(false);
                            on_source_change.call(CreateEntitySource::Template);
                        },
                    }
                    span { "Template" }
                }
                label {
                    input {
                        r#type: "radio",
                        name: "entity-create-source",
                        value: "scratch",
                        checked: !is_template_source,
                        onchange: move |_| {
                            is_template_menu_open.set(false);
                            on_source_change.call(CreateEntitySource::Scratch);
                        },
                    }
                    span { "Scratch" }
                }
            }
            if is_template_source {
                div { class: "entity-create-popover-fields",
                    if is_template_menu_open() {
                        span {
                            class: "entity-create-template-menu-outside-click-layer",
                            onclick: move |event| {
                                event.stop_propagation();
                                is_template_menu_open.set(false);
                            },
                            onpointerdown: move |event| event.stop_propagation(),
                            onpointerup: move |event| event.stop_propagation(),
                        }
                    }
                    label {
                        span { "entity template" }
                        SingleSelectPicker {
                            disabled: !has_templates,
                            empty_text: "Select template",
                            is_open: is_template_menu_open(),
                            options: template_options,
                            selected_value: selected_template_id,
                            summary: template_summary,
                            on_toggle_open: move |_| is_template_menu_open.toggle(),
                            on_select_item: move |template_id: String| {
                                is_template_menu_open.set(false);
                                on_template_change.call(template_id);
                            },
                        }
                    }
                }
            }
            button {
                class: "icon-only-button include-attribute-submit-button entity-create-popover-continue",
                "data-tooltip": "Continue",
                aria_label: "Continue",
                disabled: !can_open,
                onclick: move |event| on_open_create.call(event),
                Plus { class: "app-icon", size: 16 }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Views management modal
// ---------------------------------------------------------------------------

#[component]
fn ViewsManagementModal(
    saved_views: Signal<Vec<SavedView>>,
    user_id: String,
    is_open: Signal<bool>,
    selected_id: Signal<Option<String>>,
    name_input: Signal<String>,
    desc_input: Signal<String>,
    search_input: Signal<String>,
    form_error: Signal<Option<String>>,
    current_search: String,
    initial_position: ModalPosition,
) -> Element {
    let mut position = use_signal(move || initial_position);
    let mut drag_offset = use_signal(|| None::<(f64, f64)>);
    let mut delete_confirm_target = use_signal(|| None::<String>);
    let views = saved_views.read().clone();
    let sel_id = selected_id();
    let current_delete_confirm_target = delete_confirm_target();
    let view_rows = views
        .iter()
        .cloned()
        .map(|view| {
            let confirm_key = format!("list:{}", view.id);
            let is_confirm_open =
                current_delete_confirm_target.as_deref() == Some(confirm_key.as_str());
            (view, confirm_key, is_confirm_open)
        })
        .collect::<Vec<_>>();
    let editor_delete_confirm_key = sel_id.as_ref().map(|id| format!("editor:{id}"));
    let is_editor_delete_confirm_open = editor_delete_confirm_key
        .as_ref()
        .is_some_and(|key| current_delete_confirm_target.as_deref() == Some(key.as_str()));
    let uid = user_id.clone();
    let new_view_current_search = current_search.clone();
    let use_current_search = current_search.clone();
    let modal_position = position();
    let is_dragging = drag_offset().is_some();

    rsx! {
        div {
            class: if is_dragging {
                "draggable-modal-layer data-explorer-views-layer is-dragging"
            } else {
                "draggable-modal-layer data-explorer-views-layer"
            },
            onpointermove: move |event| {
                if let Some((offset_x, offset_y)) = drag_offset() {
                    let point = event.data().client_coordinates();
                    position.set(ModalPosition {
                        x: (point.x - offset_x).max(0.0),
                        y: (point.y - offset_y).max(0.0),
                    });
                }
            },
            onpointerup: move |_| drag_offset.set(None),
            onpointercancel: move |_| drag_offset.set(None),
            div {
            class: if is_dragging { "draggable-modal is-dragging" } else { "draggable-modal" },
            style: "left: {modal_position.x}px; top: {modal_position.y}px; width: 560px; height: 340px; min-width: 400px; min-height: 300px; z-index: 60;",
            div {
                class: "draggable-modal-body",
                onpointerdown: move |event| {
                    event.stop_propagation();
                    let point = event.data().client_coordinates();
                    drag_offset.set(Some((
                        point.x - position().x,
                        point.y - position().y,
                    )));
                },
                div { class: "draggable-modal-header",
                    onpointerdown: move |event| {
                        event.stop_propagation();
                        let point = event.data().client_coordinates();
                        drag_offset.set(Some((
                            point.x - position().x,
                            point.y - position().y,
                        )));
                    },
                    h2 { "Views :: Manage" }
                    div {
                        class: "draggable-modal-titlebar-actions",
                        onclick: move |event| event.stop_propagation(),
                        onpointerdown: move |event| event.stop_propagation(),
                        button {
                            class: "draggable-modal-titlebar-button draggable-modal-close",
                            "data-tooltip": "Close",
                            aria_label: "Close",
                            onclick: move |_| is_open.set(false),
                            lucide_dioxus::X { class: "app-icon", size: 15 }
                        }
                    }
                }
                div {
                    class: "draggable-modal-content data-explorer-views-modal-content",
                    div { class: "entity-template-edit-form data-explorer-views-form",
                        div { class: "data-explorer-views-grid",
                        div {
                            class: "data-explorer-views-list",
                            role: "list",
                            if views.is_empty() {
                                p { class: "data-explorer-views-empty", "No saved views yet" }
                            } else {
                                for (view, list_delete_confirm_key, is_list_delete_confirm_open) in view_rows {
                                    div {
                                        key: "{view.id}",
                                        class: if sel_id.as_deref() == Some(&view.id) {
                                            "data-explorer-view-item is-selected"
                                        } else {
                                            "data-explorer-view-item"
                                        },
                                        role: "listitem",
                                        onpointerdown: move |event| event.stop_propagation(),
                                        button {
                                            class: "data-explorer-view-copy",
                                            onclick: {
                                                let vid = view.id.clone();
                                                let vn = view.name.clone();
                                                let vd = view.description.clone();
                                                let vs = view.search_text.clone();
                                                move |_| {
                                                    selected_id.set(Some(vid.clone()));
                                                    name_input.set(vn.clone());
                                                    desc_input.set(vd.clone());
                                                    search_input.set(vs.clone());
                                                    form_error.set(None);
                                                }
                                            },
                                            strong { "{view.name}" }
                                            if !view.description.is_empty() {
                                                span { "{view.description}" }
                                            }
                                            code { "{view.search_text}" }
                                        }
                                        div { class: "data-explorer-view-actions",
                                            div { class: "draggable-modal-delete-action data-explorer-view-delete-action",
                                            button {
                                                class: "draggable-modal-titlebar-button",
                                                "data-tooltip": if is_list_delete_confirm_open {
                                                    ""
                                                } else {
                                                    "Delete view"
                                                },
                                                aria_label: "Delete saved view",
                                                aria_expanded: "{is_list_delete_confirm_open}",
                                                onclick: {
                                                    let confirm_key = list_delete_confirm_key.clone();
                                                    move |_| {
                                                        delete_confirm_target.set(Some(confirm_key.clone()));
                                                    }
                                                },
                                                Trash2 { class: "app-icon", size: 14 }
                                            }
                                            if is_list_delete_confirm_open {
                                                DeleteConfirmPopover {
                                                    on_cancel: move |_| delete_confirm_target.set(None),
                                                    on_confirm: {
                                                        let uid2 = uid.clone();
                                                        let vid = view.id.clone();
                                                        move |_| {
                                                            delete_confirm_target.set(None);
                                                            delete_saved_view(
                                                                saved_views,
                                                                uid2.clone(),
                                                                vid.clone(),
                                                                selected_id,
                                                                name_input,
                                                                desc_input,
                                                                search_input,
                                                                form_error,
                                                            );
                                                        }
                                                    },
                                                }
                                            }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        div { class: "data-explorer-view-editor",
                            label { onpointerdown: move |event| event.stop_propagation(),
                                span { "Name" }
                                input {
                                    r#type: "text",
                                    value: "{name_input}",
                                    oninput: move |event| {
                                        name_input.set(event.value());
                                        form_error.set(None);
                                    },
                                }
                            }
                            label { onpointerdown: move |event| event.stop_propagation(),
                                span { "Description" }
                                textarea {
                                    value: "{desc_input}",
                                    oninput: move |event| {
                                        desc_input.set(event.value());
                                        form_error.set(None);
                                    },
                                }
                            }
                            label { onpointerdown: move |event| event.stop_propagation(),
                                span { "Search text" }
                                input {
                                    r#type: "text",
                                    value: "{search_input}",
                                    oninput: move |event| {
                                        search_input.set(event.value());
                                        form_error.set(None);
                                    },
                                }
                            }
                            if let Some(message) = form_error() {
                                p { class: "form-error", "{message}" }
                            }
                            div { class: "data-explorer-view-editor-actions",
                                button {
                                    class: "icon-only-button data-explorer-view-editor-action-button",
                                    "data-tooltip": "Use current search",
                                    aria_label: "Use current search",
                                    r#type: "button",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    onclick: move |_| {
                                        search_input.set(use_current_search.clone());
                                        form_error.set(None);
                                    },
                                    ClipboardCopy { class: "app-icon", size: 15 }
                                }
                                if sel_id.is_some() {
                                    div { class: "draggable-modal-delete-action data-explorer-view-editor-delete-action",
                                    button {
                                        class: "icon-only-button data-explorer-view-editor-action-button delete-confirm-danger",
                                        "data-tooltip": if is_editor_delete_confirm_open {
                                            ""
                                        } else {
                                            "Delete"
                                        },
                                        aria_label: "Delete saved view",
                                        aria_expanded: "{is_editor_delete_confirm_open}",
                                        r#type: "button",
                                        onpointerdown: move |event| event.stop_propagation(),
                                        onclick: move |_| {
                                            if let Some(id) = selected_id() {
                                                delete_confirm_target.set(Some(format!("editor:{id}")));
                                            }
                                        },
                                        Trash2 { class: "app-icon", size: 15 }
                                    }
                                    if let Some(id) = sel_id.clone() {
                                        if is_editor_delete_confirm_open {
                                            DeleteConfirmPopover {
                                                on_cancel: move |_| delete_confirm_target.set(None),
                                                on_confirm: {
                                                    let uid2 = uid.clone();
                                                    move |_| {
                                                        delete_confirm_target.set(None);
                                                        delete_saved_view(
                                                            saved_views,
                                                            uid2.clone(),
                                                            id.clone(),
                                                            selected_id,
                                                            name_input,
                                                            desc_input,
                                                            search_input,
                                                            form_error,
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    }
                                }
                                button {
                                    class: "icon-only-button data-explorer-view-editor-action-button",
                                    "data-tooltip": "New saved view",
                                    aria_label: "Add saved view",
                                    r#type: "button",
                                    onpointerdown: move |event| event.stop_propagation(),
                                    onclick: move |_| {
                                        selected_id.set(None);
                                        name_input.set(String::new());
                                        desc_input.set(String::new());
                                        search_input.set(new_view_current_search.clone());
                                        form_error.set(None);
                                    },
                                    Plus { class: "app-icon", size: 15 }
                                }
                                button {
                                    class: "icon-only-button data-explorer-view-editor-action-button",
                                    "data-tooltip": "Save",
                                    aria_label: "Save",
                                    r#type: "button",
                                    disabled: name_input().trim().is_empty(),
                                    onpointerdown: move |event| event.stop_propagation(),
                                    onclick: {
                                        let uid3 = uid.clone();
                                        move |_| {
                                            let name = name_input().trim().to_string();
                                            if name.is_empty() {
                                                form_error.set(Some("Name is required".to_string()));
                                                return;
                                            }
                                            let desc = desc_input().trim().to_string();
                                            let search = search_input().trim().to_string();
                                            if search.is_empty() {
                                                form_error.set(Some("Search filter is required".to_string()));
                                                return;
                                            }
                                            if let Some(id) = selected_id() {
                                                if let Some(v) = saved_views.write().iter_mut().find(|v| v.id == id) {
                                                    v.name = name;
                                                    v.description = desc;
                                                    v.search_text = search;
                                                }
                                            } else {
                                                let new_id = format!("sv-{}", saved_views.read().len() + 1);
                                                saved_views.write().push(SavedView {
                                                    id: new_id.clone(),
                                                    name,
                                                    description: desc,
                                                    search_text: search,
                                                });
                                                selected_id.set(Some(new_id));
                                            }
                                            store_saved_views(&uid3, &saved_views.read());
                                            form_error.set(None);
                                        }
                                    },
                                    Save { class: "app-icon", size: 15 }
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

fn delete_saved_view(
    mut saved_views: Signal<Vec<SavedView>>,
    user_id: String,
    view_id: String,
    mut selected_id: Signal<Option<String>>,
    mut name_input: Signal<String>,
    mut desc_input: Signal<String>,
    mut search_input: Signal<String>,
    mut form_error: Signal<Option<String>>,
) {
    saved_views.write().retain(|view| view.id != view_id);
    store_saved_views(&user_id, &saved_views.read());

    if selected_id().as_deref() == Some(view_id.as_str()) {
        selected_id.set(None);
        name_input.set(String::new());
        desc_input.set(String::new());
        search_input.set(String::new());
    }

    form_error.set(None);
}

// ---------------------------------------------------------------------------
// Load helpers
// ---------------------------------------------------------------------------

fn load_entities_page(
    session_key: String,
    search: String,
    p: u32,
    mut entities: Signal<Vec<Entity>>,
    mut total: Signal<u32>,
    mut is_loading: Signal<bool>,
    mut error: Signal<Option<String>>,
) {
    is_loading.set(true);
    error.set(None);

    spawn(async move {
        match fetch_entities(&session_key, p, &search).await {
            Ok((data, t)) => {
                entities.set(data);
                total.set(t);
                error.set(None);
            }
            Err(message) => {
                error.set(Some(message));
            }
        }
        is_loading.set(false);
    });
}

pub fn open_entity_details_window(
    entity_id: String,
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    mut next_window_id: Signal<u32>,
    session_key: String,
    position: ModalPosition,
) {
    // If already open, just raise it.
    let existing = {
        let wins = windows.read();
        wins.iter()
            .find(|w| w.entity_id == entity_id)
            .map(|w| w.id.clone())
    };
    if let Some(win_id) = existing {
        let next_z = windows.read().iter().map(|w| w.z_index).max().unwrap_or(20) + 1;
        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
            w.z_index = next_z;
        }
        return;
    }

    let id_num = next_window_id();
    let z_index = windows.read().iter().map(|w| w.z_index).max().unwrap_or(20) + 1;
    next_window_id.set(id_num + 1);

    let win_id = format!("entity-window-{id_num}");
    let win_id_async = win_id.clone();

    windows.write().push(EntityDetailsWindow {
        id: win_id.clone(),
        entity_id: entity_id.clone(),
        entity: None,
        active_tab: EntityTab::Attributes,
        error: None,
        is_loading: true,
        is_delete_confirm_open: false,
        is_info_open: false,
        is_owner_open: false,
        is_edit_mode: false,
        z_index,
        position,
        size: ModalSize {
            height: 440.0,
            width: 640.0,
        },
        edit_attributes: Vec::new(),
        edit_links: Vec::new(),
        edit_error: None,
        is_saving: false,
        revealed_attribute_ids: Vec::new(),
        edit_open_access_level_menu_id: None,
        edit_open_value_type_menu_id: None,
        edit_listing_attribute_id: String::new(),
        edit_is_listing_attribute_menu_open: false,
        edit_is_include_attribute_open: false,
        edit_include_attribute_source: None,
        edit_attribute_templates: Vec::new(),
        edit_attribute_templates_error: None,
        edit_is_attribute_templates_loading: false,
        edit_selected_attribute_template_id: None,
        edit_is_attribute_template_menu_open: false,
        edit_owner_user_id: String::new(),
        edit_is_owner_menu_open: false,
        edit_open_link_target_menu_id: None,
        dragged_edit_attribute_id: None,
        dragged_edit_link_id: None,
    });

    spawn(async move {
        match fetch_entity(&session_key, &entity_id).await {
            Ok(entity) => {
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_async) {
                    w.edit_attributes = entity.attributes.clone();
                    w.edit_links = entity.links.clone();
                    w.entity = Some(entity);
                    w.is_loading = false;
                }
            }
            Err(message) => {
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_async) {
                    w.error = Some(message);
                    w.is_loading = false;
                }
            }
        }
    });
}
