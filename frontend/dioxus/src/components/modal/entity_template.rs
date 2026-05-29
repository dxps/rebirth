use dioxus::prelude::*;
use gloo_net::http::Request;
use lucide_dioxus::{
    ArrowLeft, ExternalLink, GripVertical, Info, Pencil, Plus, Save, Trash2, User, X,
};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::components::single_select_picker::{SingleSelectOption, SingleSelectPicker};
use crate::types::{
    AccessLevel, AttributeTemplate, EntityTemplate, EntityTemplateAttribute,
    EntityTemplateAttributeSourceTab, EntityTemplateLink, EntityTemplateModal,
    EntityTemplateResponse, EntityTemplateTab, ModalContent, ModalInteraction, ModalSize,
    OpenModal, SecurityModalMode, User as RebirthUser, API_BASE_URL,
};

use super::{json_string, next_modal_z_index, read_response_error, DeleteConfirmPopover};

const VALUE_TYPES: [&str; 5] = ["text", "number", "boolean", "date", "datetime"];
static ATTRIBUTE_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn open_entity_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
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
            attribute_source_tab: EntityTemplateAttributeSourceTab::Existing,
            attribute_templates,
            can_edit,
            dragging_attribute_id: None,
            entity_template,
            entity_templates,
            error: None,
            open_attribute_access_level_menu_id: None,
            open_attribute_value_type_menu_id: None,
            open_link_target_menu_id: None,
            is_attribute_template_menu_open: false,
            is_attribute_popover_open: false,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_listing_attribute_menu_open: false,
            is_new_attribute_value_type_menu_open: false,
            is_ownership_open: false,
            is_saving: false,
            mode: SecurityModalMode::Details,
            new_attribute_description: String::new(),
            new_attribute_name: String::new(),
            new_attribute_save_as_template: false,
            new_attribute_value_type: "text".to_string(),
            owner_users,
            selected_attribute_template_id: None,
            session_key,
        }),
        id,
        position: crate::types::ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 440.0,
            width: 600.0,
        },
        title: "Entity Template".to_string(),
        z_index,
    });
}

pub fn open_create_entity_template_modal(
    mut modals: Signal<Vec<OpenModal>>,
    mut next_modal_id: Signal<u32>,
    session_key: String,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
    entity_templates: Signal<Vec<EntityTemplate>>,
    access_levels: Vec<AccessLevel>,
    owner_users: Vec<RebirthUser>,
    owner_user_id: Option<String>,
) {
    let id = next_modal_id();
    let offset = (id.saturating_sub(1) % 6) as f64 * 28.0;
    let z_index = next_modal_z_index(&modals.read());

    next_modal_id.set(id + 1);
    modals.write().push(OpenModal {
        content: ModalContent::EntityTemplate(EntityTemplateModal {
            access_levels,
            active_tab: EntityTemplateTab::Attributes,
            attribute_source_tab: EntityTemplateAttributeSourceTab::Existing,
            attribute_templates,
            can_edit: true,
            dragging_attribute_id: None,
            entity_template: EntityTemplate {
                attributes: Vec::new(),
                description: String::new(),
                id: String::new(),
                links: Vec::new(),
                listing_attribute_id: String::new(),
                name: String::new(),
                owner_user_id: owner_user_id.unwrap_or_default(),
                owner_username: None,
            },
            entity_templates,
            error: None,
            open_attribute_access_level_menu_id: None,
            open_attribute_value_type_menu_id: None,
            open_link_target_menu_id: None,
            is_attribute_template_menu_open: false,
            is_attribute_popover_open: false,
            is_delete_confirm_open: false,
            is_info_open: false,
            is_listing_attribute_menu_open: false,
            is_new_attribute_value_type_menu_open: false,
            is_ownership_open: false,
            is_saving: false,
            mode: SecurityModalMode::Create,
            new_attribute_description: String::new(),
            new_attribute_name: String::new(),
            new_attribute_save_as_template: false,
            new_attribute_value_type: "text".to_string(),
            owner_users,
            selected_attribute_template_id: None,
            session_key,
        }),
        id,
        position: crate::types::ModalPosition {
            x: 420.0 + offset,
            y: 100.0 + offset,
        },
        size: ModalSize {
            height: 440.0,
            width: 600.0,
        },
        title: "Entity Template :: New".to_string(),
        z_index,
    });
}

