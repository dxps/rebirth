use dioxus::prelude::*;
use lucide_dioxus::{ArrowDownLeft, ArrowUpRight, ListFilter, Plus};

use crate::components::modal::entity::{
    load_saved_views, store_saved_views, CreateEntityModal, CreateEntitySource, CreateEntityState,
    EntityDetailsModal, EntityDetailsWindow, EntityTab,
    fetch_access_levels_list, fetch_entities, fetch_entity, fetch_entity_owners,
    fetch_entity_templates_list,
};
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
) -> Element {
    let is_authenticated = auth_session.is_some();
    let is_authorized = auth_session
        .as_ref()
        .is_some_and(|s| has_any_permission(s, &["Admin", "Editor", "ManageOwnData", "Viewer"]));
    let can_create = auth_session
        .as_ref()
        .is_some_and(|s| has_any_permission(s, &["Admin", "Editor", "ManageOwnData"]));

    let session_key = auth_session
        .as_ref()
        .filter(|_| is_authorized)
        .map(|s| s.session_key.clone());
    let user_id = auth_session.as_ref().map(|s| s.user.id.clone());

    // Core data
    let mut entities = use_signal(Vec::<Entity>::new);
    let mut entity_templates = use_signal(Vec::<EntityTemplate>::new);
    let mut access_levels = use_signal(Vec::<AccessLevel>::new);
    let mut owner_users = use_signal(Vec::<User>::new);

    // Saved views — loaded from localStorage
    let initial_saved_views = user_id
        .as_deref()
        .map(load_saved_views)
        .unwrap_or_default();
    let mut saved_views = use_signal(move || initial_saved_views);

    // UI state
    let mut search_term = use_signal(String::new);
    let mut page = use_signal(|| 1_u32);
    let mut total = use_signal(|| 0_u32);
    let mut is_loading = use_signal(|| is_authorized);
    let mut error = use_signal(|| None::<String>);

    // Entity details windows
    let mut entity_details_windows = use_signal(Vec::<EntityDetailsWindow>::new);
    let mut next_window_id = use_signal(|| 1_u32);

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

    // --- Initial load ---
    let mut has_loaded = use_signal(|| false);
    let initial_sk = session_key.clone();

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
            spawn(async move {
                if let Ok(users) = fetch_entity_owners(&sk4).await {
                    owner_users.set(users);
                }
            });

            load_entities_page(
                sk,
                String::new(),
                1,
                entities,
                total,
                is_loading,
                error,
            );
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

    let entity_rows = entities.read().clone();
    let access_level_rows = access_levels.read().clone();
    let template_rows = entity_templates.read().clone();
    let saved_view_rows = saved_views.read().clone();
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
                                "data-tooltip": "Manage saved views",
                                aria_label: "Manage saved views",
                                onclick: move |_| is_views_modal_open.set(!is_views_modal_open()),
                                ListFilter { class: "app-icon", size: 16 }
                            }
                        }

                        // Saved views selector
                        select {
                            class: "entity-saved-views-select",
                            onchange: move |event| {
                                let val = event.value();
                                let views = saved_views.read();
                                if let Some(view) = views.iter().find(|v| v.id == val) {
                                    let new_search = view.search_text.clone();
                                    drop(views);
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
                                }
                            },
                            option { value: "", "— views —" }
                            for view in saved_view_rows.iter() {
                                option { key: "{view.id}", value: "{view.id}", "{view.name}" }
                            }
                        }

                        // Search input
                        label { class: "entity-search-field",
                            input {
                                r#type: "search",
                                placeholder: "Search entities (min 3 chars)",
                                value: "{search_term}",
                                oninput: move |event| {
                                    let val = event.value();
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

                        // Create button + popover
                        if can_create {
                            div { class: "entity-create-action",
                                button {
                                    class: "section-action-button",
                                    "data-tooltip": "Create entity",
                                    aria_label: "Create entity",
                                    aria_expanded: "{is_create_choice_open()}",
                                    onclick: move |_| is_create_choice_open.set(!is_create_choice_open()),
                                    Plus { class: "app-icon", size: 16 }
                                }
                                if is_create_choice_open() {
                                    CreateChoicePopover {
                                        entity_templates: template_rows.clone(),
                                        selected_source: create_choice_source(),
                                        selected_template_id: create_choice_template_id(),
                                        on_close: move |_| is_create_choice_open.set(false),
                                        on_source_change: move |source| create_choice_source.set(source),
                                        on_template_change: move |id| create_choice_template_id.set(id),
                                        on_open_create: move |_| {
                                            let source = create_choice_source();
                                            let tmpl_id = create_choice_template_id();
                                            let attrs = match &source {
                                                CreateEntitySource::Template => {
                                                    entity_templates
                                                        .read()
                                                        .iter()
                                                        .find(|t| t.id == tmpl_id)
                                                        .map(|t| {
                                                            let mut sorted = t.attributes.clone();
                                                            sorted.sort_by_key(|a| a.listing_index);
                                                            sorted
                                                                .into_iter()
                                                                .enumerate()
                                                                .map(|(i, ta)| EntityAttribute {
                                                                    access_level_id: ta.access_level_id,
                                                                    description: ta.description.clone(),
                                                                    id: format!("new-{i}"),
                                                                    is_required: ta.is_required,
                                                                    listing_index: ta.listing_index,
                                                                    name: ta.name.clone(),
                                                                    value: String::new(),
                                                                    value_type: ta.value_type.clone(),
                                                                })
                                                                .collect::<Vec<_>>()
                                                        })
                                                        .unwrap_or_default()
                                                }
                                                CreateEntitySource::Scratch => Vec::new(),
                                            };
                                            create_entity_state.set(Some(CreateEntityState {
                                                source,
                                                entity_template_id: tmpl_id,
                                                attributes: attrs,
                                                error: None,
                                                is_saving: false,
                                                active_tab: EntityTab::Attributes,
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

                // Error banner
                if let Some(err_msg) = error() {
                    div { class: "access-level-unavailable", role: "status",
                        p { "{err_msg}" }
                        button {
                            class: "access-level-refresh-button",
                            onclick: move |_| {
                                let search = if current_search2.len() >= 3 { current_search2.clone() } else { String::new() };
                                load_entities_page(sk_retry.clone(), search, current_page, entities, total, is_loading, error);
                            },
                            "Retry"
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
                                    th { colspan: "2", class: "data-table-action-heading", "" }
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
                                            span { "There are no entries" }
                                        }
                                    }
                                } else {
                                    for entity in entity_rows.iter().cloned() {
                                        EntityTableRow {
                                            key: "{entity.id}",
                                            entity: entity.clone(),
                                            on_open: {
                                                let sk = sk_open_entity.clone();
                                                move |entity_id: String| {
                                                    open_entity_details_window(
                                                        entity_id,
                                                        entity_details_windows,
                                                        next_window_id,
                                                        sk.clone(),
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

            // Entity details windows
            for window in entity_details_windows.read().iter().cloned() {
                EntityDetailsModal {
                    key: "{window.id}",
                    window: window.clone(),
                    windows: entity_details_windows,
                    session_key: session_key.clone().unwrap_or_default(),
                    access_levels: access_level_rows.clone(),
                    entities,
                    on_open_entity: {
                        let sk = session_key.clone().unwrap_or_default();
                        move |entity_id: String| {
                            open_entity_details_window(
                                entity_id,
                                entity_details_windows,
                                next_window_id,
                                sk.clone(),
                            );
                        }
                    },
                }
            }

            // Create entity modal
            if let Some(state) = create_entity_state() {
                CreateEntityModal {
                    state,
                    create_state: create_entity_state,
                    entity_templates: template_rows.clone(),
                    access_levels: access_level_rows.clone(),
                    session_key: session_key.clone().unwrap_or_default(),
                    owner_user_id: user_id.clone().unwrap_or_default(),
                    entities,
                    position: ModalPosition { x: 420.0, y: 100.0 },
                    size: ModalSize { height: 440.0, width: 600.0 },
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
                    current_search: current_search.clone(),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// EntityTableRow
// ---------------------------------------------------------------------------

#[component]
fn EntityTableRow(entity: Entity, on_open: EventHandler<String>) -> Element {
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
    let incoming = entity
        .incoming_links_count
        .unwrap_or_else(|| entity.incoming_links.as_ref().map(|l| l.len() as u32).unwrap_or(0));

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
            onclick: move |_| on_open.call(entity_id.clone()),
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
    on_close: EventHandler<MouseEvent>,
    on_source_change: EventHandler<CreateEntitySource>,
    on_template_change: EventHandler<String>,
    on_open_create: EventHandler<MouseEvent>,
    session_key: String,
) -> Element {
    let is_template_source = selected_source == CreateEntitySource::Template;
    let can_open = match &selected_source {
        CreateEntitySource::Template => !selected_template_id.is_empty(),
        CreateEntitySource::Scratch => true,
    };

    rsx! {
        div {
            class: "entity-create-choice-popover",
            role: "dialog",
            aria_label: "Create entity",
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            div { class: "entity-create-choice-header",
                p { "Create an entity from:" }
                button {
                    class: "draggable-modal-titlebar-button",
                    aria_label: "Close",
                    onclick: move |event| on_close.call(event),
                    lucide_dioxus::X { class: "app-icon", size: 14 }
                }
            }
            div { class: "entity-create-choice-options",
                label {
                    input {
                        r#type: "radio",
                        name: "create-source",
                        value: "template",
                        checked: is_template_source,
                        onchange: move |_| on_source_change.call(CreateEntitySource::Template),
                    }
                    "Template"
                }
                label {
                    input {
                        r#type: "radio",
                        name: "create-source",
                        value: "scratch",
                        checked: !is_template_source,
                        onchange: move |_| on_source_change.call(CreateEntitySource::Scratch),
                    }
                    "Scratch"
                }
            }
            if is_template_source {
                select {
                    class: "entity-template-select",
                    value: "{selected_template_id}",
                    onchange: move |event| on_template_change.call(event.value()),
                    option { value: "", "— select template —" }
                    for tmpl in entity_templates.iter() {
                        option { key: "{tmpl.id}", value: "{tmpl.id}", "{tmpl.name}" }
                    }
                }
            }
            button {
                class: "section-action-button",
                "data-tooltip": "Open create form",
                aria_label: "Create entity",
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
    current_search: String,
) -> Element {
    let views = saved_views.read().clone();
    let sel_id = selected_id();
    let uid = user_id.clone();

    rsx! {
        div {
            class: "draggable-modal",
            style: "left: 160px; top: 80px; width: 560px; height: 400px; min-width: 400px; min-height: 200px; z-index: 60;",
            div {
                class: "draggable-modal-body",
                div { class: "draggable-modal-header",
                    h2 { "Saved Views" }
                    div {
                        class: "draggable-modal-titlebar-actions",
                        button {
                            class: "draggable-modal-titlebar-button draggable-modal-close",
                            "data-tooltip": "Close",
                            aria_label: "Close",
                            onclick: move |_| is_open.set(false),
                            lucide_dioxus::X { class: "app-icon", size: 15 }
                        }
                    }
                }
                div { class: "draggable-modal-content",
                    div { class: "entity-views-modal-layout",
                        div { class: "entity-views-modal-list",
                            if views.is_empty() {
                                p { class: "data-table-muted-cell", "No saved views" }
                            } else {
                                for view in views.iter().cloned() {
                                    button {
                                        key: "{view.id}",
                                        class: if sel_id.as_deref() == Some(&view.id) {
                                            "entity-views-modal-item is-selected"
                                        } else {
                                            "entity-views-modal-item"
                                        },
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
                                            }
                                        },
                                        "{view.name}"
                                    }
                                }
                            }
                            button {
                                class: "section-action-button",
                                "data-tooltip": "New saved view",
                                aria_label: "Add saved view",
                                onclick: move |_| {
                                    selected_id.set(None);
                                    name_input.set(String::new());
                                    desc_input.set(String::new());
                                    search_input.set(current_search.clone());
                                },
                                Plus { class: "app-icon", size: 16 }
                            }
                        }
                        div { class: "entity-views-modal-form",
                            label {
                                span { "Name" }
                                input {
                                    r#type: "text",
                                    value: "{name_input}",
                                    oninput: move |event| name_input.set(event.value()),
                                }
                            }
                            label {
                                span { "Description" }
                                input {
                                    r#type: "text",
                                    value: "{desc_input}",
                                    oninput: move |event| desc_input.set(event.value()),
                                }
                            }
                            label {
                                span { "Search text" }
                                input {
                                    r#type: "text",
                                    value: "{search_input}",
                                    oninput: move |event| search_input.set(event.value()),
                                }
                            }
                            div { class: "entity-views-modal-actions",
                                if sel_id.is_some() {
                                    button {
                                        class: "delete-confirm-danger",
                                        onclick: {
                                            let uid2 = uid.clone();
                                            move |_| {
                                                if let Some(id) = selected_id() {
                                                    saved_views.write().retain(|v| v.id != id);
                                                    store_saved_views(&uid2, &saved_views.read());
                                                    selected_id.set(None);
                                                    name_input.set(String::new());
                                                    desc_input.set(String::new());
                                                    search_input.set(String::new());
                                                }
                                            }
                                        },
                                        "Delete"
                                    }
                                }
                                button {
                                    class: "section-action-button",
                                    disabled: name_input().trim().is_empty(),
                                    onclick: {
                                        let uid3 = uid.clone();
                                        move |_| {
                                            let name = name_input().trim().to_string();
                                            if name.is_empty() { return; }
                                            let desc = desc_input();
                                            let search = search_input();
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
                                        }
                                    },
                                    "Save"
                                }
                            }
                        }
                    }
                }
            }
        }
    }
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

fn open_entity_details_window(
    entity_id: String,
    mut windows: Signal<Vec<EntityDetailsWindow>>,
    mut next_window_id: Signal<u32>,
    session_key: String,
) {
    // If already open, just raise it.
    let existing = {
        let wins = windows.read();
        wins.iter().find(|w| w.entity_id == entity_id).map(|w| w.id.clone())
    };
    if let Some(win_id) = existing {
        let next_z = windows.read().iter().map(|w| w.z_index).max().unwrap_or(20) + 1;
        if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id) {
            w.z_index = next_z;
        }
        return;
    }

    let id_num = next_window_id();
    let offset = ((id_num - 1) % 6) as f64 * 28.0;
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
        position: ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 440.0,
            width: 600.0,
        },
        edit_attributes: Vec::new(),
        edit_error: None,
        is_saving: false,
    });

    spawn(async move {
        match fetch_entity(&session_key, &entity_id).await {
            Ok(entity) => {
                if let Some(w) = windows.write().iter_mut().find(|w| w.id == win_id_async) {
                    w.edit_attributes = entity.attributes.clone();
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
