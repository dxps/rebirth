use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use axum::routing::{delete, get, patch, post, put};
use axum::Router;
use base64::Engine;
use serde_json::Value;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::db::{
    access_levels, attribute_templates, audit_events, entities, entity_templates, permissions,
    users, DbError,
};
use crate::types::{Entity, User, APP_NAME};
use crate::{dberr, springconfig, validation as v, web};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

pub fn app(pool: PgPool) -> Router {
    let state = AppState { pool };

    Router::new()
        .route("/health", get(health))
        .route("/config/:application/:profile", get(config_two))
        .route("/config/:application/:profile/:label", get(config_three))
        .route("/auth/me", get(auth_me))
        .route("/auth/login", post(auth_login))
        .route("/auth/logout", post(auth_logout))
        .route("/user/password", put(user_password))
        .route("/user/info", put(user_info))
        .route("/permissions", get(list_permissions))
        .route("/audit-events", get(list_audit_events))
        .route("/users", get(list_users).post(create_user))
        .route("/entity-owners", get(entity_owners))
        .route("/access-levels", get(list_access_levels).post(create_access_level))
        .route(
            "/access-levels/:id",
            patch(update_access_level).delete(delete_access_level),
        )
        .route(
            "/attribute-templates",
            get(list_attribute_templates).post(create_attribute_template),
        )
        .route(
            "/attribute-templates/:id",
            patch(update_attribute_template).delete(delete_attribute_template),
        )
        .route(
            "/entity-templates",
            get(list_entity_templates).post(create_entity_template),
        )
        .route(
            "/entity-templates/:id",
            patch(update_entity_template).delete(delete_entity_template),
        )
        .route("/entities", get(list_entities).post(create_entity))
        .route(
            "/entities/:id",
            get(get_entity).put(update_entity).delete(delete_entity),
        )
        .route("/users/:id", patch(update_user).delete(delete_user))
        .fallback(not_found)
        .layer(axum::middleware::from_fn(web::cors_middleware))
        .with_state(state)
}

async fn not_found(uri: axum::http::Uri) -> Response {
    web::json(
        StatusCode::NOT_FOUND,
        &serde_json::json!({ "error": "Not Found", "path": uri.path() }),
    )
}

// ---------- helpers ----------

fn internal(message: &str) -> Response {
    web::error(StatusCode::INTERNAL_SERVER_ERROR, message)
}

fn parse_body(body: &Bytes) -> Option<Value> {
    serde_json::from_slice::<Value>(body).ok()
}

