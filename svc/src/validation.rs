use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;

// UUID v7 (version nibble must be 7), used for primary entity identifiers.
static UUID_V7: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
    .unwrap()
});

// Loose UUID (any version), used for client-generated attribute/link ids.
static UUID_LOOSE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
    .unwrap()
});

pub fn is_uuid_v7(value: &str) -> bool {
    UUID_V7.is_match(value)
}

pub fn is_loose_uuid(value: &str) -> bool {
    UUID_LOOSE.is_match(value)
}

pub fn is_value_type(value: &Value) -> bool {
    matches!(
        value.as_str(),
        Some("text") | Some("number") | Some("boolean") | Some("date") | Some("datetime")
    )
}

fn is_access_level_id_value(value: &Value) -> bool {
    value.as_i64().map(|id| id > 0).unwrap_or(false)
}

fn is_permission_id_value(value: &Value) -> bool {
    value.as_i64().map(|id| id > 0).unwrap_or(false)
}

fn is_non_negative_int(value: &Value) -> bool {
    value.as_i64().map(|n| n >= 0).unwrap_or(false)
}

/// `undefined` (absent) or matches predicate.
fn opt<F: Fn(&Value) -> bool>(parent: &Value, key: &str, pred: F) -> bool {
    match parent.get(key) {
        None => true,
        Some(value) => pred(value),
    }
}

fn is_str(value: &Value) -> bool {
    value.is_string()
}

pub fn has_valid_access_level_ids(value: Option<&Value>) -> bool {
    let Some(Value::Array(items)) = value else {
        return false;
    };
    let unique: HashSet<i64> = items.iter().filter_map(Value::as_i64).collect();
    unique.len() == items.len() && items.iter().all(is_access_level_id_value)
}

pub fn has_valid_permission_ids(value: Option<&Value>) -> bool {
    let Some(Value::Array(items)) = value else {
        return false;
    };
    if items.is_empty() {
        return false;
    }
    let unique: HashSet<i64> = items.iter().filter_map(Value::as_i64).collect();
    unique.len() == items.len() && items.iter().all(is_permission_id_value)
}

pub fn is_create_access_level_input(v: &Value) -> bool {
    v.is_object()
        && v.get("name").map(is_str).unwrap_or(false)
        && v.get("description").map(is_str).unwrap_or(false)
}

pub fn is_update_access_level_input(v: &Value) -> bool {
    v.is_object() && opt(v, "name", is_str) && opt(v, "description", is_str)
}

pub fn is_login_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    let identifier_ok = v
        .get("identifier")
        .and_then(Value::as_str)
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let password_ok = v
        .get("password")
        .and_then(Value::as_str)
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    identifier_ok && password_ok
}

pub fn is_create_user_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    v.get("email").map(is_str).unwrap_or(false)
        && v.get("firstName").map(is_str).unwrap_or(false)
        && v.get("lastName").map(is_str).unwrap_or(false)
        && v.get("username").map(is_str).unwrap_or(false)
        && v.get("password").and_then(Value::as_str).map(|p| p.len() >= 8).unwrap_or(false)
        && has_valid_access_level_ids(v.get("accessLevelIds"))
        && has_valid_permission_ids(v.get("permissionIds"))
}

pub fn is_update_user_info_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    let email_ok = v
        .get("email")
        .and_then(Value::as_str)
        .map(|s| !s.trim().is_empty() && s.contains('@'))
        .unwrap_or(false);
    email_ok
        && v.get("firstName").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false)
        && v.get("lastName").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false)
        && v.get("username").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false)
}

pub fn is_update_password_input(v: &Value) -> bool {
    v.is_object()
        && v.get("currentPassword").and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false)
        && v.get("newPassword").and_then(Value::as_str).map(|s| s.len() >= 8).unwrap_or(false)
}

pub fn is_update_password_input_with_short_new_password(v: &Value) -> bool {
    v.is_object()
        && v.get("currentPassword").and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false)
        && v.get("newPassword").and_then(Value::as_str).map(|s| !s.is_empty() && s.len() < 8).unwrap_or(false)
}

fn is_owner_user_id(value: &Value) -> bool {
    value.as_str().map(is_uuid_v7).unwrap_or(false)
}

pub fn is_update_user_input(v: &Value) -> bool {
    v.is_object()
        && opt(v, "email", is_str)
        && opt(v, "firstName", is_str)
        && opt(v, "lastName", is_str)
        && opt(v, "username", is_str)
        && opt(v, "password", |value| value.as_str().map(|p| p.len() >= 8).unwrap_or(false))
        && match v.get("accessLevelIds") {
            None => true,
            some => has_valid_access_level_ids(some),
        }
        && match v.get("permissionIds") {
            None => true,
            some => has_valid_permission_ids(some),
        }
}

