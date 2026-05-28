use dioxus::prelude::*;
use lucide_dioxus::{ExternalLink, Info, Pencil, Trash2, User};

use crate::components::single_select_picker::{SingleSelectOption, SingleSelectPicker};
use crate::types::{
    AccessLevel, EntityTemplate, EntityTemplateAttribute, EntityTemplateLink, EntityTemplateModal,
    EntityTemplateTab, ModalContent, ModalInteraction, ModalSize, OpenModal, User as RebirthUser,
};

use super::{next_modal_z_index, DeleteConfirmPopover};

pub fn open_entity_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    entity_templates: Signal<Vec<EntityTemplate>>,
    access_levels: Vec<AccessLevel>,
    owner_users: Vec<RebirthUser>,
    entity_template: EntityTemplate,
    can_edit: bool,
) {
    let existing_modal_id = {
        let open_modals = modals.read();
        open_modals.iter().find_map(|open_modal| {
            let ModalContent::EntityTemplate(open_entity_template) = &open_modal.content else {
                return None;
            };

            if open_entity_template.entity_template.id == entity_template.id {
                Some(open_modal.id)
            } else {
                None
            }
        })
    };

    if let Some(existing_modal_id) = existing_modal_id {
        let next_z_index = next_modal_z_index(&modals.read());

        if let Some(open_modal) = modals
            .write()
            .iter_mut()
            .find(|open_modal| open_modal.id == existing_modal_id)
        {
            open_modal.z_index = next_z_index;
        }

        return;
    }

    let id = next_modal_id();
    let offset = (id.saturating_sub(1) % 6) as f64 * 28.0;
    let z_index = next_modal_z_index(&modals.read());

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::EntityTemplate(EntityTemplateModal {
            access_levels,
            active_tab: EntityTemplateTab::Attributes,
            can_edit,
            entity_template,
            entity_templates,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_ownership_open: false,
            owner_users,
            session_key,
        }),
        id,
        position: crate::types::ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 440.0,
            width: 520.0,
        },
        title: "Entity Template".to_string(),
        z_index,
    });
}

pub(super) fn close_popovers(entity_template: &mut EntityTemplateModal) {
    entity_template.is_delete_confirm_open = false;
    entity_template.is_info_open = false;
    entity_template.is_ownership_open = false;
}

fn update_entity_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    modal_id: u32,
    update: impl FnOnce(&mut EntityTemplateModal),
) {
    if let Some(open_modal) = modals
        .write()
        .iter_mut()
        .find(|open_modal| open_modal.id == modal_id)
    {
        if let ModalContent::EntityTemplate(entity_template) = &mut open_modal.content {
            update(entity_template);
        }
    }
}