fn bearer_session_key(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let key = value.strip_prefix("Bearer ")?.trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

async fn authenticated_user(state: &AppState, headers: &HeaderMap) -> Option<User> {
    let key = bearer_session_key(headers)?;
    users::get_user_by_session_key(&state.pool, &key)
        .await
        .ok()
        .flatten()
}

async fn require_authenticated(state: &AppState, headers: &HeaderMap) -> Result<User, Response> {
    authenticated_user(state, headers)
        .await
        .ok_or_else(web::authentication_required)
}

async fn require_with<F>(state: &AppState, headers: &HeaderMap, check: F) -> Result<User, Response>
where
    F: Fn(&User) -> bool,
{
    let user = require_authenticated(state, headers).await?;
    if check(&user) {
        Ok(user)
    } else {
        Err(web::authorization_required())
    }
}

fn gs(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn gb(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn gi(value: &Value, key: &str) -> i32 {
    value.get(key).and_then(Value::as_i64).unwrap_or(0) as i32
}

fn opt_str(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn opt_i32(value: &Value, key: &str) -> Option<i32> {
    value.get(key).and_then(Value::as_i64).map(|n| n as i32)
}

fn id_vec(value: &Value, key: &str) -> Vec<i32> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_i64).map(|n| n as i32).collect())
        .unwrap_or_default()
}

fn opt_id_vec(value: &Value, key: &str) -> Option<Vec<i32>> {
    value.get(key).map(|_| id_vec(value, key))
}

fn masked() -> String {
    "******".to_string()
}

fn visible_entity(user: &User, mut entity: Entity) -> Entity {
    if user.can_manage_owned_record(&entity.owner_user_id) {
        return entity;
    }
    let owner = entity.owner_user_id.clone();
    for attribute in entity.attributes.iter_mut() {
        let visible = if attribute.access_level_id == 4 {
            owner == user.id
        } else {
            attribute.access_level_id == 1
                || user.access_levels.iter().any(|al| al.id == attribute.access_level_id)
        };
        if !visible {
            attribute.value = masked();
        }
    }
    entity
}

// ---------- entity input conversion ----------

fn entity_attr_inputs(value: &Value) -> Vec<entities::EntAttrInput> {
    value
        .get("attributes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|a| entities::EntAttrInput {
                    id: gs(a, "id"),
                    name: gs(a, "name"),
                    description: gs(a, "description"),
                    value_type: gs(a, "valueType"),
                    is_required: gb(a, "isRequired"),
                    access_level_id: gi(a, "accessLevelId"),
                    listing_index: opt_i32(a, "listingIndex"),
                    value: gs(a, "value"),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn entity_link_inputs(value: &Value, key: &str) -> Option<Vec<entities::EntLinkInput>> {
    match value.get(key) {
        None => None,
        Some(Value::Array(arr)) => Some(
            arr.iter()
                .map(|l| entities::EntLinkInput {
                    target_entity_id: opt_str(l, "targetEntityId"),
                    name: gs(l, "name"),
                    description: opt_str(l, "description"),
                    listing_index: opt_i32(l, "listingIndex"),
                })
                .collect(),
        ),
        Some(_) => Some(Vec::new()),
    }
}

fn et_attr_inputs(value: &Value) -> Vec<entity_templates::EtAttr> {
    value
        .get("attributes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|a| entity_templates::EtAttr {
                    id: gs(a, "id"),
                    name: gs(a, "name"),
                    description: gs(a, "description"),
                    value_type: gs(a, "valueType"),
                    is_required: gb(a, "isRequired"),
                    access_level_id: gi(a, "accessLevelId"),
                    listing_index: opt_i32(a, "listingIndex"),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn et_link_inputs(value: &Value) -> Vec<entity_templates::EtLink> {
    value
        .get("links")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|l| entity_templates::EtLink {
                    id: opt_str(l, "id"),
                    target_entity_template_id: opt_str(l, "targetEntityTemplateId"),
                    name: gs(l, "name"),
                    description: opt_str(l, "description"),
                    listing_index: opt_i32(l, "listingIndex"),
                })
                .collect()
        })
        .unwrap_or_default()
}

// ---------- handlers ----------

async fn health() -> Response {
    let body = serde_json::json!({
        "appName": APP_NAME,
        "checkedAt": audit_events::to_iso8601(chrono::Utc::now()),
        "status": "ok",
    });
    web::json(StatusCode::OK, &body)
}

async fn auth_me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match require_authenticated(&state, &headers).await {
        Ok(user) => web::data(StatusCode::OK, user),
        Err(response) => response,
    }
}

async fn auth_login(State(state): State<AppState>, body: Bytes) -> Response {
    let Some(input) = parse_body(&body) else {
        return internal("Unable to login");
    };
    if !v::is_login_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid login");
    }
    let identifier = gs(&input, "identifier");
    let password = gs(&input, "password");
    match users::authenticate_user(&state.pool, &identifier, &password).await {
        Ok(Some(user)) => {
            let session_key = match users::create_user_session(&state.pool, parse_uuid(&user.id)).await {
                Ok(key) => key,
                Err(_) => return internal("Unable to login"),
            };
            web::data(StatusCode::OK, LoginData { session_key, user })
        }
        Ok(None) => web::error(StatusCode::UNAUTHORIZED, "Invalid username or password"),
        Err(_) => internal("Unable to login"),
    }
}

async fn auth_logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(session_key) = bearer_session_key(&headers) else {
        return web::authentication_required();
    };
    match users::revoke_user_session(&state.pool, &session_key).await {
        Ok(_) => web::no_content(),
        Err(_) => internal("Unable to logout"),
    }
}