pub(super) fn close_popovers(entity_template: &mut EntityTemplateModal) {
    entity_template.is_attribute_popover_open = false;
    entity_template.is_attribute_template_menu_open = false;
    entity_template.is_delete_confirm_open = false;
    entity_template.is_info_open = false;
    entity_template.is_listing_attribute_menu_open = false;
    entity_template.is_new_attribute_value_type_menu_open = false;
    entity_template.is_ownership_open = false;
    entity_template.open_attribute_access_level_menu_id = None;
    entity_template.open_attribute_value_type_menu_id = None;
    entity_template.open_link_target_menu_id = None;
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
    let owner_users = entity_template.owner_users.clone();
    let owner_user_id = entity_template.entity_template.owner_user_id.clone();
    let is_create = entity_template.mode == SecurityModalMode::Create;
    let is_edit = entity_template.mode == SecurityModalMode::Edit;
    let save_modal = modal.clone();
    let can_save_create =
        is_create
            && !entity_template.entity_template.name.trim().is_empty()
            && !entity_template.entity_template.attributes.is_empty()
            && !entity_template
                .entity_template
                .listing_attribute_id
                .is_empty()
            && entity_template
                .entity_template
                .attributes
                .iter()
                .all(|attribute| !attribute.name.trim().is_empty())
            && entity_template.entity_template.links.iter().all(|link| {
                !link.name.trim().is_empty() && link.target_entity_template_id.is_some()
            });

    let can_save_edit =
        is_edit
            && !entity_template.entity_template.name.trim().is_empty()
            && !entity_template.entity_template.attributes.is_empty()
            && !entity_template
                .entity_template
                .listing_attribute_id
                .is_empty()
            && entity_template
                .entity_template
                .attributes
                .iter()
                .all(|attribute| !attribute.name.trim().is_empty())
            && entity_template.entity_template.links.iter().all(|link| {
                !link.name.trim().is_empty() && link.target_entity_template_id.is_some()
            });

    if is_edit {
        let save_modal_edit = modal.clone();
        let edit_entity_template_id = entity_template.entity_template.id.clone();
        let edit_entity_template_id_for_delete = edit_entity_template_id.clone();
        let edit_entity_templates = entity_template.entity_templates;
        let edit_session_key = entity_template.session_key.clone();
        let edit_owner_users = owner_users.clone();
        let edit_owner_user_id = owner_user_id.clone();
        let edit_owner_label = owner_label.clone();
        return rsx! {
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Cancel",
                aria_label: "Cancel edit",
                onclick: move |_| {
                    let original = edit_entity_templates
                        .read()
                        .iter()
                        .find(|t| t.id == edit_entity_template_id)
                        .cloned();
                    if let Some(open_modal) = modals
                        .write()
                        .iter_mut()
                        .find(|open_modal| open_modal.id == modal_id)
                    {
                        open_modal.title = "Entity Template".to_string();
                        if let ModalContent::EntityTemplate(et) = &mut open_modal.content {
                            if let Some(original) = original {
                                et.entity_template = original;
                            }
                            et.mode = SecurityModalMode::Details;
                            et.error = None;
                        }
                    }
                },
                ArrowLeft { class: "app-icon", size: 15 }
            }
            div { class: "draggable-modal-delete-action",
                button {
                    class: "draggable-modal-titlebar-button draggable-modal-delete-button",
                    "data-tooltip": if is_delete_confirm_open { "" } else { "Delete" },
                    aria_label: "Delete entity template",
                    aria_expanded: "{is_delete_confirm_open}",
                    onclick: move |_| update_entity_template_modal(
                        modals,
                        modal_id,
                        |entity_template| {
                            entity_template.is_delete_confirm_open = true;
                            entity_template.is_attribute_popover_open = false;
                            entity_template.is_attribute_template_menu_open = false;
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
                        on_confirm: move |_| {
                            let session_key = edit_session_key.clone();
                            let entity_template_id = edit_entity_template_id_for_delete.clone();
                            let mut entity_templates = edit_entity_templates;
                            spawn(async move {
                                let response = Request::delete(
                                        &format!("{API_BASE_URL}/entity-templates/{entity_template_id}"),
                                    )
                                    .header("Authorization", &format!("Bearer {session_key}"))
                                    .send()
                                    .await;
                                if response.map(|r| r.ok()).unwrap_or(false) {
                                    entity_templates.write().retain(|item| item.id != entity_template_id);
                                    modals.write().retain(|open_modal| open_modal.id != modal_id);
                                }
                            });
                        },
                    }
                }
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
                        entity_template.is_attribute_popover_open = false;
                        entity_template.is_attribute_template_menu_open = false;
                        entity_template.is_info_open = false;
                        entity_template.is_delete_confirm_open = false;
                    },
                ),
                User { class: "app-icon", size: 15 }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": if can_save_edit { "Save" } else { "An entity template must have a name, listing attribute, and valid attributes/links" },
                aria_label: "Save entity template",
                disabled: !can_save_edit || entity_template.is_saving,
                onclick: move |_| {
                    if can_save_edit {
                        save_entity_template_modal(modals, save_modal_edit.clone());
                    }
                },
                Save { class: "app-icon", size: 15 }
            }
            if is_ownership_open {
                OwnershipPopover {
                    can_assign_owner: true,
                    is_saving: entity_template.is_saving,
                    owner_label: edit_owner_label.clone(),
                    owner_user_id: edit_owner_user_id.clone(),
                    owner_users: edit_owner_users.clone(),
                    on_owner_change: move |new_owner_id: String| update_entity_template_modal(
                        modals,
                        modal_id,
                        |et| {
                            et.entity_template.owner_username = et
                                .owner_users
                                .iter()
                                .find(|u| u.id == new_owner_id)
                                .map(|u| u.username.clone());
                            et.entity_template.owner_user_id = new_owner_id;
                        },
                    ),
                }
            }
        };
    }

    if is_create {
        return rsx! {
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": "Back",
                aria_label: "Back",
                onclick: move |_| modals.write().retain(|open_modal| open_modal.id != modal_id),
                ArrowLeft { class: "app-icon", size: 15 }
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
                        entity_template.is_attribute_popover_open = false;
                        entity_template.is_attribute_template_menu_open = false;
                        entity_template.is_info_open = false;
                        entity_template.is_delete_confirm_open = false;
                    },
                ),
                User { class: "app-icon", size: 15 }
            }
            button {
                class: "draggable-modal-titlebar-button",
                "data-tooltip": if can_save_create { "Save" } else { "An entity template must have a name, listing attribute, and valid attributes/links" },
                aria_label: "Save entity template",
                disabled: !can_save_create || entity_template.is_saving,
                onclick: move |_| {
                    if can_save_create {
                        save_entity_template_modal(modals, save_modal.clone());
                    }
                },
                Save { class: "app-icon", size: 15 }
            }
            if is_ownership_open {
                OwnershipPopover {
                    can_assign_owner: true,
                    is_saving: entity_template.is_saving,
                    owner_label: owner_label.clone(),
                    owner_user_id: owner_user_id.clone(),
                    owner_users: owner_users.clone(),
                    on_owner_change: move |new_owner_id: String| update_entity_template_modal(
                        modals,
                        modal_id,
                        |et| {
                            et.entity_template.owner_username = et
                                .owner_users
                                .iter()
                                .find(|u| u.id == new_owner_id)
                                .map(|u| u.username.clone());
                            et.entity_template.owner_user_id = new_owner_id;
                        },
                    ),
                }
            }
        };
    }

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
                        entity_template.is_attribute_popover_open = false;
                        entity_template.is_attribute_template_menu_open = false;
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
                        entity_template.is_attribute_popover_open = false;
                        entity_template.is_attribute_template_menu_open = false;
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
                    on_confirm: move |_| {
                        let session_key = entity_template.session_key.clone();
                        let entity_template_id = entity_template.entity_template.id.clone();
                        let mut entity_templates = entity_template.entity_templates;
                        spawn(async move {
                            let response = Request::delete(
                                    &format!("{API_BASE_URL}/entity-templates/{entity_template_id}"),
                                )
                                .header("Authorization", &format!("Bearer {session_key}"))
                                .send()
                                .await;
                            if response.map(|r| r.ok()).unwrap_or(false) {
                                entity_templates.write().retain(|item| item.id != entity_template_id);
                                modals.write().retain(|open_modal| open_modal.id != modal_id);
                            }
                        });
                    },
                }
            }
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
                    entity_template.is_attribute_popover_open = false;
                    entity_template.is_attribute_template_menu_open = false;
                    entity_template.is_info_open = false;
                    entity_template.is_delete_confirm_open = false;
                },
            ),
            User { class: "app-icon", size: 15 }
        }
        button {
            class: "draggable-modal-titlebar-button",
            "data-tooltip": if can_edit { "Edit" } else { "You cannot edit this entity template" },
            aria_label: "Edit entity template",
            disabled: !can_edit,
            onclick: move |_| {
                if let Some(open_modal) = modals
                    .write()
                    .iter_mut()
                    .find(|open_modal| open_modal.id == modal_id)
                {
                    open_modal.title = "Entity Template :: Edit".to_string();
                    if let ModalContent::EntityTemplate(entity_template) = &mut open_modal
                        .content
                    {
                        entity_template.mode = SecurityModalMode::Edit;
                        entity_template.is_attribute_popover_open = false;
                        entity_template.is_attribute_template_menu_open = false;
                        entity_template.is_info_open = false;
                        entity_template.is_delete_confirm_open = false;
                        entity_template.is_ownership_open = false;
                    }
                }
            },
            Pencil { class: "app-icon", size: 15 }
        }
        if is_ownership_open {
            OwnershipPopover {
                can_assign_owner: false,
                is_saving: false,
                owner_label: owner_label.clone(),
                owner_user_id: owner_user_id.clone(),
                owner_users: owner_users.clone(),
                on_owner_change: move |_| {},
            }
        }
    }
}

#[component]
fn OwnershipPopover(
    can_assign_owner: bool,
    is_saving: bool,
    owner_label: String,
    owner_user_id: String,
    owner_users: Vec<crate::types::User>,
    on_owner_change: EventHandler<String>,
) -> Element {
    let owner_options = owner_users
        .iter()
        .map(|u| SingleSelectOption {
            label: u.username.clone(),
            value: u.id.clone(),
        })
        .collect::<Vec<_>>();
    let owner_summary = owner_users
        .iter()
        .find(|u| u.id == owner_user_id)
        .map(|u| u.username.clone())
        .unwrap_or_else(|| owner_label.clone());
    let mut is_owner_menu_open = use_signal(|| false);

    rsx! {
        div {
            class: "include-attribute-popover entity-ownership-popover entity-ownership-read-popover",
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            if can_assign_owner {
                label {
                    span { "Owner:" }
                    SingleSelectPicker {
                        disabled: is_saving,
                        empty_text: "Select owner",
                        is_open: is_owner_menu_open(),
                        options: owner_options,
                        selected_value: owner_user_id,
                        summary: owner_summary,
                        on_toggle_open: move |_| is_owner_menu_open.toggle(),
                        on_select_item: move |new_owner_id: String| {
                            is_owner_menu_open.set(false);
                            on_owner_change.call(new_owner_id);
                        },
                    }
                }
            } else {
                p { class: "entity-ownership-read-title", "Owner: {owner_label}" }
            }
        }
    }
}