#[component]
pub(super) fn EntityTemplateTitlebarActions(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
    modal_interaction: Signal<Option<ModalInteraction>>,
) -> Element {
    let _ = modal_interaction;
    let ModalContent::EntityTemplate(entity_template) = modal.content.clone() else {
        return rsx! {};
    };

    let modal_id = modal.id;
    let is_info_open = entity_template.is_info_open;
    let is_ownership_open = entity_template.is_ownership_open;
    let is_delete_confirm_open = entity_template.is_delete_confirm_open;
    let can_edit = entity_template.can_edit;
    let owner_label = owner_label(&entity_template);

    rsx! {
        div { class: "draggable-modal-info-action",
            button {
                class: "draggable-modal-titlebar-button draggable-modal-info-button",
                "data-tooltip": "Info",
                aria_label: "Show id",
                aria_expanded: "{is_info_open}",
                onclick: move |_| update_entity_template_modal(
                    modals,
                    modal_id,
                    |entity_template| {
                        entity_template.is_info_open = !entity_template.is_info_open;
                        entity_template.is_delete_confirm_open = false;
                        entity_template.is_ownership_open = false;
                    },
                ),
                Info { class: "app-icon", size: 15 }
            }
            if is_info_open {
                div {
                    class: "entity-id-popover",
                    onclick: move |event| event.stop_propagation(),
                    onpointerdown: move |event| event.stop_propagation(),
                    p {
                        class: "entity-id-popover-title",
                        "data-selectable": "true",
                        "id: {entity_template.entity_template.id}"
                    }
                }
            }
        }
        div { class: "draggable-modal-delete-action",
            button {
                class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                "data-tooltip": if !can_edit || is_delete_confirm_open { "" } else { "Delete" },
                aria_label: "Delete entity template",
                aria_expanded: "{is_delete_confirm_open}",
                disabled: !can_edit,
                onclick: move |_| update_entity_template_modal(
                    modals,
                    modal_id,
                    |entity_template| {
                        entity_template.is_delete_confirm_open = true;
                        entity_template.is_info_open = false;
                        entity_template.is_ownership_open = false;
                    },
                ),
                Trash2 { class: "app-icon", size: 15 }
            }
            if is_delete_confirm_open {
                DeleteConfirmPopover {
                    on_cancel: move |_| update_entity_template_modal(
                        modals,
                        modal_id,
                        |entity_template| entity_template.is_delete_confirm_open = false,
                    ),
                    on_confirm: move |_| update_entity_template_modal(
                        modals,
                        modal_id,
                        |entity_template| entity_template.is_delete_confirm_open = false,
                    ),
                }
            }
        }
        button {
            class: "draggable-modal-titlebar-button",
            "data-tooltip": if can_edit { "Edit" } else { "You cannot edit this entity template" },
            aria_label: "Edit entity template",
            disabled: !can_edit,
            Pencil { class: "app-icon", size: 15 }
        }
        button {
            class: "draggable-modal-titlebar-button",
            "data-tooltip": "Owner",
            aria_label: "Ownership",
            aria_expanded: "{is_ownership_open}",
            onclick: move |_| update_entity_template_modal(
                modals,
                modal_id,
                |entity_template| {
                    entity_template.is_ownership_open = !entity_template.is_ownership_open;
                    entity_template.is_info_open = false;
                    entity_template.is_delete_confirm_open = false;
                },
            ),
            User { class: "app-icon", size: 15 }
        }
        if is_ownership_open {
            div {
                class: "include-attribute-popover entity-ownership-popover entity-ownership-read-popover",
                onclick: move |event| event.stop_propagation(),
                onpointerdown: move |event| event.stop_propagation(),
                p { class: "entity-ownership-read-title", "Owner: {owner_label}" }
            }
        }
    }
}

#[component]
pub(super) fn EntityTemplateContentView(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
) -> Element {
    let ModalContent::EntityTemplate(entity_template) = modal.content.clone() else {
        return rsx! {};
    };

    let ordered_attributes = ordered_attributes(&entity_template.entity_template);
    let ordered_links = ordered_links(&entity_template.entity_template);
    let incoming_links = incoming_links(
        &entity_template.entity_template,
        &entity_template.entity_templates.read(),
    );
    let listing_attribute_label = ordered_attributes
        .iter()
        .find(|attribute| attribute.id == entity_template.entity_template.listing_attribute_id)
        .map(|attribute| attribute.name.clone())
        .unwrap_or_default();
    let listing_attribute_options = ordered_attributes
        .iter()
        .map(|attribute| SingleSelectOption {
            label: attribute.name.clone(),
            value: attribute.id.clone(),
        })
        .collect::<Vec<_>>();

    rsx! {
        div {
            class: "entity-template-edit-form entity-template-view-form access-level-details",
            "data-selectable": "true",
            div { class: "entity-template-fields",
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "name" }
                    input {
                        readonly: true,
                        r#type: "text",
                        value: "{entity_template.entity_template.name}",
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "description" }
                    textarea {
                        class: "entity-template-description-input",
                        readonly: true,
                        rows: "1",
                        value: "{entity_template.entity_template.description}",
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "listing attribute" }
                    SingleSelectPicker {
                        disabled: true,
                        empty_text: "Select listing attribute",
                        is_open: false,
                        options: listing_attribute_options,
                        selected_value: entity_template.entity_template.listing_attribute_id.clone(),
                        summary: listing_attribute_label,
                        on_toggle_open: move |_| {},
                        on_select_item: move |_| {},
                    }
                }
            }
            div { class: "entity-template-tabs",
                div { class: "entity-template-tab-row",
                    div {
                        class: "entity-template-tab-list",
                        role: "tablist",
                        aria_label: "Entity template sections",
                        button {
                            class: "entity-template-tab",
                            aria_selected: "{entity_template.active_tab == EntityTemplateTab::Attributes}",
                            role: "tab",
                            r#type: "button",
                            onclick: move |_| update_entity_template_modal(
                                modals,
                                modal.id,
                                |entity_template| entity_template.active_tab = EntityTemplateTab::Attributes,
                            ),
                            span { "Attributes" }
                            span { class: "entity-template-tab-badge", "{ordered_attributes.len()}" }
                        }
                        button {
                            class: "entity-template-tab",
                            "data-tooltip": "Outbound Links",
                            aria_selected: "{entity_template.active_tab == EntityTemplateTab::Links}",
                            role: "tab",
                            r#type: "button",
                            onclick: move |_| update_entity_template_modal(
                                modals,
                                modal.id,
                                |entity_template| entity_template.active_tab = EntityTemplateTab::Links,
                            ),
                            span { "Outlinks" }
                            span { class: "entity-template-tab-badge", "{ordered_links.len()}" }
                        }
                        if !incoming_links.is_empty() {
                            button {
                                class: "entity-template-tab",
                                "data-tooltip": "Incoming links",
                                aria_selected: "{entity_template.active_tab == EntityTemplateTab::Inlinks}",
                                role: "tab",
                                r#type: "button",
                                onclick: move |_| update_entity_template_modal(
                                    modals,
                                    modal.id,
                                    |entity_template| entity_template.active_tab = EntityTemplateTab::Inlinks,
                                ),
                                span { "Inlinks" }
                                span { class: "entity-template-tab-badge", "{incoming_links.len()}" }
                            }
                        }
                    }
                }

                match entity_template.active_tab {
                    EntityTemplateTab::Attributes => rsx! {
                        div { role: "tabpanel",
                            AttributesTable {
                                access_levels: entity_template.access_levels.clone(),
                                attributes: ordered_attributes.clone(),
                            }
                        }
                    },
                    EntityTemplateTab::Links => rsx! {
                        div { role: "tabpanel",
                            LinksTable {
                                entity_templates: entity_template.entity_templates.read().clone(),
                                links: ordered_links.clone(),
                                modals,
                                next_modal_id: modal.id,
                                session_key: entity_template.session_key.clone(),
                                access_levels: entity_template.access_levels.clone(),
                                owner_users: entity_template.owner_users.clone(),
                            }
                        }
                    },
                    EntityTemplateTab::Inlinks => rsx! {
                        div { role: "tabpanel",
                            InlinksTable {
                                access_levels: entity_template.access_levels.clone(),
                                incoming_links: incoming_links.clone(),
                                modals,
                                next_modal_id: modal.id,
                                owner_users: entity_template.owner_users.clone(),
                                session_key: entity_template.session_key.clone(),
                            }
                        }
                    },
                }
            }
        }
    }
}