async fn user_password(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update password");
    };
    if v::is_update_password_input_with_short_new_password(&input) {
        return web::error(
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters long",
        );
    }
    if !v::is_update_password_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid password update");
    }
    let current = gs(&input, "currentPassword");
    let new_password = gs(&input, "newPassword");
    match users::update_user_password(&state.pool, parse_uuid(&user.id), &current, &new_password).await {
        Ok(users::PasswordUpdate::InvalidCurrent) => {
            web::error(StatusCode::UNAUTHORIZED, "Current password is incorrect")
        }
        Ok(users::PasswordUpdate::NotFound) => web::error(StatusCode::NOT_FOUND, "User not found"),
        Ok(users::PasswordUpdate::Updated(updated)) => web::data(StatusCode::OK, updated),
        Err(_) => internal("Unable to update password"),
    }
}

async fn user_info(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update email");
    };
    if !v::is_update_user_info_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid email update");
    }
    let result = users::update_user_email(
        &state.pool,
        parse_uuid(&user.id),
        gs(&input, "email"),
        gs(&input, "firstName"),
        gs(&input, "lastName"),
        gs(&input, "username"),
    )
    .await;
    match result {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "User not found"),
        Err(DbError::User(message)) => web::error(StatusCode::FORBIDDEN, &message),
        Err(DbError::Entity(message)) => web::error(StatusCode::BAD_REQUEST, &message),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => {
            if dberr::has_constraint(&e, "users_username_unique") {
                web::username_unique_conflict()
            } else {
                web::unique_conflict()
            }
        }
        Err(_) => internal("Unable to update email"),
    }
}

async fn list_permissions(State(state): State<AppState>) -> Response {
    match permissions::list_permissions(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load permissions"),
    }
}

async fn list_audit_events(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_view_audit).await {
        return response;
    }
    match audit_events::list_audit_events(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load audit events"),
    }
}

async fn list_users(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    match users::list_users(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load users"),
    }
}

async fn entity_owners(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_data).await {
        return response;
    }
    match users::list_users(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load entity owners"),
    }
}

async fn create_user(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let existing_count = match users::count_users(&state.pool).await {
        Ok(count) => count,
        Err(_) => return internal("Unable to create user"),
    };
    if existing_count > 0 {
        if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
            return response;
        }
    }
    let Some(input) = parse_body(&body) else {
        return internal("Unable to create user");
    };
    if !v::is_create_user_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid user");
    }
    let create = users::CreateUser {
        email: gs(&input, "email").trim().to_lowercase(),
        first_name: gs(&input, "firstName").trim().to_string(),
        last_name: gs(&input, "lastName").trim().to_string(),
        username: gs(&input, "username").trim().to_string(),
        password: gs(&input, "password"),
        access_level_ids: id_vec(&input, "accessLevelIds"),
        permission_ids: id_vec(&input, "permissionIds"),
    };
    match users::create_user(&state.pool, create).await {
        Ok(Some(user)) => web::data(StatusCode::CREATED, user),
        Ok(None) => internal("Unable to create user"),
        Err(DbError::User(message)) => web::error(StatusCode::FORBIDDEN, &message),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to create user"),
    }
}

async fn list_access_levels(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_view_data).await {
        return response;
    }
    match access_levels::list_access_levels(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load access levels"),
    }
}

async fn create_access_level(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    let Some(input) = parse_body(&body) else {
        return internal("Unable to create access level");
    };
    if !v::is_create_access_level_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid access level");
    }
    match access_levels::create_access_level(
        &state.pool,
        gs(&input, "name").trim(),
        gs(&input, "description").trim(),
    )
    .await
    {
        Ok(created) => web::data(StatusCode::CREATED, created),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to create access level"),
    }
}

async fn update_access_level(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update access level");
    };
    let Ok(id) = id.parse::<i32>() else {
        return web::error(StatusCode::BAD_REQUEST, "Invalid access level update");
    };
    if id <= 0 || !v::is_update_access_level_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid access level update");
    }

    if id <= 4 {
        if let Some(name) = input.get("name").and_then(Value::as_str) {
            let existing = match access_levels::list_access_levels(&state.pool).await {
                Ok(list) => list.into_iter().find(|al| al.id == id),
                Err(_) => return internal("Unable to update access level"),
            };
            let Some(existing) = existing else {
                return web::error(StatusCode::NOT_FOUND, "Access level not found");
            };
            if name.trim() != existing.name {
                return web::error(StatusCode::FORBIDDEN, "Built-in access levels cannot be renamed");
            }
        }
    }

    let name = input.get("name").and_then(Value::as_str).map(|s| s.trim().to_string());
    let description = input.get("description").and_then(Value::as_str).map(|s| s.trim().to_string());
    match access_levels::update_access_level(&state.pool, id, name, description).await {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Access level not found"),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to update access level"),
    }
}