fn is_nullable_str(value: &Value) -> bool {
    value.is_null() || value.is_string()
}

pub fn is_create_attribute_template_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    v.get("name").map(is_str).unwrap_or(false)
        && v.get("description").map(is_str).unwrap_or(false)
        && v.get("valueType").map(is_value_type).unwrap_or(false)
        && opt(v, "defaultValue", is_nullable_str)
        && v.get("isRequired").map(Value::is_boolean).unwrap_or(false)
        && v.get("accessLevelId").map(is_access_level_id_value).unwrap_or(false)
        && opt(v, "ownerUserId", is_owner_user_id)
}

pub fn is_update_attribute_template_input(v: &Value) -> bool {
    v.is_object()
        && opt(v, "name", is_str)
        && opt(v, "description", is_str)
        && opt(v, "valueType", is_value_type)
        && opt(v, "defaultValue", is_nullable_str)
        && opt(v, "isRequired", Value::is_boolean)
        && opt(v, "accessLevelId", is_access_level_id_value)
        && opt(v, "ownerUserId", is_owner_user_id)
}

pub fn has_valid_entity_template_attributes(
    attributes: Option<&Value>,
    listing_attribute_id: Option<&Value>,
) -> bool {
    let Some(Value::Array(items)) = attributes else {
        return false;
    };
    if items.is_empty() {
        return false;
    }
    let Some(listing_id) = listing_attribute_id.and_then(Value::as_str) else {
        return false;
    };
    if !is_loose_uuid(listing_id) {
        return false;
    }

    let mut ids: Vec<String> = Vec::new();
    let mut listing_indexes: Vec<i64> = Vec::new();
    for attribute in items {
        if let Some(id) = attribute.get("id").and_then(Value::as_str) {
            ids.push(id.to_string());
        }
        if let Some(idx) = attribute.get("listingIndex").and_then(Value::as_i64) {
            listing_indexes.push(idx);
        }
    }
    let unique_ids: HashSet<&String> = ids.iter().collect();
    let unique_indexes: HashSet<i64> = listing_indexes.iter().copied().collect();
    if unique_ids.len() != items.len() || unique_indexes.len() != items.len() {
        return false;
    }

    let all_valid = items.iter().all(|attribute| {
        attribute.is_object()
            && attribute.get("id").and_then(Value::as_str).map(is_loose_uuid).unwrap_or(false)
            && attribute.get("name").map(is_str).unwrap_or(false)
            && attribute.get("description").map(is_str).unwrap_or(false)
            && attribute.get("valueType").map(is_value_type).unwrap_or(false)
            && attribute.get("isRequired").map(Value::is_boolean).unwrap_or(false)
            && attribute.get("accessLevelId").map(is_access_level_id_value).unwrap_or(false)
            && attribute.get("listingIndex").map(is_non_negative_int).unwrap_or(false)
    });

    all_valid && ids.iter().any(|id| id == listing_id)
}

fn is_create_entity_template_link_input(v: &Value) -> bool {
    v.is_object()
        && opt(v, "id", |value| value.as_str().map(is_loose_uuid).unwrap_or(false))
        && match v.get("targetEntityTemplateId") {
            None => true,
            Some(Value::Null) => true,
            Some(value) => value.as_str().map(is_uuid_v7).unwrap_or(false),
        }
        && v.get("name").map(is_str).unwrap_or(false)
        && opt(v, "description", is_nullable_str)
        && v.get("listingIndex").map(is_non_negative_int).unwrap_or(false)
}

fn links_all<F: Fn(&Value) -> bool>(parent: &Value, pred: F) -> bool {
    match parent.get("links") {
        None => true,
        Some(Value::Array(items)) => items.iter().all(pred),
        Some(_) => false,
    }
}

pub fn is_create_entity_template_input(v: &Value) -> bool {
    v.is_object()
        && v.get("name").map(is_str).unwrap_or(false)
        && opt(v, "ownerUserId", is_owner_user_id)
        && v.get("description").map(is_str).unwrap_or(false)
        && has_valid_entity_template_attributes(v.get("attributes"), v.get("listingAttributeId"))
        && links_all(v, is_create_entity_template_link_input)
}

pub fn is_update_entity_template_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    let has_attribute_update =
        v.get("attributes").is_some() || v.get("listingAttributeId").is_some();
    opt(v, "name", is_str)
        && opt(v, "ownerUserId", is_owner_user_id)
        && opt(v, "description", is_str)
        && (!has_attribute_update
            || has_valid_entity_template_attributes(
                v.get("attributes"),
                v.get("listingAttributeId"),
            ))
        && links_all(v, is_create_entity_template_link_input)
}