fn save_entity_template_modal(mut modals: Signal<Vec<OpenModal>>, modal: OpenModal) {
    let ModalContent::EntityTemplate(mut entity_template) = modal.content.clone() else {
        return;
    };
    let template = entity_template.entity_template.clone();
    let name = template.name.trim().to_string();

    if name.is_empty() {
        update_entity_template_modal(modals, modal.id, |entity_template| {
            entity_template.is_saving = false;
            entity_template.error = Some("Name is required".to_string());
        });
        return;
    }

    if template.attributes.is_empty() {
        update_entity_template_modal(modals, modal.id, |entity_template| {
            entity_template.is_saving = false;
            entity_template.error = Some("Include at least one attribute".to_string());
        });
        return;
    }

    if template.listing_attribute_id.is_empty() {
        update_entity_template_modal(modals, modal.id, |entity_template| {
            entity_template.is_saving = false;
            entity_template.error = Some("Select a listing attribute".to_string());
        });
        return;
    }

    if template
        .attributes
        .iter()
        .any(|attribute| attribute.name.trim().is_empty())
    {
        update_entity_template_modal(modals, modal.id, |entity_template| {
            entity_template.is_saving = false;
            entity_template.error = Some("Included attributes must have names".to_string());
        });
        return;
    }

    if template.links.iter().any(|link| {
        link.name.trim().is_empty()
            || link
                .target_entity_template_id
                .as_deref()
                .unwrap_or("")
                .is_empty()
    }) {
        update_entity_template_modal(modals, modal.id, |entity_template| {
            entity_template.is_saving = false;
            entity_template.error = Some("Links must have names and targets".to_string());
        });
        return;
    }

    update_entity_template_modal(modals, modal.id, |entity_template| {
        entity_template.is_saving = true;
        entity_template.error = None;
    });

    spawn(async move {
        match save_entity_template_request(&entity_template.session_key, &template).await {
            Ok(saved_entity_template) => {
                let saved_entity_template_id = saved_entity_template.id.clone();
                {
                    let mut entity_templates = entity_template.entity_templates.write();
                    if let Some(existing) = entity_templates
                        .iter_mut()
                        .find(|item| item.id == saved_entity_template_id)
                    {
                        *existing = saved_entity_template.clone();
                    } else {
                        entity_templates.push(saved_entity_template);
                    }
                    entity_templates.sort_by(|left, right| {
                        left.name
                            .to_ascii_lowercase()
                            .cmp(&right.name.to_ascii_lowercase())
                    });
                }

                modals
                    .write()
                    .retain(|open_modal| open_modal.id != modal.id);
            }
            Err(message) => update_entity_template_modal(modals, modal.id, |entity_template| {
                entity_template.is_saving = false;
                entity_template.error = Some(message);
            }),
        }
    });
}

async fn save_entity_template_request(
    session_key: &str,
    entity_template: &EntityTemplate,
) -> Result<EntityTemplate, String> {
    let (request, fallback) = if entity_template.id.is_empty() {
        (
            Request::post(&format!("{API_BASE_URL}/entity-templates"))
                .header("Authorization", &format!("Bearer {session_key}"))
                .header("Content-Type", "application/json")
                .body(entity_template_create_body(entity_template))
                .map_err(|_| "Unable to create entity template".to_string())?,
            "Unable to create entity template",
        )
    } else {
        (
            Request::patch(&format!(
                "{API_BASE_URL}/entity-templates/{}",
                entity_template.id
            ))
            .header("Authorization", &format!("Bearer {session_key}"))
            .header("Content-Type", "application/json")
            .body(entity_template_create_body(entity_template))
            .map_err(|_| "Unable to save entity template".to_string())?,
            "Unable to save entity template",
        )
    };

    let response = request
        .send()
        .await
        .map_err(|_| fallback.to_string())?;

    parse_entity_template_response(response, fallback).await
}

async fn parse_entity_template_response(
    response: gloo_net::http::Response,
    fallback: &str,
) -> Result<EntityTemplate, String> {
    if response.ok() {
        response
            .json::<EntityTemplateResponse>()
            .await
            .map(|payload| payload.data)
            .map_err(|_| fallback.to_string())
    } else {
        Err(read_response_error(response, fallback).await)
    }
}