async fn delete_access_level(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    let Ok(id) = id.parse::<i32>() else {
        return web::error(StatusCode::BAD_REQUEST, "Invalid access level id");
    };
    if id <= 0 {
        return web::error(StatusCode::BAD_REQUEST, "Invalid access level id");
    }
    if id <= 4 {
        return web::error(StatusCode::FORBIDDEN, "Built-in access levels cannot be deleted");
    }
    match access_levels::delete_access_level(&state.pool, id).await {
        Ok(Some(deleted)) => web::data(StatusCode::OK, deleted),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Access level not found"),
        Err(_) => internal("Unable to delete access level"),
    }
}

async fn list_attribute_templates(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_view_data).await {
        return response;
    }
    match attribute_templates::list_attribute_templates(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load attribute templates"),
    }
}

async fn create_attribute_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let user = match require_with(&state, &headers, User::can_create_managed_data).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to create attribute template");
    };
    if !v::is_create_attribute_template_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid attribute template");
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to create attribute template"),
        }
    }
    let owner_user_id = if user.can_manage_data() {
        owner_input.as_deref().map(parse_uuid).unwrap_or_else(|| parse_uuid(&user.id))
    } else {
        parse_uuid(&user.id)
    };
    let create = attribute_templates::CreateAttributeTemplate {
        access_level_id: gi(&input, "accessLevelId"),
        default_value: opt_str(&input, "defaultValue"),
        description: gs(&input, "description").trim().to_string(),
        is_required: gb(&input, "isRequired"),
        name: gs(&input, "name").trim().to_string(),
        value_type: gs(&input, "valueType"),
    };
    match attribute_templates::create_attribute_template(&state.pool, owner_user_id, create).await {
        Ok(Some(created)) => web::data(StatusCode::CREATED, created),
        Ok(None) => internal("Unable to create attribute template"),
        Err(DbError::Sqlx(e)) if dberr::has_constraint(&e, "attribute_templates_name_description_unique") => {
            web::attribute_template_unique_conflict()
        }
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to create attribute template"),
    }
}

async fn update_attribute_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update attribute template");
    };
    if !v::is_uuid_v7(&id) || !v::is_update_attribute_template_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid attribute template update");
    }
    let existing = match attribute_templates::list_attribute_templates(&state.pool).await {
        Ok(list) => list.into_iter().find(|t| t.id == id),
        Err(_) => return internal("Unable to update attribute template"),
    };
    let Some(existing) = existing else {
        return web::error(StatusCode::NOT_FOUND, "Attribute template not found");
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to update attribute template"),
        }
    }
    let update = attribute_templates::UpdateAttributeTemplate {
        name: opt_str(&input, "name"),
        description: opt_str(&input, "description"),
        value_type: opt_str(&input, "valueType"),
        default_value_provided: input.get("defaultValue").is_some(),
        default_value: input.get("defaultValue").and_then(Value::as_str).map(str::to_string),
        is_required: input.get("isRequired").and_then(Value::as_bool),
        access_level_id: opt_i32(&input, "accessLevelId"),
        owner_user_id: if user.can_manage_data() {
            owner_input.as_deref().map(parse_uuid)
        } else {
            None
        },
    };
    match attribute_templates::update_attribute_template(&state.pool, parse_uuid(&id), update).await {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Attribute template not found"),
        Err(DbError::Sqlx(e)) if dberr::has_constraint(&e, "attribute_templates_name_description_unique") => {
            web::attribute_template_unique_conflict()
        }
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to update attribute template"),
    }
}