fn has_valid_entity_attributes(
    attributes: Option<&Value>,
    listing_attribute_id: Option<&Value>,
) -> bool {
    let Some(Value::Array(items)) = attributes else {
        return false;
    };
    if items.is_empty() {
        return false;
    }
    let Some(listing_id) = listing_attribute_id.and_then(Value::as_str) else {
        return false;
    };
    if !is_loose_uuid(listing_id) {
        return false;
    }

    let mut ids: Vec<String> = Vec::new();
    let mut listing_indexes: Vec<i64> = Vec::new();
    for attribute in items {
        if let Some(id) = attribute.get("id").and_then(Value::as_str) {
            ids.push(id.to_string());
        }
        if let Some(idx) = attribute.get("listingIndex").and_then(Value::as_i64) {
            listing_indexes.push(idx);
        }
    }
    let unique_ids: HashSet<&String> = ids.iter().collect();
    let unique_indexes: HashSet<i64> = listing_indexes.iter().copied().collect();
    if unique_ids.len() != items.len() || unique_indexes.len() != items.len() {
        return false;
    }

    let all_valid = items.iter().all(|attribute| {
        attribute.is_object()
            && attribute.get("id").and_then(Value::as_str).map(is_loose_uuid).unwrap_or(false)
            && attribute.get("name").map(is_str).unwrap_or(false)
            && attribute.get("description").map(is_str).unwrap_or(false)
            && attribute.get("valueType").map(is_value_type).unwrap_or(false)
            && attribute.get("isRequired").map(Value::is_boolean).unwrap_or(false)
            && attribute.get("accessLevelId").map(is_access_level_id_value).unwrap_or(false)
            && attribute.get("listingIndex").map(is_non_negative_int).unwrap_or(false)
            && attribute.get("value").map(is_str).unwrap_or(false)
    });

    all_valid && ids.iter().any(|id| id == listing_id)
}

fn is_create_entity_link_input(v: &Value) -> bool {
    v.is_object()
        && match v.get("targetEntityId") {
            None => true,
            Some(Value::Null) => true,
            Some(value) => value.as_str().map(is_uuid_v7).unwrap_or(false),
        }
        && v.get("name").map(is_str).unwrap_or(false)
        && opt(v, "description", is_nullable_str)
        && v.get("listingIndex").map(is_non_negative_int).unwrap_or(false)
}

fn is_entity_template_attribute_value_input(v: &Value) -> bool {
    v.is_object()
        && v.get("entityTemplateAttributeId").and_then(Value::as_str).map(is_loose_uuid).unwrap_or(false)
        && v.get("value").map(is_str).unwrap_or(false)
}

fn is_entity_template_link_target_input(v: &Value) -> bool {
    v.is_object()
        && v.get("entityTemplateLinkId").and_then(Value::as_str).map(is_loose_uuid).unwrap_or(false)
        && match v.get("targetEntityId") {
            None => true,
            Some(Value::Null) => true,
            Some(value) => value.as_str().map(is_uuid_v7).unwrap_or(false),
        }
}

pub fn is_create_entity_input(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    let valid_owner = opt(v, "ownerUserId", is_owner_user_id);

    if let Some(template_id) = v.get("entityTemplateId").and_then(Value::as_str) {
        let has_explicit_attributes = v.get("attributes").is_some();
        let attributes_ok = if has_explicit_attributes {
            matches!(v.get("attributes"), Some(Value::Array(items)) if !items.is_empty())
                && has_valid_entity_attributes(v.get("attributes"), v.get("listingAttributeId"))
        } else {
            match v.get("attributeValues") {
                None => true,
                Some(Value::Array(items)) => {
                    items.iter().all(is_entity_template_attribute_value_input)
                }
                Some(_) => false,
            }
        };
        let links_ok = (v.get("links").is_none() && v.get("linkTargets").is_none())
            || matches!(v.get("links"), Some(Value::Array(items)) if items.iter().all(is_create_entity_link_input))
            || matches!(v.get("linkTargets"), Some(Value::Array(items)) if items.iter().all(is_entity_template_link_target_input));

        return valid_owner && is_uuid_v7(template_id) && attributes_ok && links_ok;
    }

    let template_absent = matches!(v.get("entityTemplateId"), None | Some(Value::Null));
    valid_owner
        && template_absent
        && has_valid_entity_attributes(v.get("attributes"), v.get("listingAttributeId"))
        && links_all(v, is_create_entity_link_input)
}

pub fn is_update_entity_input(v: &Value) -> bool {
    v.is_object()
        && opt(v, "ownerUserId", is_owner_user_id)
        && has_valid_entity_attributes(v.get("attributes"), v.get("listingAttributeId"))
        && links_all(v, is_create_entity_link_input)
}