fn entity_template_create_body(entity_template: &EntityTemplate) -> String {
    let attributes_json = ordered_attributes(entity_template)
        .iter()
        .enumerate()
        .map(|(index, attribute)| {
            format!(
                "{{\"accessLevelId\":{},\"description\":{},\"id\":{},\"isRequired\":{},\"listingIndex\":{},\"name\":{},\"valueType\":{}}}",
                attribute.access_level_id,
                json_string(&attribute.description),
                json_string(&attribute.id),
                attribute.is_required,
                index,
                json_string(attribute.name.trim()),
                json_string(&attribute.value_type),
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let links_json = ordered_links(entity_template)
        .iter()
        .enumerate()
        .map(|(index, link)| {
            let id_json = if link.id.starts_with("draft-link-") {
                String::new()
            } else {
                format!("\"id\":{},", json_string(&link.id))
            };
            let description = link
                .description
                .as_deref()
                .map(str::trim)
                .filter(|description| !description.is_empty())
                .map(json_string)
                .unwrap_or_else(|| "null".to_string());
            let target_entity_template_id = link
                .target_entity_template_id
                .as_deref()
                .map(json_string)
                .unwrap_or_else(|| "null".to_string());

            format!(
                "{{{}\"description\":{},\"listingIndex\":{},\"name\":{},\"targetEntityTemplateId\":{}}}",
                id_json,
                description,
                index,
                json_string(link.name.trim()),
                target_entity_template_id,
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    let owner_user_id_json = if entity_template.owner_user_id.trim().is_empty() {
        String::new()
    } else {
        format!(
            ",\"ownerUserId\":{}",
            json_string(entity_template.owner_user_id.trim())
        )
    };

    format!(
        "{{\"attributes\":[{}],\"description\":{},\"links\":[{}],\"listingAttributeId\":{},\"name\":{}{} }}",
        attributes_json,
        json_string(entity_template.description.trim()),
        links_json,
        json_string(&entity_template.listing_attribute_id),
        json_string(entity_template.name.trim()),
        owner_user_id_json,
    )
}

#[component]
pub(super) fn EntityTemplateContentView(
    modal: OpenModal,
    modals: Signal<Vec<OpenModal>>,
) -> Element {
    let ModalContent::EntityTemplate(entity_template) = modal.content.clone() else {
        return rsx! {};
    };

    let is_readonly = entity_template.mode == SecurityModalMode::Details;
    let form_class = if is_readonly {
        "entity-template-edit-form entity-template-view-form access-level-details"
    } else {
        "entity-template-edit-form entity-template-view-form access-level-details entity-template-create-form"
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
    let listing_attribute_summary = if !is_readonly && listing_attribute_label.is_empty() {
        " ".to_string()
    } else {
        listing_attribute_label
    };
    let listing_attribute_options = ordered_attributes
        .iter()
        .map(|attribute| SingleSelectOption {
            label: attribute.name.clone(),
            value: attribute.id.clone(),
        })
        .collect::<Vec<_>>();
    let listing_attribute_empty_text = if is_readonly {
        "Select listing attribute"
    } else {
        ""
    };

    rsx! {
        form {
            class: "{form_class}",
            "data-selectable": "true",
            onsubmit: move |event| event.prevent_default(),
            div { class: "entity-template-fields",
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "name" }
                    input {
                        key: "{modal.id}-entity-template-name",
                        onmounted: move |event| async move {
                            if !is_readonly {
                                let _ = event.set_focus(true).await;
                            }
                        },
                        readonly: is_readonly,
                        disabled: entity_template.is_saving,
                        r#type: "text",
                        value: "{entity_template.entity_template.name}",
                        oninput: move |event| update_entity_template_modal(
                            modals,
                            modal.id,
                            |entity_template| entity_template.entity_template.name = event.value(),
                        ),
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "description" }
                    textarea {
                        class: "entity-template-description-input",
                        readonly: is_readonly,
                        disabled: entity_template.is_saving,
                        rows: "1",
                        value: "{entity_template.entity_template.description}",
                        oninput: move |event| update_entity_template_modal(
                            modals,
                            modal.id,
                            |entity_template| {
                                entity_template.entity_template.description = event.value();
                            },
                        ),
                    }
                }
                label { onpointerdown: move |event| event.stop_propagation(),
                    span { "listing attribute" }
                    SingleSelectPicker {
                        disabled: is_readonly || ordered_attributes.is_empty(),
                        empty_text: listing_attribute_empty_text,
                        is_open: entity_template.is_listing_attribute_menu_open,
                        options: listing_attribute_options,
                        selected_value: entity_template.entity_template.listing_attribute_id.clone(),
                        summary: listing_attribute_summary,
                        on_toggle_open: move |_| update_entity_template_modal(
                            modals,
                            modal.id,
                            |entity_template| {
                                if entity_template.mode != SecurityModalMode::Details {
                                    entity_template.is_listing_attribute_menu_open =
                                        !entity_template.is_listing_attribute_menu_open;
                                    entity_template.is_attribute_popover_open = false;
                                    entity_template.is_attribute_template_menu_open = false;
                                    entity_template.open_attribute_access_level_menu_id = None;
                                    entity_template.open_attribute_value_type_menu_id = None;
                                }
                            },
                        ),
                        on_select_item: move |attribute_id: String| update_entity_template_modal(
                            modals,
                            modal.id,
                            |entity_template| {
                                entity_template.entity_template.listing_attribute_id = attribute_id;
                                entity_template.is_listing_attribute_menu_open = false;
                            },
                        ),
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
                                attribute_source_tab: entity_template.attribute_source_tab,
                                attribute_templates: entity_template.attribute_templates.read().clone(),
                                is_readonly,
                                is_attribute_template_menu_open: entity_template.is_attribute_template_menu_open,
                                is_attribute_popover_open: entity_template.is_attribute_popover_open,
                                is_new_attribute_value_type_menu_open: entity_template.is_new_attribute_value_type_menu_open,
                                modal_id: modal.id,
                                modals,
                                new_attribute_description: entity_template.new_attribute_description.clone(),
                                new_attribute_name: entity_template.new_attribute_name.clone(),
                                new_attribute_save_as_template: entity_template.new_attribute_save_as_template,
                                new_attribute_value_type: entity_template.new_attribute_value_type.clone(),
                                open_access_level_menu_id: entity_template.open_attribute_access_level_menu_id.clone(),
                                open_value_type_menu_id: entity_template.open_attribute_value_type_menu_id.clone(),
                                selected_attribute_template_id: entity_template.selected_attribute_template_id.clone(),
                            }
                        }
                    },
                    EntityTemplateTab::Links => rsx! {
                        div { role: "tabpanel",
                            LinksTable {
                                attribute_templates: entity_template.attribute_templates,
                                can_edit: !is_readonly,
                                current_entity_template_id: entity_template.entity_template.id.clone(),
                                entity_templates: entity_template.entity_templates.read().clone(),
                                links: ordered_links.clone(),
                                modals,
                                next_modal_id: modal.id,
                                open_link_target_menu_id: entity_template.open_link_target_menu_id.clone(),
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
                                attribute_templates: entity_template.attribute_templates,
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
            if let Some(error) = &entity_template.error {
                p { class: "form-error", "{error}" }
            }
            if entity_template.is_saving {
                p { class: "form-status", "Saving" }
            }
        }
    }
}

#[component]
fn AttributesTable(
    access_levels: Vec<AccessLevel>,
    attributes: Vec<EntityTemplateAttribute>,
    attribute_source_tab: EntityTemplateAttributeSourceTab,
    attribute_templates: Vec<AttributeTemplate>,
    is_readonly: bool,
    is_attribute_template_menu_open: bool,
    is_attribute_popover_open: bool,
    is_new_attribute_value_type_menu_open: bool,
    modal_id: u32,
    modals: Signal<Vec<OpenModal>>,
    new_attribute_description: String,
    new_attribute_name: String,
    new_attribute_save_as_template: bool,
    new_attribute_value_type: String,
    open_access_level_menu_id: Option<String>,
    open_value_type_menu_id: Option<String>,
    selected_attribute_template_id: Option<String>,
) -> Element {
    let empty_colspan = if is_readonly { "3" } else { "4" };
    let table_class = if is_readonly {
        "data-table entity-template-modal-table entity-template-attributes-table entity-template-view-attributes-table"
    } else {
        "data-table entity-template-modal-table entity-template-attributes-table entity-template-edit-attributes-table"
    };

    rsx! {
        table { class: "{table_class}",
            thead {
                tr {
                    th { "name" }
                    th { "value type" }
                    th { "access level" }
                    if !is_readonly {
                        th { class: "entity-template-attribute-action-column",
                            div { class: "entity-template-add-attribute-action",
                                button {
                                    class: "entity-template-table-action-button",
                                    "data-tooltip": if is_attribute_popover_open { "" } else { "Add attribute" },
                                    aria_label: "Add attribute",
                                    aria_expanded: "{is_attribute_popover_open}",
                                    r#type: "button",
                                    onclick: move |event| {
                                        event.stop_propagation();
                                        update_entity_template_modal(
                                            modals,
                                            modal_id,
                                            |entity_template| {
                                                entity_template.is_attribute_popover_open = !entity_template
                                                    .is_attribute_popover_open;
                                                entity_template.is_attribute_template_menu_open = false;
                                                entity_template.is_listing_attribute_menu_open = false;
                                                entity_template.is_info_open = false;
                                                entity_template.is_delete_confirm_open = false;
                                                entity_template.is_ownership_open = false;
                                                if entity_template.selected_attribute_template_id.is_none() {
                                                    entity_template.selected_attribute_template_id = entity_template
                                                        .attribute_templates
                                                        .read()
                                                        .first()
                                                        .map(|attribute_template| attribute_template.id.clone());
                                                }
                                            },
                                        );
                                    },
                                    Plus { class: "app-icon", size: 15 }
                                }
                                if is_attribute_popover_open {
                                    AttributeTemplatePopover {
                                        attribute_source_tab,
                                        attribute_templates: attribute_templates.clone(),
                                        is_attribute_template_menu_open,
                                        is_new_attribute_value_type_menu_open,
                                        modal_id,
                                        modals,
                                        new_attribute_description: new_attribute_description.clone(),
                                        new_attribute_name: new_attribute_name.clone(),
                                        new_attribute_save_as_template,
                                        new_attribute_value_type: new_attribute_value_type.clone(),
                                        selected_attribute_template_id: selected_attribute_template_id.clone(),
                                    }
                                }
                            }
                        }
                    }
                }
            }
            tbody {
                if attributes.is_empty() {
                    tr {
                        td {
                            class: "data-table-empty-cell",
                            colspan: "{empty_colspan}",
                            span { "There are no entries" }
                        }
                    }
                } else {
                    for attribute in attributes {
                        IncludedAttributeRow {
                            key: "{attribute.id}",
                            access_levels: access_levels.clone(),
                            attribute,
                            is_readonly,
                            modal_id,
                            modals,
                            open_access_level_menu_id: open_access_level_menu_id.clone(),
                            open_value_type_menu_id: open_value_type_menu_id.clone(),
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn IncludedAttributeRow(
    access_levels: Vec<AccessLevel>,
    attribute: EntityTemplateAttribute,
    is_readonly: bool,
    modal_id: u32,
    modals: Signal<Vec<OpenModal>>,
    open_access_level_menu_id: Option<String>,
    open_value_type_menu_id: Option<String>,
) -> Element {
    let attribute_id = attribute.id.clone();
    let value_type_options = VALUE_TYPES
        .iter()
        .map(|value_type| SingleSelectOption {
            label: value_type.to_string(),
            value: value_type.to_string(),
        })
        .collect::<Vec<_>>();
    let access_level_options = access_levels
        .iter()
        .map(|access_level| SingleSelectOption {
            label: access_level.name.clone(),
            value: access_level.id.to_string(),
        })
        .collect::<Vec<_>>();
    let access_level_summary = access_level_name(&access_levels, attribute.access_level_id);

    rsx! {
        tr {
            onpointerenter: {
                let attribute_id = attribute_id.clone();
                move |_| {
                    if is_readonly {
                        return;
                    }

                    update_entity_template_modal(
                        modals,
                        modal_id,
                        |entity_template| reorder_dragged_attribute(
                            entity_template,
                            &attribute_id,
                        ),
                    );
                }
            },
            onpointerup: move |_| update_entity_template_modal(
                modals,
                modal_id,
                |entity_template| entity_template.dragging_attribute_id = None,
            ),
            td {
                class: "entity-template-attribute-name",
                "data-tooltip": "{attribute.description}",
                if is_readonly {
                    "{attribute.name}"
                } else {
                    input {
                        class: "entity-template-attribute-name-input",
                        r#type: "text",
                        value: "{attribute.name}",
                        oninput: {
                            let attribute_id = attribute_id.clone();
                            move |event| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| {
                                    if let Some(attribute) = entity_template
                                        .entity_template
                                        .attributes
                                        .iter_mut()
                                        .find(|attribute| attribute.id == attribute_id)
                                    {
                                        attribute.name = event.value();
                                    }
                                },
                            )
                        },
                    }
                }
            }
            td { class: "entity-template-value-type-cell",
                if is_readonly {
                    span { "data-tooltip": "Value type", "{attribute.value_type}" }
                } else {
                    SingleSelectPicker {
                        disabled: false,
                        empty_text: "Select value type".to_string(),
                        is_open: open_value_type_menu_id.as_deref() == Some(attribute.id.as_str()),
                        options: value_type_options,
                        selected_value: attribute.value_type.clone(),
                        summary: attribute.value_type.clone(),
                        on_toggle_open: {
                            let attribute_id = attribute_id.clone();
                            move |_| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| {
                                    entity_template.open_attribute_value_type_menu_id =
                                        if entity_template.open_attribute_value_type_menu_id.as_deref()
                                            == Some(attribute_id.as_str())
                                    {
                                        None
                                    } else {
                                        Some(attribute_id.clone())
                                    };
                                    entity_template.open_attribute_access_level_menu_id = None;
                                    entity_template.is_listing_attribute_menu_open = false;
                                    entity_template.is_attribute_popover_open = false;
                                    entity_template.is_attribute_template_menu_open = false;
                                },
                            )
                        },
                        on_select_item: {
                            let attribute_id = attribute_id.clone();
                            move |value_type: String| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| {
                                    if let Some(attribute) = entity_template
                                        .entity_template
                                        .attributes
                                        .iter_mut()
                                        .find(|attribute| attribute.id == attribute_id)
                                    {
                                        attribute.value_type = value_type;
                                    }
                                    entity_template.open_attribute_value_type_menu_id = None;
                                },
                            )
                        },
                    }
                }
            }
            td {
                if is_readonly {
                    "{access_level_summary}"
                } else {
                    SingleSelectPicker {
                        disabled: false,
                        empty_text: "Select access level".to_string(),
                        is_open: open_access_level_menu_id.as_deref() == Some(attribute.id.as_str()),
                        options: access_level_options,
                        selected_value: attribute.access_level_id.to_string(),
                        summary: access_level_summary,
                        on_toggle_open: {
                            let attribute_id = attribute_id.clone();
                            move |_| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| {
                                    entity_template.open_attribute_access_level_menu_id =
                                        if entity_template.open_attribute_access_level_menu_id.as_deref()
                                            == Some(attribute_id.as_str())
                                    {
                                        None
                                    } else {
                                        Some(attribute_id.clone())
                                    };
                                    entity_template.open_attribute_value_type_menu_id = None;
                                    entity_template.is_listing_attribute_menu_open = false;
                                    entity_template.is_attribute_popover_open = false;
                                    entity_template.is_attribute_template_menu_open = false;
                                },
                            )
                        },
                        on_select_item: {
                            let attribute_id = attribute_id.clone();
                            move |access_level_id: String| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| {
                                    if let Ok(access_level_id) = access_level_id.parse::<u32>() {
                                        if let Some(attribute) = entity_template
                                            .entity_template
                                            .attributes
                                            .iter_mut()
                                            .find(|attribute| attribute.id == attribute_id)
                                        {
                                            attribute.access_level_id = access_level_id;
                                        }
                                    }
                                    entity_template.open_attribute_access_level_menu_id = None;
                                },
                            )
                        },
                    }
                }
            }
            if !is_readonly {
                td { class: "entity-template-attribute-action-column",
                    div { class: "entity-template-included-attribute-actions",
                        button {
                            class: "entity-template-row-action-button",
                            "data-tooltip": "Exclude",
                            aria_label: "Exclude",
                            r#type: "button",
                            onclick: {
                                let attribute_id = attribute_id.clone();
                                move |_| update_entity_template_modal(
                                    modals,
                                    modal_id,
                                    |entity_template| exclude_attribute(entity_template, &attribute_id),
                                )
                            },
                            Trash2 { class: "app-icon", size: 14 }
                        }
                        button {
                            class: "entity-template-row-action-button entity-template-drag-handle",
                            "data-tooltip": "Drag up or down to reorder",
                            aria_label: "Drag up or down to reorder",
                            r#type: "button",
                            onpointerdown: {
                                let attribute_id = attribute_id.clone();
                                move |event| {
                                    event.stop_propagation();
                                    update_entity_template_modal(
                                        modals,
                                        modal_id,
                                        |entity_template| {
                                            entity_template.dragging_attribute_id = Some(attribute_id.clone());
                                            entity_template.open_attribute_access_level_menu_id = None;
                                            entity_template.open_attribute_value_type_menu_id = None;
                                            entity_template.is_listing_attribute_menu_open = false;
                                            entity_template.is_attribute_popover_open = false;
                                            entity_template.is_attribute_template_menu_open = false;
                                        },
                                    );
                                }
                            },
                            onpointerup: move |_| update_entity_template_modal(
                                modals,
                                modal_id,
                                |entity_template| entity_template.dragging_attribute_id = None,
                            ),
                            GripVertical { class: "app-icon", size: 14 }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn AttributeTemplatePopover(
    attribute_source_tab: EntityTemplateAttributeSourceTab,
    attribute_templates: Vec<AttributeTemplate>,
    is_attribute_template_menu_open: bool,
    is_new_attribute_value_type_menu_open: bool,
    modal_id: u32,
    modals: Signal<Vec<OpenModal>>,
    new_attribute_description: String,
    new_attribute_name: String,
    new_attribute_save_as_template: bool,
    new_attribute_value_type: String,
    selected_attribute_template_id: Option<String>,
) -> Element {
    let selected_attribute_template_id = selected_attribute_template_id.or_else(|| {
        attribute_templates
            .first()
            .map(|attribute_template| attribute_template.id.clone())
    });
    let selected_attribute_template_id_value =
        selected_attribute_template_id.clone().unwrap_or_default();
    let selected_attribute_template_label = attribute_templates
        .iter()
        .find(|attribute_template| {
            Some(attribute_template.id.as_str()) == selected_attribute_template_id.as_deref()
        })
        .map(|attribute_template| attribute_template.name.clone())
        .unwrap_or_default();
    let attribute_template_options = attribute_templates
        .iter()
        .map(|attribute_template| SingleSelectOption {
            label: attribute_template.name.clone(),
            value: attribute_template.id.clone(),
        })
        .collect::<Vec<_>>();
    let value_type_options = VALUE_TYPES
        .iter()
        .map(|value_type| SingleSelectOption {
            label: value_type.to_string(),
            value: value_type.to_string(),
        })
        .collect::<Vec<_>>();
    let can_add_new_attribute = !new_attribute_name.trim().is_empty();

    rsx! {
        div {
            class: "include-attribute-popover entity-template-attribute-popover",
            onclick: move |event| event.stop_propagation(),
            onpointerdown: move |event| event.stop_propagation(),
            div { class: "entity-template-attribute-popover-header",
                div {
                    class: "entity-template-attribute-source-tabs",
                    role: "tablist",
                    aria_label: "Attribute source",
                    button {
                        class: "entity-template-attribute-source-tab",
                        aria_selected: "{attribute_source_tab == EntityTemplateAttributeSourceTab::Existing}",
                        role: "tab",
                        r#type: "button",
                        onclick: move |_| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.attribute_source_tab = EntityTemplateAttributeSourceTab::Existing;
                                entity_template.is_attribute_template_menu_open = false;
                                entity_template.is_new_attribute_value_type_menu_open = false;
                            },
                        ),
                        "Existing"
                    }
                    button {
                        class: "entity-template-attribute-source-tab",
                        aria_selected: "{attribute_source_tab == EntityTemplateAttributeSourceTab::New}",
                        role: "tab",
                        r#type: "button",
                        onclick: move |_| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.attribute_source_tab = EntityTemplateAttributeSourceTab::New;
                                entity_template.is_attribute_template_menu_open = false;
                                entity_template.is_new_attribute_value_type_menu_open = false;
                            },
                        ),
                        "New"
                    }
                }
                button {
                    class: "entity-template-attribute-popover-close",
                    aria_label: "Close attribute popup",
                    r#type: "button",
                    onclick: move |_| update_entity_template_modal(
                        modals,
                        modal_id,
                        |entity_template| {
                            entity_template.is_attribute_popover_open = false;
                            entity_template.is_attribute_template_menu_open = false;
                            entity_template.is_new_attribute_value_type_menu_open = false;
                        },
                    ),
                    X { class: "app-icon", size: 15 }
                }
            }
            if attribute_source_tab == EntityTemplateAttributeSourceTab::Existing {
                label { class: "entity-template-attribute-template-field",
                    span { "attribute template" }
                    SingleSelectPicker {
                        disabled: attribute_templates.is_empty(),
                        empty_text: "No attribute templates".to_string(),
                        is_open: is_attribute_template_menu_open,
                        options: attribute_template_options,
                        selected_value: selected_attribute_template_id_value.clone(),
                        summary: selected_attribute_template_label,
                        on_toggle_open: move |_| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.is_attribute_template_menu_open = !entity_template
                                    .is_attribute_template_menu_open;
                            },
                        ),
                        on_select_item: move |attribute_template_id| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.selected_attribute_template_id = Some(attribute_template_id);
                                entity_template.is_attribute_template_menu_open = false;
                            },
                        ),
                    }
                }
                div { class: "entity-template-attribute-popover-actions",
                    button {
                        class: "entity-template-attribute-add-button",
                        aria_label: "Add selected attribute template",
                        disabled: selected_attribute_template_id_value.is_empty(),
                        r#type: "button",
                        onclick: move |_| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                add_selected_attribute_template(entity_template);
                            },
                        ),
                        Plus { class: "app-icon", size: 16 }
                    }
                }
            } else {
                label { class: "entity-template-new-attribute-field",
                    span { "name" }
                    input {
                        class: "entity-template-attribute-name-input",
                        r#type: "text",
                        value: "{new_attribute_name}",
                        oninput: move |event| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.new_attribute_name = event.value();
                            },
                        ),
                    }
                }
                label { class: "entity-template-new-attribute-field",
                    span { "description" }
                    textarea {
                        rows: "2",
                        value: "{new_attribute_description}",
                        oninput: move |event| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.new_attribute_description = event.value();
                            },
                        ),
                    }
                }
                label { class: "entity-template-new-attribute-field",
                    span { "value type" }
                    SingleSelectPicker {
                        disabled: false,
                        empty_text: "Select value type".to_string(),
                        is_open: is_new_attribute_value_type_menu_open,
                        options: value_type_options,
                        selected_value: new_attribute_value_type.clone(),
                        summary: new_attribute_value_type.clone(),
                        on_toggle_open: move |_| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.is_new_attribute_value_type_menu_open =
                                    !entity_template.is_new_attribute_value_type_menu_open;
                                entity_template.is_attribute_template_menu_open = false;
                            },
                        ),
                        on_select_item: move |value_type: String| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.new_attribute_value_type = value_type;
                                entity_template.is_new_attribute_value_type_menu_open = false;
                            },
                        ),
                    }
                }
                label { class: "entity-template-new-attribute-checkbox",
                    input {
                        checked: new_attribute_save_as_template,
                        r#type: "checkbox",
                        onchange: move |event| update_entity_template_modal(
                            modals,
                            modal_id,
                            |entity_template| {
                                entity_template.new_attribute_save_as_template = event.checked();
                            },
                        ),
                    }
                    span { "save it as attribute template" }
                }
                div { class: "entity-template-attribute-popover-actions",
                    button {
                        class: "entity-template-attribute-add-button",
                        aria_label: "Add new attribute",
                        disabled: !can_add_new_attribute,
                        r#type: "button",
                        onclick: move |_| {
                            if can_add_new_attribute {
                                include_new_attribute(modals, modal_id);
                            }
                        },
                        Plus { class: "app-icon", size: 16 }
                    }
                }
            }
        }
    }
}