async fn delete_attribute_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if !v::is_uuid_v7(&id) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid attribute template id");
    }
    let existing = match attribute_templates::list_attribute_templates(&state.pool).await {
        Ok(list) => list.into_iter().find(|t| t.id == id),
        Err(_) => return internal("Unable to delete attribute template"),
    };
    let Some(existing) = existing else {
        return web::error(StatusCode::NOT_FOUND, "Attribute template not found");
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    match attribute_templates::delete_attribute_template(&state.pool, parse_uuid(&id)).await {
        Ok(Some(deleted)) => web::data(StatusCode::OK, deleted),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Attribute template not found"),
        Err(_) => internal("Unable to delete attribute template"),
    }
}

async fn list_entity_templates(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_view_data).await {
        return response;
    }
    match entity_templates::list_entity_templates(&state.pool).await {
        Ok(data) => web::data(StatusCode::OK, data),
        Err(_) => internal("Unable to load entity templates"),
    }
}

async fn create_entity_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let user = match require_with(&state, &headers, User::can_create_managed_data).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to create entity template");
    };
    if !v::is_create_entity_template_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity template");
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to create entity template"),
        }
    }
    let owner_user_id = if user.can_manage_data() {
        owner_input.as_deref().map(parse_uuid).unwrap_or_else(|| parse_uuid(&user.id))
    } else {
        parse_uuid(&user.id)
    };
    let create = entity_templates::CreateEntityTemplate {
        name: gs(&input, "name").trim().to_string(),
        description: gs(&input, "description").trim().to_string(),
        listing_attribute_id: gs(&input, "listingAttributeId"),
        attributes: et_attr_inputs(&input),
        links: et_link_inputs(&input),
    };
    match entity_templates::create_entity_template(&state.pool, owner_user_id, create).await {
        Ok(Some(created)) => web::data(StatusCode::CREATED, created),
        Ok(None) => internal("Unable to create entity template"),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to create entity template"),
    }
}

async fn update_entity_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update entity template");
    };
    if !v::is_uuid_v7(&id) || !v::is_update_entity_template_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity template update");
    }
    let existing = match entity_templates::list_entity_templates(&state.pool).await {
        Ok(list) => list.into_iter().find(|t| t.id == id),
        Err(_) => return internal("Unable to update entity template"),
    };
    let Some(existing) = existing else {
        return web::error(StatusCode::NOT_FOUND, "Entity template not found");
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to update entity template"),
        }
    }
    let update = entity_templates::UpdateEntityTemplate {
        name: opt_str(&input, "name"),
        description: opt_str(&input, "description"),
        owner_user_id: if user.can_manage_data() {
            owner_input.as_deref().map(parse_uuid)
        } else {
            None
        },
        listing_attribute_id: opt_str(&input, "listingAttributeId"),
        attributes: input.get("attributes").map(|_| et_attr_inputs(&input)),
        links: input.get("links").map(|_| et_link_inputs(&input)),
    };
    match entity_templates::update_entity_template(&state.pool, parse_uuid(&id), update).await {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity template not found"),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to update entity template"),
    }
}

async fn delete_entity_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if !v::is_uuid_v7(&id) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity template id");
    }
    let existing = match entity_templates::list_entity_templates(&state.pool).await {
        Ok(list) => list.into_iter().find(|t| t.id == id),
        Err(_) => return internal("Unable to delete entity template"),
    };
    let Some(existing) = existing else {
        return web::error(StatusCode::NOT_FOUND, "Entity template not found");
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    match entity_templates::delete_entity_template(&state.pool, parse_uuid(&id)).await {
        Ok(Some(deleted)) => web::data(StatusCode::OK, deleted),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity template not found"),
        Err(_) => internal("Unable to delete entity template"),
    }
}

