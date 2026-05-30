use sqlx::PgPool;
use uuid::Uuid;

use super::DbResult;
use crate::crypto::new_uuid;
use crate::types::AttributeTemplate;

type Row = (
    Uuid,           // id
    Uuid,           // owner_user_id
    String,         // owner_username
    String,         // name
    String,         // description
    String,         // value_type
    Option<String>, // default_value
    bool,           // is_required
    i32,            // access_level_id
);

const SELECT: &str = "SELECT \
        attribute_templates.id, \
        attribute_templates.owner_user_id, \
        users.username AS owner_username, \
        attribute_templates.name, \
        attribute_templates.description, \
        attribute_templates.value_type::text, \
        attribute_templates.default_value, \
        attribute_templates.is_required, \
        attribute_templates.access_level_id \
    FROM attribute_templates \
    INNER JOIN users ON attribute_templates.owner_user_id = users.id";

fn to_attribute_template(row: Row) -> AttributeTemplate {
    AttributeTemplate {
        id: row.0.to_string(),
        owner_user_id: row.1.to_string(),
        owner_username: Some(row.2),
        name: row.3,
        description: row.4,
        value_type: row.5,
        default_value: row.6,
        is_required: row.7,
        access_level_id: row.8,
    }
}

fn normalize_default_value(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub async fn list_attribute_templates(pool: &PgPool) -> DbResult<Vec<AttributeTemplate>> {
    let query = format!("{SELECT} ORDER BY attribute_templates.name ASC");
    let rows = sqlx::query_as::<_, Row>(&query).fetch_all(pool).await?;
    Ok(rows.into_iter().map(to_attribute_template).collect())
}

async fn get(pool: &PgPool, id: Uuid) -> DbResult<Option<AttributeTemplate>> {
    let query = format!("{SELECT} WHERE attribute_templates.id = $1");
    let row = sqlx::query_as::<_, Row>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(to_attribute_template))
}

pub struct CreateAttributeTemplate {
    pub access_level_id: i32,
    pub default_value: Option<String>,
    pub description: String,
    pub is_required: bool,
    pub name: String,
    pub value_type: String,
}

pub async fn create_attribute_template(
    pool: &PgPool,
    owner_user_id: Uuid,
    input: CreateAttributeTemplate,
) -> DbResult<Option<AttributeTemplate>> {
    let id = new_uuid();
    sqlx::query(
        "INSERT INTO attribute_templates \
            (id, name, description, value_type, default_value, is_required, access_level_id, owner_user_id) \
         VALUES ($1, $2, $3, $4::attribute_template_value_type, $5, $6, $7, $8)",
    )
    .bind(id)
    .bind(input.name.trim())
    .bind(input.description.trim())
    .bind(&input.value_type)
    .bind(normalize_default_value(input.default_value))
    .bind(input.is_required)
    .bind(input.access_level_id)
    .bind(owner_user_id)
    .execute(pool)
    .await?;

    get(pool, id).await
}

#[derive(Default)]
pub struct UpdateAttributeTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub value_type: Option<String>,
    pub default_value_provided: bool,
    pub default_value: Option<String>,
    pub is_required: Option<bool>,
    pub access_level_id: Option<i32>,
    pub owner_user_id: Option<Uuid>,
}

pub async fn update_attribute_template(
    pool: &PgPool,
    id: Uuid,
    input: UpdateAttributeTemplate,
) -> DbResult<Option<AttributeTemplate>> {
    let updated = sqlx::query_scalar::<_, Uuid>(
        "UPDATE attribute_templates SET \
            name = COALESCE($2, name), \
            description = COALESCE($3, description), \
            value_type = COALESCE($4::attribute_template_value_type, value_type), \
            default_value = CASE WHEN $5 THEN $6 ELSE default_value END, \
            is_required = COALESCE($7, is_required), \
            access_level_id = COALESCE($8, access_level_id), \
            owner_user_id = COALESCE($9, owner_user_id) \
         WHERE id = $1 \
         RETURNING id",
    )
    .bind(id)
    .bind(input.name.as_deref().map(str::trim))
    .bind(input.description.as_deref().map(str::trim))
    .bind(input.value_type.as_deref())
    .bind(input.default_value_provided)
    .bind(normalize_default_value(input.default_value))
    .bind(input.is_required)
    .bind(input.access_level_id)
    .bind(input.owner_user_id)
    .fetch_optional(pool)
    .await?;

    match updated {
        Some(updated_id) => get(pool, updated_id).await,
        None => Ok(None),
    }
}

pub async fn delete_attribute_template(
    pool: &PgPool,
    id: Uuid,
) -> DbResult<Option<AttributeTemplate>> {
    // The Bun service returns the raw deleted row (no owner_username join).
    let row = sqlx::query_as::<_, (Uuid, Uuid, String, String, String, Option<String>, bool, i32)>(
        "DELETE FROM attribute_templates WHERE id = $1 \
         RETURNING id, owner_user_id, name, description, value_type::text, \
                   default_value, is_required, access_level_id",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| AttributeTemplate {
        id: r.0.to_string(),
        owner_user_id: r.1.to_string(),
        owner_username: None,
        name: r.2,
        description: r.3,
        value_type: r.4,
        default_value: r.5,
        is_required: r.6,
        access_level_id: r.7,
    }))
}
