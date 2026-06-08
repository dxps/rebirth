use serde::Serialize;

pub const APP_NAME: &str = "Rebirth";

#[derive(Debug, Clone, Serialize)]
pub struct AccessLevel {
    pub id: i32,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Permission {
    pub id: i32,
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub access_levels: Vec<AccessLevel>,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub username: String,
    pub permissions: Vec<Permission>,
}

impl User {
    pub fn has_permission(&self, name: &str) -> bool {
        self.permissions
            .iter()
            .any(|permission| permission.name == name)
    }

    pub fn can_manage_own_data(&self) -> bool {
        self.has_permission("Manage Own Data")
    }

    pub fn can_manage_data(&self) -> bool {
        self.has_permission("Admin") || self.has_permission("Editor")
    }

    pub fn can_create_managed_data(&self) -> bool {
        self.can_manage_data() || self.can_manage_own_data()
    }

    pub fn can_view_data(&self) -> bool {
        self.can_create_managed_data() || self.has_permission("Viewer")
    }

    pub fn can_manage_security(&self) -> bool {
        self.has_permission("Admin")
    }

    pub fn can_view_audit(&self) -> bool {
        self.has_permission("Admin") || self.has_permission("Audit")
    }

    pub fn can_manage_owned_record(&self, owner_user_id: &str) -> bool {
        self.can_manage_data() || (self.can_manage_own_data() && owner_user_id == self.id)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeTemplate {
    pub id: String,
    pub owner_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_username: Option<String>,
    pub name: String,
    pub description: String,
    pub value_type: String,
    pub default_value: Option<String>,
    pub is_required: bool,
    pub access_level_id: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplateAttribute {
    pub id: String,
    pub name: String,
    pub description: String,
    pub value_type: String,
    pub default_value: Option<String>,
    pub is_required: bool,
    pub access_level_id: i32,
    pub listing_index: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplateLink {
    pub id: String,
    pub entity_template_id: String,
    pub target_entity_template_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub listing_index: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTemplate {
    pub id: String,
    pub owner_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_username: Option<String>,
    pub name: String,
    pub description: String,
    pub attributes: Vec<EntityTemplateAttribute>,
    pub listing_attribute_id: String,
    pub links: Vec<EntityTemplateLink>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityAttribute {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_required: bool,
    pub access_level_id: i32,
    pub listing_index: i32,
    pub value: String,
    pub value_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityLink {
    pub id: String,
    pub entity_id: String,
    pub target_entity_id: Option<String>,
    pub target_entity_label: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub listing_index: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityIncomingLink {
    pub id: String,
    pub description: Option<String>,
    pub listing_index: i32,
    pub name: String,
    pub source_entity_id: String,
    pub source_entity_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub owner_user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_username: Option<String>,
    pub attributes: Vec<EntityAttribute>,
    pub listing_attribute_id: String,
    pub links: Vec<EntityLink>,
    pub incoming_links: Vec<EntityIncomingLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incoming_links_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outgoing_links_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEvent {
    pub id: String,
    pub name: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpringConfigPropertySource {
    pub name: String,
    pub source: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpringConfigEnvironment {
    pub label: Option<String>,
    pub name: String,
    pub profiles: Vec<String>,
    pub property_sources: Vec<SpringConfigPropertySource>,
    pub state: Option<String>,
    pub version: Option<String>,
}