async fn list_entities(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let user = match require_with(&state, &headers, User::can_view_data).await {
        Ok(user) => user,
        Err(response) => return response,
    };

    let search = params.get("search").cloned();
    let page = parse_positive(params.get("page"), 1);
    let requested_page_size = parse_positive(params.get("pageSize"), 10);
    let page_size = requested_page_size.min(50);

    let manage = user.can_manage_data();
    let list_search = if manage { search.as_deref() } else { None };
    let all = match entities::list_entities_with_counts(&state.pool, list_search).await {
        Ok(list) => list,
        Err(_) => return internal("Unable to load entities"),
    };

    let visible: Vec<Entity> = if manage {
        all
    } else {
        all.into_iter().filter(|e| e.owner_user_id == user.id).collect()
    };

    let normalized = search.as_deref().map(|s| s.trim().to_lowercase());
    let filtered: Vec<Entity> = if !manage
        && normalized.as_deref().map(|s| s.len() >= 3).unwrap_or(false)
    {
        let term = normalized.unwrap();
        visible
            .into_iter()
            .filter(|entity| {
                entity.attributes.iter().any(|attribute| {
                    attribute.name.to_lowercase().contains(&term)
                        || attribute.value.to_lowercase().contains(&term)
                })
            })
            .collect()
    } else {
        visible
    };

    let total = filtered.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    let end = (start + page_size as usize).min(filtered.len());
    let page_slice = if start < filtered.len() {
        filtered[start..end].to_vec()
    } else {
        Vec::new()
    };
    let data: Vec<Entity> = page_slice.into_iter().map(|e| visible_entity(&user, e)).collect();

    web::json(
        StatusCode::OK,
        &EntitiesResponse {
            data,
            pagination: Pagination {
                page,
                page_size,
                total,
            },
        },
    )
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginData {
    session_key: String,
    user: User,
}

#[derive(serde::Serialize)]
struct EntitiesResponse {
    data: Vec<Entity>,
    pagination: Pagination,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Pagination {
    page: i64,
    page_size: i64,
    total: i64,
}

fn parse_positive(value: Option<&String>, default: i64) -> i64 {
    let parsed = value
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|n| *n != 0)
        .unwrap_or(default);
    parsed.max(1)
}

async fn create_entity(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let user = match require_with(&state, &headers, User::can_create_managed_data).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to create entity");
    };
    if !v::is_create_entity_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity");
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to create entity"),
        }
    }
    let owner_user_id = if user.can_manage_data() {
        owner_input.as_deref().map(parse_uuid).unwrap_or_else(|| parse_uuid(&user.id))
    } else {
        parse_uuid(&user.id)
    };

    let create = if let Some(template_id) = input.get("entityTemplateId").and_then(Value::as_str) {
        entities::CreateEntity::FromTemplate {
            entity_template_id: template_id.to_string(),
            attributes: input.get("attributes").map(|_| entity_attr_inputs(&input)),
            listing_attribute_id: opt_str(&input, "listingAttributeId"),
            links: entity_link_inputs(&input, "links"),
        }
    } else {
        entities::CreateEntity::FromScratch {
            attributes: entity_attr_inputs(&input),
            listing_attribute_id: gs(&input, "listingAttributeId"),
            links: entity_link_inputs(&input, "links").unwrap_or_default(),
        }
    };

    match entities::create_entity(&state.pool, owner_user_id, create).await {
        Ok(Some(created)) => web::data(StatusCode::CREATED, created),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity template not found"),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to create entity"),
    }
}

async fn get_entity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match require_with(&state, &headers, User::can_view_data).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if !v::is_uuid_v7(&id) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity id");
    }
    match entities::get_entity(&state.pool, parse_uuid(&id)).await {
        Ok(Some(entity)) => {
            if !user.can_manage_data() && entity.owner_user_id != user.id {
                return web::error(StatusCode::NOT_FOUND, "Entity not found");
            }
            web::data(StatusCode::OK, visible_entity(&user, entity))
        }
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity not found"),
        Err(_) => internal("Unable to load entity"),
    }
}

