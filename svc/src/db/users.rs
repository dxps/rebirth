use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use super::{DbError, DbResult};
use crate::crypto::{create_session_key, hash_password, new_uuid, verify_password};
use crate::db::audit_events::insert_audit_event;
use crate::types::{AccessLevel, Permission, User};

pub struct CreateUser {
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub username: String,
    pub password: String,
    pub access_level_ids: Vec<i32>,
    pub permission_ids: Vec<i32>,
}

#[derive(Default)]
pub struct UpdateUser {
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub access_level_ids: Option<Vec<i32>>,
    pub permission_ids: Option<Vec<i32>>,
}

pub enum PasswordUpdate {
    NotFound,
    InvalidCurrent,
    Updated(User),
}

fn sorted(ids: &[i32]) -> Vec<i32> {
    let mut copy = ids.to_vec();
    copy.sort_unstable();
    copy
}

fn same_ids(left: &[i32], right: &[i32]) -> bool {
    sorted(left) == sorted(right)
}

async fn read_users(pool: &PgPool, id: Option<Uuid>) -> DbResult<Vec<User>> {
    let user_rows = match id {
        Some(id) => sqlx::query_as::<_, (Uuid, String, String, String, String)>(
            "SELECT id, email, first_name, last_name, username \
             FROM users WHERE id = $1 ORDER BY username",
        )
        .bind(id)
        .fetch_all(pool)
        .await?,
        None => sqlx::query_as::<_, (Uuid, String, String, String, String)>(
            "SELECT id, email, first_name, last_name, username FROM users ORDER BY username",
        )
        .fetch_all(pool)
        .await?,
    };

    if user_rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<Uuid> = user_rows.iter().map(|row| row.0).collect();

    let permission_rows = sqlx::query_as::<_, (Uuid, i32, String, String)>(
        "SELECT user_permissions.user_id, permissions.id, permissions.name::text, \
                permissions.description \
         FROM user_permissions \
         INNER JOIN permissions ON permissions.id = user_permissions.permission_id \
         WHERE user_permissions.user_id = ANY($1) \
         ORDER BY permissions.id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let access_level_rows = sqlx::query_as::<_, (Uuid, i32, String, String)>(
        "SELECT user_access_levels.user_id, access_levels.id, access_levels.name, \
                access_levels.description \
         FROM user_access_levels \
         INNER JOIN access_levels ON access_levels.id = user_access_levels.access_level_id \
         WHERE user_access_levels.user_id = ANY($1) \
         ORDER BY access_levels.id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let users = user_rows
        .into_iter()
        .map(|(uid, email, first_name, last_name, username)| User {
            access_levels: access_level_rows
                .iter()
                .filter(|row| row.0 == uid)
                .map(|row| AccessLevel {
                    id: row.1,
                    name: row.2.clone(),
                    description: row.3.clone(),
                })
                .collect(),
            email,
            first_name,
            id: uid.to_string(),
            last_name,
            permissions: permission_rows
                .iter()
                .filter(|row| row.0 == uid)
                .map(|row| Permission {
                    id: row.1,
                    name: row.2.clone(),
                    description: row.3.clone(),
                })
                .collect(),
            username,
        })
        .collect();

    Ok(users)
}

async fn replace_user_permissions(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    permission_ids: &[i32],
) -> DbResult<()> {
    sqlx::query("DELETE FROM user_permissions WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    for permission_id in permission_ids {
        sqlx::query("INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2)")
            .bind(user_id)
            .bind(permission_id)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

async fn replace_user_access_levels(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    access_level_ids: &[i32],
) -> DbResult<()> {
    sqlx::query("DELETE FROM user_access_levels WHERE user_id = $1")
        .bind(user_id)
        .execute(&mut **tx)
        .await?;
    for access_level_id in access_level_ids {
        sqlx::query("INSERT INTO user_access_levels (user_id, access_level_id) VALUES ($1, $2)")
            .bind(user_id)
            .bind(access_level_id)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

pub async fn count_users(pool: &PgPool) -> DbResult<i64> {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    Ok(count)
}

pub async fn list_users(pool: &PgPool) -> DbResult<Vec<User>> {
    read_users(pool, None).await
}

pub async fn get_user(pool: &PgPool, id: Uuid) -> DbResult<Option<User>> {
    Ok(read_users(pool, Some(id)).await?.into_iter().next())
}

fn created_user_audit_content(id: Uuid, input: &CreateUser) -> String {
    json!({
        "user": {
            "accessLevelIds": sorted(&input.access_level_ids),
            "email": input.email,
            "firstName": input.first_name,
            "id": id.to_string(),
            "lastName": input.last_name,
            "permissionIds": sorted(&input.permission_ids),
            "username": input.username,
        }
    })
    .to_string()
}

fn user_audit_content(user: &User) -> String {
    let access_level_ids: Vec<i32> =
        user.access_levels.iter().map(|al| al.id).collect();
    let permission_ids: Vec<i32> = user.permissions.iter().map(|p| p.id).collect();
    json!({
        "user": {
            "accessLevelIds": sorted(&access_level_ids),
            "email": user.email,
            "firstName": user.first_name,
            "id": user.id,
            "lastName": user.last_name,
            "permissionIds": sorted(&permission_ids),
            "username": user.username,
        }
    })
    .to_string()
}

pub async fn create_user(pool: &PgPool, input: CreateUser) -> DbResult<Option<User>> {
    let id = new_uuid();
    let password_hash = hash_password(&input.password);

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO users (id, email, first_name, last_name, username, password_hash) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(&input.email)
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.username)
    .bind(&password_hash)
    .execute(&mut *tx)
    .await?;
    replace_user_access_levels(&mut tx, id, &input.access_level_ids).await?;
    replace_user_permissions(&mut tx, id, &input.permission_ids).await?;
    insert_audit_event(&mut *tx, "user.created", &created_user_audit_content(id, &input)).await?;
    tx.commit().await?;

    get_user(pool, id).await
}

fn build_update_changes(existing: &User, input: &UpdateUser) -> Value {
    let mut changes = serde_json::Map::new();

    if let Some(email) = &input.email {
        if *email != existing.email {
            changes.insert("email".into(), json!({ "from": existing.email, "to": email }));
        }
    }
    if let Some(first_name) = &input.first_name {
        if *first_name != existing.first_name {
            changes.insert(
                "firstName".into(),
                json!({ "from": existing.first_name, "to": first_name }),
            );
        }
    }
    if let Some(last_name) = &input.last_name {
        if *last_name != existing.last_name {
            changes.insert(
                "lastName".into(),
                json!({ "from": existing.last_name, "to": last_name }),
            );
        }
    }
    if let Some(username) = &input.username {
        if *username != existing.username {
            changes.insert(
                "username".into(),
                json!({ "from": existing.username, "to": username }),
            );
        }
    }
    if input.password.is_some() {
        changes.insert("password".into(), json!({ "changed": true }));
    }
    if let Some(permission_ids) = &input.permission_ids {
        let existing_ids: Vec<i32> = existing.permissions.iter().map(|p| p.id).collect();
        if !same_ids(permission_ids, &existing_ids) {
            changes.insert(
                "permissionIds".into(),
                json!({ "from": sorted(&existing_ids), "to": sorted(permission_ids) }),
            );
        }
    }
    if let Some(access_level_ids) = &input.access_level_ids {
        let existing_ids: Vec<i32> = existing.access_levels.iter().map(|al| al.id).collect();
        if !same_ids(access_level_ids, &existing_ids) {
            changes.insert(
                "accessLevelIds".into(),
                json!({ "from": sorted(&existing_ids), "to": sorted(access_level_ids) }),
            );
        }
    }

    Value::Object(changes)
}

pub async fn update_user(pool: &PgPool, id: Uuid, input: UpdateUser) -> DbResult<Option<User>> {
    let Some(existing) = get_user(pool, id).await? else {
        return Ok(None);
    };

    if existing.username == "admin" {
        if let Some(username) = &input.username {
            if username != &existing.username {
                return Err(DbError::User(
                    "The built-in admin username cannot be renamed".into(),
                ));
            }
        }
    }

    let changes = build_update_changes(&existing, &input);
    let password_hash = input.password.as_ref().map(|p| hash_password(p));

    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE users SET \
            email = COALESCE($2, email), \
            first_name = COALESCE($3, first_name), \
            last_name = COALESCE($4, last_name), \
            username = COALESCE($5, username), \
            password_hash = COALESCE($6, password_hash) \
         WHERE id = $1",
    )
    .bind(id)
    .bind(input.email.as_deref())
    .bind(input.first_name.as_deref())
    .bind(input.last_name.as_deref())
    .bind(input.username.as_deref())
    .bind(password_hash.as_deref())
    .execute(&mut *tx)
    .await?;

    if let Some(permission_ids) = &input.permission_ids {
        replace_user_permissions(&mut tx, id, permission_ids).await?;
    }
    if let Some(access_level_ids) = &input.access_level_ids {
        replace_user_access_levels(&mut tx, id, access_level_ids).await?;
    }

    if let Value::Object(map) = &changes {
        if !map.is_empty() {
            let content = json!({ "changes": changes, "userId": id.to_string() }).to_string();
            insert_audit_event(&mut *tx, "user.updated", &content).await?;
        }
    }
    tx.commit().await?;

    get_user(pool, id).await
}

pub async fn update_user_email(
    pool: &PgPool,
    id: Uuid,
    email: String,
    first_name: String,
    last_name: String,
    username: String,
) -> DbResult<Option<User>> {
    let Some(existing) = get_user(pool, id).await? else {
        return Ok(None);
    };

    if existing.username == "admin" && username != existing.username {
        return Err(DbError::User(
            "The built-in admin username cannot be renamed".into(),
        ));
    }

    let input = UpdateUser {
        email: Some(email.clone()),
        first_name: Some(first_name.clone()),
        last_name: Some(last_name.clone()),
        username: Some(username.clone()),
        ..Default::default()
    };
    let changes = build_update_changes(&existing, &input);

    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE users SET email = $2, first_name = $3, last_name = $4, username = $5 WHERE id = $1",
    )
    .bind(id)
    .bind(&email)
    .bind(&first_name)
    .bind(&last_name)
    .bind(&username)
    .execute(&mut *tx)
    .await?;

    if let Value::Object(map) = &changes {
        if !map.is_empty() {
            let content = json!({ "changes": changes, "userId": id.to_string() }).to_string();
            insert_audit_event(&mut *tx, "user.updated", &content).await?;
        }
    }
    tx.commit().await?;

    get_user(pool, id).await
}

pub async fn update_user_password(
    pool: &PgPool,
    id: Uuid,
    current_password: &str,
    new_password: &str,
) -> DbResult<PasswordUpdate> {
    let row = sqlx::query_scalar::<_, String>("SELECT password_hash FROM users WHERE id = $1 LIMIT 1")
        .bind(id)
        .fetch_optional(pool)
        .await?;

    let Some(password_hash) = row else {
        return Ok(PasswordUpdate::NotFound);
    };

    if !verify_password(current_password, &password_hash) {
        return Ok(PasswordUpdate::InvalidCurrent);
    }

    let new_hash = hash_password(new_password);
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
        .bind(id)
        .bind(&new_hash)
        .execute(&mut *tx)
        .await?;
    let content = json!({ "changes": { "password": { "changed": true } }, "userId": id.to_string() })
        .to_string();
    insert_audit_event(&mut *tx, "user.updated", &content).await?;
    tx.commit().await?;

    match get_user(pool, id).await? {
        Some(user) => Ok(PasswordUpdate::Updated(user)),
        None => Ok(PasswordUpdate::NotFound),
    }
}

pub async fn delete_user(pool: &PgPool, id: Uuid) -> DbResult<Option<User>> {
    let Some(user) = get_user(pool, id).await? else {
        return Ok(None);
    };

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    insert_audit_event(&mut *tx, "user.deleted", &user_audit_content(&user)).await?;
    tx.commit().await?;

    Ok(Some(user))
}

pub async fn authenticate_user(
    pool: &PgPool,
    identifier: &str,
    password: &str,
) -> DbResult<Option<User>> {
    let normalized = identifier.trim().to_lowercase();
    let row = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, password_hash FROM users \
         WHERE email = $1 OR lower(username) = $1 LIMIT 1",
    )
    .bind(&normalized)
    .fetch_optional(pool)
    .await?;

    let Some((id, password_hash)) = row else {
        return Ok(None);
    };

    if !verify_password(password, &password_hash) {
        return Ok(None);
    }

    get_user(pool, id).await
}

pub async fn create_user_session(pool: &PgPool, user_id: Uuid) -> DbResult<String> {
    let id = new_uuid();
    let session_key = create_session_key();
    sqlx::query("INSERT INTO user_sessions (id, user_id, session_key) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(user_id)
        .bind(&session_key)
        .execute(pool)
        .await?;
    Ok(session_key)
}

pub async fn get_user_by_session_key(pool: &PgPool, session_key: &str) -> DbResult<Option<User>> {
    let row = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM user_sessions \
         WHERE session_key = $1 AND revoked_at IS NULL LIMIT 1",
    )
    .bind(session_key)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(user_id) => get_user(pool, user_id).await,
        None => Ok(None),
    }
}

pub async fn revoke_user_session(pool: &PgPool, session_key: &str) -> DbResult<bool> {
    let rows = sqlx::query_scalar::<_, Uuid>(
        "UPDATE user_sessions SET revoked_at = now() \
         WHERE session_key = $1 AND revoked_at IS NULL RETURNING id",
    )
    .bind(session_key)
    .fetch_all(pool)
    .await?;

    Ok(!rows.is_empty())
}