#[component]
fn AttributesTable(
    access_levels: Vec<AccessLevel>,
    attributes: Vec<EntityTemplateAttribute>,
) -> Element {
    rsx! {
        table { class: "data-table entity-template-modal-table entity-template-attributes-table entity-template-view-attributes-table",
            thead {
                tr {
                    th { "name" }
                    th { "value type" }
                    th { "access level" }
                }
            }
            tbody {
                if attributes.is_empty() {
                    tr {
                        td { class: "data-table-empty-cell", colspan: "3",
                            span { "There are no entries" }
                        }
                    }
                } else {
                    for attribute in attributes {
                        tr {
                            key: "{attribute.id}",
                            td {
                                class: "entity-template-attribute-name",
                                "data-tooltip": "{attribute.description}",
                                "{attribute.name}"
                            }
                            td {
                                class: "entity-template-value-type-cell",
                                "data-tooltip": "Value type",
                                "{attribute.value_type}"
                            }
                            td { "{access_level_name(&access_levels, attribute.access_level_id)}" }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn LinksTable(
    access_levels: Vec<AccessLevel>,
    entity_templates: Vec<EntityTemplate>,
    links: Vec<EntityTemplateLink>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: u32,
    owner_users: Vec<RebirthUser>,
    session_key: String,
) -> Element {
    rsx! {
        table { class: "data-table entity-template-modal-table entity-template-links-table entity-template-view-links-table",
            thead {
                tr {
                    th { "name" }
                    th { "description" }
                    th { "target" }
                }
            }
            tbody {
                if links.is_empty() {
                    tr {
                        td { class: "data-table-empty-cell", colspan: "3",
                            span { "There are no entries" }
                        }
                    }
                } else {
                    for link in links {
                        tr {
                            key: "{link.id}",
                            td { "{link.name}" }
                            LinkDescriptionValue { description: link.description.clone() }
                            td {
                                if let Some(target) = linked_entity_template(&entity_templates, link.target_entity_template_id.as_deref()) {
                                    EntityReferenceButton {
                                        access_levels: access_levels.clone(),
                                        can_edit: true,
                                        entity_template: target,
                                        entity_templates: Signal::new(entity_templates.clone()),
                                        modals,
                                        next_modal_id,
                                        owner_users: owner_users.clone(),
                                        session_key: session_key.clone(),
                                    }
                                } else if let Some(target_id) = link.target_entity_template_id.clone() {
                                    "{target_id}"
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
fn InlinksTable(
    access_levels: Vec<AccessLevel>,
    incoming_links: Vec<(EntityTemplateLink, EntityTemplate)>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: u32,
    owner_users: Vec<RebirthUser>,
    session_key: String,
) -> Element {
    rsx! {
        table { class: "data-table entity-template-modal-table entity-template-links-table entity-template-view-inlinks-table",
            thead {
                tr {
                    th { "source" }
                    th { "name" }
                    th { "description" }
                }
            }
            tbody {
                for (link, source_template) in incoming_links {
                    tr {
                        key: "{source_template.id}:{link.id}",
                        td {
                            EntityReferenceButton {
                                access_levels: access_levels.clone(),
                                can_edit: true,
                                entity_template: source_template,
                                entity_templates: Signal::new(Vec::new()),
                                modals,
                                next_modal_id,
                                owner_users: owner_users.clone(),
                                session_key: session_key.clone(),
                            }
                        }
                        td { "{link.name}" }
                        LinkDescriptionValue { description: link.description.clone() }
                    }
                }
            }
        }
    }
}

#[component]
fn LinkDescriptionValue(description: Option<String>) -> Element {
    let description = description.unwrap_or_default();

    rsx! {
        td { class: "entity-template-link-description-value",
            span { "{description}" }
        }
    }
}

#[component]
fn EntityReferenceButton(
    access_levels: Vec<AccessLevel>,
    can_edit: bool,
    entity_template: EntityTemplate,
    entity_templates: Signal<Vec<EntityTemplate>>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: u32,
    owner_users: Vec<RebirthUser>,
    session_key: String,
) -> Element {
    let fallback_next_modal_id = use_signal(|| next_modal_id + 1);

    rsx! {
        button {
            class: "entity-reference-button",
            aria_label: "Open entity template {entity_template.name}",
            r#type: "button",
            onclick: move |event| {
                event.stop_propagation();
                open_entity_template_modal(
                    modals,
                    fallback_next_modal_id,
                    session_key.clone(),
                    entity_templates,
                    access_levels.clone(),
                    owner_users.clone(),
                    entity_template.clone(),
                    can_edit,
                );
            },
            span { "{entity_template.name}" }
            ExternalLink { class: "app-icon", size: 14 }
        }
    }
}

fn ordered_attributes(entity_template: &EntityTemplate) -> Vec<EntityTemplateAttribute> {
    let mut attributes = entity_template.attributes.clone();
    attributes.sort_by_key(|attribute| attribute.listing_index);
    attributes
}

fn ordered_links(entity_template: &EntityTemplate) -> Vec<EntityTemplateLink> {
    let mut links = entity_template.links.clone();
    links.sort_by_key(|link| link.listing_index);
    links
}

fn incoming_links(
    entity_template: &EntityTemplate,
    entity_templates: &[EntityTemplate],
) -> Vec<(EntityTemplateLink, EntityTemplate)> {
    let mut links = entity_templates
        .iter()
        .flat_map(|source_template| {
            source_template
                .links
                .iter()
                .filter(|link| {
                    link.target_entity_template_id.as_deref() == Some(&entity_template.id)
                })
                .map(|link| (link.clone(), source_template.clone()))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    links.sort_by(|left, right| {
        left.1
            .name
            .cmp(&right.1.name)
            .then(left.0.listing_index.cmp(&right.0.listing_index))
    });
    links
}

fn access_level_name(access_levels: &[AccessLevel], access_level_id: u32) -> String {
    access_levels
        .iter()
        .find(|access_level| access_level.id == access_level_id)
        .map(|access_level| access_level.name.clone())
        .unwrap_or_else(|| access_level_id.to_string())
}

fn linked_entity_template(
    entity_templates: &[EntityTemplate],
    target_entity_template_id: Option<&str>,
) -> Option<EntityTemplate> {
    entity_templates
        .iter()
        .find(|entity_template| Some(entity_template.id.as_str()) == target_entity_template_id)
        .cloned()
}

fn owner_label(entity_template: &EntityTemplateModal) -> String {
    entity_template
        .entity_template
        .owner_username
        .clone()
        .or_else(|| {
            entity_template
                .owner_users
                .iter()
                .find(|user| user.id == entity_template.entity_template.owner_user_id)
                .map(|user| user.username.clone())
        })
        .unwrap_or_else(|| entity_template.entity_template.owner_user_id.clone())
}