async fn update_entity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update entity");
    };
    if !v::is_uuid_v7(&id) || !v::is_update_entity_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity update");
    }
    let existing = match entities::get_entity(&state.pool, parse_uuid(&id)).await {
        Ok(Some(entity)) => entity,
        Ok(None) => return web::error(StatusCode::NOT_FOUND, "Entity not found"),
        Err(_) => return internal("Unable to update entity"),
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    let owner_input = opt_str(&input, "ownerUserId");
    if owner_input.is_some() && !user.can_manage_data() {
        return web::authorization_required();
    }
    if let Some(owner) = &owner_input {
        match users::get_user(&state.pool, parse_uuid(owner)).await {
            Ok(Some(_)) => {}
            Ok(None) => return web::error(StatusCode::NOT_FOUND, "Owner user not found"),
            Err(_) => return internal("Unable to update entity"),
        }
    }

    let attributes = entity_attr_inputs(&input);
    if !user.can_manage_data() && has_owner_view_changes(&existing, &input) {
        return web::error(
            StatusCode::FORBIDDEN,
            "Owner View attributes can only be viewed by the owner",
        );
    }

    let update = entities::UpdateEntity {
        attributes,
        listing_attribute_id: gs(&input, "listingAttributeId"),
        links: entity_link_inputs(&input, "links").unwrap_or_default(),
        owner_user_id: if user.can_manage_data() {
            owner_input.as_deref().map(parse_uuid)
        } else {
            None
        },
    };

    match entities::update_entity(&state.pool, parse_uuid(&id), update).await {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity not found"),
        Err(_) => internal("Unable to update entity"),
    }
}

fn has_owner_view_changes(existing: &Entity, input: &Value) -> bool {
    let input_attributes = input.get("attributes").and_then(Value::as_array);
    let Some(input_attributes) = input_attributes else {
        return existing.attributes.iter().any(|a| a.access_level_id == 4);
    };
    let by_id: HashMap<&str, &Value> = input_attributes
        .iter()
        .filter_map(|a| a.get("id").and_then(Value::as_str).map(|id| (id, a)))
        .collect();

    existing.attributes.iter().any(|attribute| {
        if attribute.access_level_id != 4 {
            return false;
        }
        match by_id.get(attribute.id.as_str()) {
            None => true,
            Some(input_attribute) => !attributes_equivalent(attribute, input_attribute),
        }
    })
}

fn attributes_equivalent(left: &crate::types::EntityAttribute, right: &Value) -> bool {
    left.id == gs(right, "id")
        && left.access_level_id == gi(right, "accessLevelId")
        && left.description == gs(right, "description").trim()
        && left.is_required == gb(right, "isRequired")
        && left.listing_index == opt_i32(right, "listingIndex").unwrap_or(left.listing_index)
        && left.name == gs(right, "name").trim()
        && left.value == gs(right, "value")
        && left.value_type == gs(right, "valueType")
}

async fn delete_entity(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let user = match require_authenticated(&state, &headers).await {
        Ok(user) => user,
        Err(response) => return response,
    };
    if !v::is_uuid_v7(&id) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid entity id");
    }
    let existing = match entities::get_entity(&state.pool, parse_uuid(&id)).await {
        Ok(Some(entity)) => entity,
        Ok(None) => return web::error(StatusCode::NOT_FOUND, "Entity not found"),
        Err(_) => return internal("Unable to delete entity"),
    };
    if !user.can_manage_owned_record(&existing.owner_user_id) {
        return web::authorization_required();
    }
    match entities::delete_entity(&state.pool, parse_uuid(&id)).await {
        Ok(Some(deleted)) => web::data(StatusCode::OK, deleted),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "Entity not found"),
        Err(DbError::Entity(message)) => web::error(StatusCode::CONFLICT, &message),
        Err(_) => internal("Unable to delete entity"),
    }
}