#[component]
fn LinksTable(
    access_levels: Vec<AccessLevel>,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
    can_edit: bool,
    current_entity_template_id: String,
    entity_templates: Vec<EntityTemplate>,
    links: Vec<EntityTemplateLink>,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: u32,
    open_link_target_menu_id: Option<String>,
    owner_users: Vec<RebirthUser>,
    session_key: String,
) -> Element {
    let empty_colspan = if can_edit { "4" } else { "3" };
    let target_candidates = link_target_candidates(&entity_templates, &current_entity_template_id);
    let can_include_link = !target_candidates.is_empty();
    let include_link_tooltip = if can_include_link {
        "Include link"
    } else {
        "There are no other entity templates that can be used as outlink's target"
    };

    rsx! {
        table { class: "data-table entity-template-modal-table entity-template-links-table entity-template-view-links-table",
            thead {
                tr {
                    th { "name" }
                    th { "description" }
                    th { "target" }
                    if can_edit {
                        th { class: "entity-template-link-action-column",
                            button {
                                class: "entity-template-table-action-button entity-template-link-add-button",
                                "data-tooltip": include_link_tooltip,
                                aria_label: "Include link",
                                disabled: !can_include_link,
                                r#type: "button",
                                onclick: move |_| update_entity_template_modal(
                                    modals,
                                    next_modal_id,
                                    |entity_template| add_entity_template_link(entity_template),
                                ),
                                Plus { class: "app-icon", size: 15 }
                            }
                        }
                    }
                }
            }
            tbody {
                if links.is_empty() {
                    tr {
                        td {
                            class: "data-table-empty-cell",
                            colspan: "{empty_colspan}",
                            span { "There are no entries" }
                        }
                    }
                } else {
                    for link in links {
                        LinkRow {
                            key: "{link.id}",
                            access_levels: access_levels.clone(),
                            attribute_templates,
                            can_edit,
                            entity_templates: entity_templates.clone(),
                            link,
                            modals,
                            open_link_target_menu_id: open_link_target_menu_id.clone(),
                            target_candidates: target_candidates.clone(),
                            next_modal_id,
                            owner_users: owner_users.clone(),
                            session_key: session_key.clone(),
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn LinkRow(
    access_levels: Vec<AccessLevel>,
    attribute_templates: Signal<Vec<AttributeTemplate>>,
    can_edit: bool,
    entity_templates: Vec<EntityTemplate>,
    link: EntityTemplateLink,
    modals: Signal<Vec<OpenModal>>,
    next_modal_id: u32,
    open_link_target_menu_id: Option<String>,
    owner_users: Vec<RebirthUser>,
    session_key: String,
    target_candidates: Vec<EntityTemplate>,
) -> Element {
    let link_id = link.id.clone();
    let target_options = target_candidates
        .iter()
        .map(|target| SingleSelectOption {
            label: target.name.clone(),
            value: target.id.clone(),
        })
        .collect::<Vec<_>>();
    let target_summary = link
        .target_entity_template_id
        .as_deref()
        .and_then(|target_id| {
            target_candidates
                .iter()
                .find(|target| target.id == target_id)
                .map(|target| target.name.clone())
        })
        .unwrap_or_default();

    rsx! {
        tr {
            td {
                if can_edit {
                    input {
                        class: "entity-template-link-input",
                        r#type: "text",
                        value: "{link.name}",
                        oninput: {
                            let link_id = link_id.clone();
                            move |event| update_entity_template_modal(
                                modals,
                                next_modal_id,
                                |entity_template| {
                                    if let Some(link) = entity_template
                                        .entity_template
                                        .links
                                        .iter_mut()
                                        .find(|link| link.id == link_id)
                                    {
                                        link.name = event.value();
                                    }
                                },
                            )
                        },
                    }
                } else {
                    "{link.name}"
                }
            }
            td {
                if can_edit {
                    input {
                        class: "entity-template-link-input",
                        r#type: "text",
                        value: "{link.description.clone().unwrap_or_default()}",
                        oninput: {
                            let link_id = link_id.clone();
                            move |event| update_entity_template_modal(
                                modals,
                                next_modal_id,
                                |entity_template| {
                                    if let Some(link) = entity_template
                                        .entity_template
                                        .links
                                        .iter_mut()
                                        .find(|link| link.id == link_id)
                                    {
                                        let description = event.value();
                                        link.description = if description.is_empty() {
                                            None
                                        } else {
                                            Some(description)
                                        };
                                    }
                                },
                            )
                        },
                    }
                } else {
                    span { "{link.description.clone().unwrap_or_default()}" }
                }
            }
            td {
                if can_edit {
                    SingleSelectPicker {
                        disabled: target_candidates.is_empty(),
                        empty_text: "Select target".to_string(),
                        is_open: open_link_target_menu_id.as_deref() == Some(link.id.as_str()),
                        options: target_options,
                        selected_value: link.target_entity_template_id.clone().unwrap_or_default(),
                        summary: target_summary,
                        on_toggle_open: {
                            let link_id = link_id.clone();
                            move |_| update_entity_template_modal(
                                modals,
                                next_modal_id,
                                |entity_template| {
                                    entity_template.open_link_target_menu_id =
                                        if entity_template.open_link_target_menu_id.as_deref()
                                            == Some(link_id.as_str())
                                    {
                                        None
                                    } else {
                                        Some(link_id.clone())
                                    };
                                    entity_template.open_attribute_access_level_menu_id = None;
                                    entity_template.open_attribute_value_type_menu_id = None;
                                    entity_template.is_attribute_popover_open = false;
                                    entity_template.is_attribute_template_menu_open = false;
                                    entity_template.is_listing_attribute_menu_open = false;
                                },
                            )
                        },
                        on_select_item: {
                            let link_id = link_id.clone();
                            move |target_id: String| update_entity_template_modal(
                                modals,
                                next_modal_id,
                                |entity_template| {
                                    if let Some(link) = entity_template
                                        .entity_template
                                        .links
                                        .iter_mut()
                                        .find(|link| link.id == link_id)
                                    {
                                        link.target_entity_template_id = Some(target_id);
                                    }
                                    entity_template.open_link_target_menu_id = None;
                                },
                            )
                        },
                    }
                } else if let Some(target) = linked_entity_template(
                    &entity_templates,
                    link.target_entity_template_id.as_deref(),
                )
                {
                    EntityReferenceButton {
                        access_levels,
                        attribute_templates,
                        can_edit: true,
                        entity_template: target,
                        entity_templates: Signal::new(entity_templates.clone()),
                        modals,
                        next_modal_id,
                        owner_users,
                        session_key,
                    }
                } else if let Some(target_id) = link.target_entity_template_id.clone() {
                    "{target_id}"
                }
            }
            if can_edit {
                td { class: "entity-template-link-action-column",
                    div { class: "entity-template-included-attribute-actions",
                        button {
                            class: "entity-template-row-action-button",
                            "data-tooltip": "Exclude",
                            aria_label: "Exclude link",
                            r#type: "button",
                            onclick: {
                                let link_id = link_id.clone();
                                move |_| update_entity_template_modal(
                                    modals,
                                    next_modal_id,
                                    |entity_template| exclude_link(entity_template, &link_id),
                                )
                            },
                            Trash2 { class: "app-icon", size: 14 }
                        }
                        button {
                            class: "entity-template-row-action-button entity-template-drag-handle",
                            "data-tooltip": "Drag up or down to reorder",
                            aria_label: "Drag up or down to reorder link",
                            r#type: "button",
                            GripVertical { class: "app-icon", size: 14 }
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
    attribute_templates: Signal<Vec<AttributeTemplate>>,
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
                for (link , source_template) in incoming_links {
                    tr { key: "{source_template.id}:{link.id}",
                        td {
                            EntityReferenceButton {
                                access_levels: access_levels.clone(),
                                attribute_templates,
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
    attribute_templates: Signal<Vec<AttributeTemplate>>,
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
                    attribute_templates,
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

fn add_selected_attribute_template(entity_template: &mut EntityTemplateModal) {
    let selected_attribute_template_id = entity_template
        .selected_attribute_template_id
        .clone()
        .or_else(|| {
            entity_template
                .attribute_templates
                .read()
                .first()
                .map(|attribute_template| attribute_template.id.clone())
        });
    let Some(selected_attribute_template_id) = selected_attribute_template_id else {
        return;
    };

    if entity_template
        .entity_template
        .attributes
        .iter()
        .any(|attribute| attribute.id == selected_attribute_template_id)
    {
        entity_template.is_attribute_popover_open = false;
        entity_template.is_attribute_template_menu_open = false;
        return;
    }

    let Some(attribute_template) = entity_template
        .attribute_templates
        .read()
        .iter()
        .find(|attribute_template| attribute_template.id == selected_attribute_template_id)
        .cloned()
    else {
        return;
    };

    let listing_index = entity_template
        .entity_template
        .attributes
        .iter()
        .map(|attribute| attribute.listing_index)
        .max()
        .unwrap_or(-1)
        + 1;

    entity_template
        .entity_template
        .attributes
        .push(EntityTemplateAttribute {
            access_level_id: attribute_template.access_level_id,
            description: attribute_template.description,
            id: attribute_template.id.clone(),
            is_required: attribute_template.is_required,
            listing_index,
            name: attribute_template.name,
            value_type: attribute_template.value_type,
        });

    if entity_template
        .entity_template
        .listing_attribute_id
        .is_empty()
    {
        entity_template.entity_template.listing_attribute_id = attribute_template.id;
    }

    entity_template.is_attribute_popover_open = false;
    entity_template.is_attribute_template_menu_open = false;
}

fn include_new_attribute(modals: Signal<Vec<OpenModal>>, modal_id: u32) {
    let Some(mut entity_template) = modals
        .read()
        .iter()
        .find(|open_modal| open_modal.id == modal_id)
        .and_then(|open_modal| match &open_modal.content {
            ModalContent::EntityTemplate(entity_template) => Some(entity_template.clone()),
            _ => None,
        })
    else {
        return;
    };

    let name = entity_template.new_attribute_name.trim().to_string();
    let description = entity_template.new_attribute_description.trim().to_string();
    let value_type = if entity_template.new_attribute_value_type.is_empty() {
        "text".to_string()
    } else {
        entity_template.new_attribute_value_type.clone()
    };
    let access_level_id = default_attribute_access_level_id(&entity_template.access_levels);

    if name.is_empty() {
        update_entity_template_modal(modals, modal_id, |entity_template| {
            entity_template.error = Some("Attribute name is required".to_string());
        });
        return;
    }

    update_entity_template_modal(modals, modal_id, |entity_template| {
        entity_template.error = None;
        entity_template.is_saving = entity_template.new_attribute_save_as_template;
    });

    if entity_template.new_attribute_save_as_template {
        spawn(async move {
            match create_attribute_template_for_new_attribute(
                &entity_template.session_key,
                &name,
                &description,
                &value_type,
                access_level_id,
            )
            .await
            {
                Ok(saved_attribute_template) => {
                    {
                        let mut attribute_templates = entity_template.attribute_templates.write();
                        attribute_templates.push(saved_attribute_template.clone());
                        attribute_templates.sort_by(|left, right| {
                            left.name
                                .to_ascii_lowercase()
                                .cmp(&right.name.to_ascii_lowercase())
                        });
                    }

                    update_entity_template_modal(modals, modal_id, |entity_template| {
                        add_new_attribute_from_values(
                            entity_template,
                            saved_attribute_template.name,
                            saved_attribute_template.description,
                            saved_attribute_template.value_type,
                            saved_attribute_template.access_level_id,
                            saved_attribute_template.is_required,
                        );
                        entity_template.is_saving = false;
                    });
                }
                Err(message) => update_entity_template_modal(modals, modal_id, |entity_template| {
                    entity_template.is_saving = false;
                    entity_template.error = Some(message);
                }),
            }
        });
    } else {
        update_entity_template_modal(modals, modal_id, |entity_template| {
            add_new_attribute_from_values(
                entity_template,
                name,
                description,
                value_type,
                access_level_id,
                false,
            );
        });
    }
}

async fn create_attribute_template_for_new_attribute(
    session_key: &str,
    name: &str,
    description: &str,
    value_type: &str,
    access_level_id: u32,
) -> Result<AttributeTemplate, String> {
    let response = Request::post(&format!("{API_BASE_URL}/attribute-templates"))
        .header("Authorization", &format!("Bearer {session_key}"))
        .header("Content-Type", "application/json")
        .body(format!(
            "{{\"accessLevelId\":{},\"defaultValue\":null,\"description\":{},\"isRequired\":false,\"name\":{},\"valueType\":{}}}",
            access_level_id,
            json_string(description),
            json_string(name),
            json_string(value_type),
        ))
        .map_err(|_| "Unable to create attribute template".to_string())?
        .send()
        .await
        .map_err(|_| "Unable to create attribute template".to_string())?;

    if response.ok() {
        response
            .json::<crate::types::AttributeTemplateResponse>()
            .await
            .map(|payload| payload.data)
            .map_err(|_| "Unable to create attribute template".to_string())
    } else {
        Err(read_response_error(response, "Unable to create attribute template").await)
    }
}

fn add_new_attribute_from_values(
    entity_template: &mut EntityTemplateModal,
    name: String,
    description: String,
    value_type: String,
    access_level_id: u32,
    is_required: bool,
) {
    let listing_index = entity_template
        .entity_template
        .attributes
        .iter()
        .map(|attribute| attribute.listing_index)
        .max()
        .unwrap_or(-1)
        + 1;
    let attribute_id = new_entity_template_attribute_id();

    entity_template
        .entity_template
        .attributes
        .push(EntityTemplateAttribute {
            access_level_id,
            description,
            id: attribute_id.clone(),
            is_required,
            listing_index,
            name,
            value_type,
        });

    if entity_template
        .entity_template
        .listing_attribute_id
        .is_empty()
    {
        entity_template.entity_template.listing_attribute_id = attribute_id;
    }

    entity_template.is_attribute_popover_open = false;
    entity_template.is_attribute_template_menu_open = false;
    entity_template.is_new_attribute_value_type_menu_open = false;
    entity_template.new_attribute_description = String::new();
    entity_template.new_attribute_name = String::new();
    entity_template.new_attribute_save_as_template = false;
    entity_template.new_attribute_value_type = "text".to_string();
}

fn default_attribute_access_level_id(access_levels: &[AccessLevel]) -> u32 {
    access_levels
        .first()
        .map(|access_level| access_level.id)
        .unwrap_or(4)
}

fn new_entity_template_attribute_id() -> String {
    let mut bytes = [0_u8; 16];

    if !fill_random_bytes(&mut bytes) {
        let counter = ATTRIBUTE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        bytes[0..8].copy_from_slice(&counter.to_be_bytes());
        bytes[8..16].copy_from_slice(&counter.wrapping_mul(0x9e37_79b9_7f4a_7c15).to_be_bytes());
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15],
    )
}

#[cfg(target_arch = "wasm32")]
fn fill_random_bytes(bytes: &mut [u8]) -> bool {
    web_sys::window()
        .and_then(|window| window.crypto().ok())
        .and_then(|crypto| crypto.get_random_values_with_u8_array(bytes).ok())
        .is_some()
}

#[cfg(not(target_arch = "wasm32"))]
fn fill_random_bytes(_bytes: &mut [u8]) -> bool {
    false
}

fn exclude_attribute(entity_template: &mut EntityTemplateModal, attribute_id: &str) {
    entity_template
        .entity_template
        .attributes
        .retain(|attribute| attribute.id != attribute_id);

    if entity_template.entity_template.listing_attribute_id == attribute_id {
        entity_template.entity_template.listing_attribute_id = entity_template
            .entity_template
            .attributes
            .iter()
            .min_by_key(|attribute| attribute.listing_index)
            .map(|attribute| attribute.id.clone())
            .unwrap_or_default();
    }

    normalize_attribute_listing_indexes(entity_template);
    entity_template.open_attribute_access_level_menu_id = None;
    entity_template.open_attribute_value_type_menu_id = None;
}

fn add_entity_template_link(entity_template: &mut EntityTemplateModal) {
    let candidates = link_target_candidates(
        &entity_template.entity_templates.read(),
        &entity_template.entity_template.id,
    );
    let Some(target) = candidates.first() else {
        return;
    };

    let listing_index = entity_template
        .entity_template
        .links
        .iter()
        .map(|link| link.listing_index)
        .max()
        .unwrap_or(-1)
        + 1;

    entity_template
        .entity_template
        .links
        .push(EntityTemplateLink {
            description: None,
            entity_template_id: entity_template.entity_template.id.clone(),
            id: format!("draft-link-{listing_index}"),
            listing_index,
            name: String::new(),
            target_entity_template_id: Some(target.id.clone()),
        });
}

fn exclude_link(entity_template: &mut EntityTemplateModal, link_id: &str) {
    entity_template
        .entity_template
        .links
        .retain(|link| link.id != link_id);
    entity_template.open_link_target_menu_id = None;

    let mut links = ordered_links(&entity_template.entity_template);
    for (index, link) in links.iter_mut().enumerate() {
        link.listing_index = index as i32;
    }
    entity_template.entity_template.links = links;
}

fn reorder_dragged_attribute(entity_template: &mut EntityTemplateModal, target_attribute_id: &str) {
    let Some(dragging_attribute_id) = entity_template.dragging_attribute_id.clone() else {
        return;
    };

    if dragging_attribute_id == target_attribute_id {
        return;
    }

    let mut attributes = ordered_attributes(&entity_template.entity_template);
    let Some(from_index) = attributes
        .iter()
        .position(|attribute| attribute.id == dragging_attribute_id)
    else {
        entity_template.dragging_attribute_id = None;
        return;
    };
    let Some(to_index) = attributes
        .iter()
        .position(|attribute| attribute.id == target_attribute_id)
    else {
        entity_template.dragging_attribute_id = None;
        return;
    };

    let dragged_attribute = attributes.remove(from_index);
    attributes.insert(to_index, dragged_attribute);

    for (index, attribute) in attributes.iter_mut().enumerate() {
        attribute.listing_index = index as i32;
    }

    entity_template.entity_template.attributes = attributes;
}

fn normalize_attribute_listing_indexes(entity_template: &mut EntityTemplateModal) {
    let mut attributes = ordered_attributes(&entity_template.entity_template);

    for (index, attribute) in attributes.iter_mut().enumerate() {
        attribute.listing_index = index as i32;
    }

    entity_template.entity_template.attributes = attributes;
}

fn link_target_candidates(
    entity_templates: &[EntityTemplate],
    current_entity_template_id: &str,
) -> Vec<EntityTemplate> {
    let mut candidates = entity_templates
        .iter()
        .filter(|entity_template| {
            current_entity_template_id.is_empty()
                || entity_template.id != current_entity_template_id
        })
        .cloned()
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| left.name.cmp(&right.name));
    candidates
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