async fn update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    let Some(input) = parse_body(&body) else {
        return internal("Unable to update user");
    };
    if !v::is_uuid_v7(&id) || !v::is_update_user_input(&input) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid user update");
    }
    let existing = match users::get_user(&state.pool, parse_uuid(&id)).await {
        Ok(Some(user)) => user,
        Ok(None) => return web::error(StatusCode::NOT_FOUND, "User not found"),
        Err(_) => return internal("Unable to update user"),
    };
    if existing.username == "admin" {
        if let Some(username) = input.get("username").and_then(Value::as_str) {
            if username.trim() != "admin" {
                return web::error(
                    StatusCode::FORBIDDEN,
                    "The built-in admin username cannot be renamed",
                );
            }
        }
        return web::error(StatusCode::FORBIDDEN, "The built-in admin user cannot be managed");
    }
    let update = users::UpdateUser {
        email: input.get("email").and_then(Value::as_str).map(|s| s.trim().to_string()),
        first_name: input.get("firstName").and_then(Value::as_str).map(|s| s.trim().to_string()),
        last_name: input.get("lastName").and_then(Value::as_str).map(|s| s.trim().to_string()),
        username: input.get("username").and_then(Value::as_str).map(|s| s.trim().to_string()),
        password: opt_str(&input, "password"),
        access_level_ids: opt_id_vec(&input, "accessLevelIds"),
        permission_ids: opt_id_vec(&input, "permissionIds"),
    };
    match users::update_user(&state.pool, parse_uuid(&id), update).await {
        Ok(Some(updated)) => web::data(StatusCode::OK, updated),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "User not found"),
        Err(DbError::Sqlx(e)) if dberr::is_unique_violation(&e) => web::unique_conflict(),
        Err(_) => internal("Unable to update user"),
    }
}

async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if let Err(response) = require_with(&state, &headers, User::can_manage_security).await {
        return response;
    }
    if !v::is_uuid_v7(&id) {
        return web::error(StatusCode::BAD_REQUEST, "Invalid user id");
    }
    let existing = match users::get_user(&state.pool, parse_uuid(&id)).await {
        Ok(Some(user)) => user,
        Ok(None) => return web::error(StatusCode::NOT_FOUND, "User not found"),
        Err(_) => return internal("Unable to delete user"),
    };
    if existing.username == "admin" {
        return web::error(StatusCode::FORBIDDEN, "The built-in admin user cannot be managed");
    }
    match users::delete_user(&state.pool, parse_uuid(&id)).await {
        Ok(Some(deleted)) => web::data(StatusCode::OK, deleted),
        Ok(None) => web::error(StatusCode::NOT_FOUND, "User not found"),
        Err(_) => internal("Unable to delete user"),
    }
}

// ---------- spring config ----------

async fn config_two(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((application, profile)): Path<(String, String)>,
) -> Response {
    config_response(&state, &headers, application, profile, None).await
}

async fn config_three(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((application, profile, label)): Path<(String, String, String)>,
) -> Response {
    config_response(&state, &headers, application, profile, Some(label)).await
}

async fn spring_config_user(state: &AppState, headers: &HeaderMap) -> Option<User> {
    if let Some(user) = authenticated_user(state, headers).await {
        return Some(user);
    }
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let encoded = value.strip_prefix("Basic ").or_else(|| value.strip_prefix("basic "))?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .ok()?;
    let decoded = String::from_utf8(decoded).ok()?;
    let separator = decoded.find(':')?;
    let identifier = &decoded[..separator];
    let password = &decoded[separator + 1..];
    if identifier.is_empty() || password.is_empty() {
        return None;
    }
    users::authenticate_user(&state.pool, identifier, password)
        .await
        .ok()
        .flatten()
}

async fn config_response(
    state: &AppState,
    headers: &HeaderMap,
    application: String,
    profile_segment: String,
    requested_label: Option<String>,
) -> Response {
    let user = match spring_config_user(state, headers).await {
        Some(user) => user,
        None => return web::authentication_required(),
    };

    let application = application.trim().to_string();
    let label = requested_label
        .clone()
        .unwrap_or_else(|| "main".to_string());
    let label = {
        let trimmed = label.trim();
        if trimmed.is_empty() { "main".to_string() } else { trimmed.to_string() }
    };
    let profiles: Vec<String> = profile_segment
        .split(',')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();

    if application.is_empty() || profiles.is_empty() {
        return web::error(StatusCode::BAD_REQUEST, "Invalid config request");
    }

    let all = match entities::list_all_entities(&state.pool).await {
        Ok(list) => list,
        Err(_) => return internal("Unable to load configuration"),
    };
    let readable: Vec<Entity> = all
        .into_iter()
        .filter(|entity| springconfig::can_read(&user, entity))
        .collect();

    let environment = springconfig::build_environment(
        &readable,
        &application,
        &profiles,
        &label,
        requested_label.is_some(),
    );
    web::json(StatusCode::OK, &environment)
}

fn parse_uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).unwrap_or_else(|_| crate::crypto::new_uuid())
}
