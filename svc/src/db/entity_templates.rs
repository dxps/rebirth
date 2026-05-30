use sqlx::PgPool;
use uuid::Uuid;

use super::{DbError, DbResult};
use crate::crypto::new_uuid;
use crate::types::{EntityTemplate, EntityTemplateAttribute, EntityTemplateLink};

pub struct EtAttr {
    pub id: String,
    pub name: String,
    pub description: String,
    pub value_type: String,
    pub is_required: bool,
    pub access_level_id: i32,
    pub listing_index: Option<i32>,
}

pub struct EtLink {
    pub id: Option<String>,
    pub target_entity_template_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub listing_index: Option<i32>,
}

struct NormAttr {
    id: Uuid,
    name: String,
    description: String,
    value_type: String,
    is_required: bool,
    access_level_id: i32,
    listing_index: i32,
}

struct NormLink {
    id: Uuid,
    target: Option<Uuid>,
    name: String,
    description: Option<String>,
    listing_index: i32,
}

fn parse_uuid(value: &str) -> Uuid {
    Uuid::parse_str(value).unwrap_or_else(|_| new_uuid())
}

fn normalize_nullable_text(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_attributes(attributes: Vec<EtAttr>) -> Vec<NormAttr> {
    let mut normalized: Vec<NormAttr> = attributes
        .into_iter()
        .enumerate()
        .map(|(index, attribute)| NormAttr {
            id: parse_uuid(&attribute.id),
            name: attribute.name.trim().to_string(),
            description: attribute.description.trim().to_string(),
            value_type: attribute.value_type,
            is_required: attribute.is_required,
            access_level_id: attribute.access_level_id,
            listing_index: attribute.listing_index.unwrap_or(index as i32),
        })
        .collect();
    normalized.sort_by_key(|attribute| attribute.listing_index);
    normalized
}

fn normalize_attributes_existing(attributes: &[EntityTemplateAttribute]) -> Vec<NormAttr> {
    normalize_attributes(
        attributes
            .iter()
            .map(|attribute| EtAttr {
                id: attribute.id.clone(),
                name: attribute.name.clone(),
                description: attribute.description.clone(),
                value_type: attribute.value_type.clone(),
                is_required: attribute.is_required,
                access_level_id: attribute.access_level_id,
                listing_index: Some(attribute.listing_index),
            })
            .collect(),
    )
}

fn normalize_links(links: Vec<EtLink>) -> Vec<NormLink> {
    let mut normalized: Vec<NormLink> = links
        .into_iter()
        .enumerate()
        .map(|(index, link)| NormLink {
            id: link.id.as_deref().map(parse_uuid).unwrap_or_else(new_uuid),
            target: link
                .target_entity_template_id
                .as_deref()
                .and_then(|value| Uuid::parse_str(value).ok()),
            name: link.name.trim().to_string(),
            description: normalize_nullable_text(link.description),
            listing_index: link.listing_index.unwrap_or(index as i32),
        })
        .collect();
    normalized.sort_by_key(|link| link.listing_index);
    normalized
}

fn listing_attribute_included(attributes: &[NormAttr], listing_attribute_id: Uuid) -> bool {
    attributes.iter().any(|attribute| attribute.id == listing_attribute_id)
}

type TemplateRow = (Uuid, String, String, Uuid, Uuid, String);
type AttrRow = (Uuid, Uuid, String, String, String, bool, i32, i32);
type LinkRow = (Uuid, Uuid, Option<Uuid>, String, Option<String>, i32);

async fn read_entity_template_rows(
    pool: &PgPool,
    id: Option<Uuid>,
) -> DbResult<Vec<EntityTemplate>> {
    let rows: Vec<TemplateRow> = match id {
        Some(id) => sqlx::query_as(
            "SELECT entity_templates.id, entity_templates.name, entity_templates.description, \
                    entity_templates.listing_attribute_id, entity_templates.owner_user_id, \
                    users.username AS owner_username \
             FROM entity_templates \
             INNER JOIN users ON users.id = entity_templates.owner_user_id \
             WHERE entity_templates.id = $1 \
             ORDER BY entity_templates.name",
        )
        .bind(id)
        .fetch_all(pool)
        .await?,
        None => sqlx::query_as(
            "SELECT entity_templates.id, entity_templates.name, entity_templates.description, \
                    entity_templates.listing_attribute_id, entity_templates.owner_user_id, \
                    users.username AS owner_username \
             FROM entity_templates \
             INNER JOIN users ON users.id = entity_templates.owner_user_id \
             ORDER BY entity_templates.name",
        )
        .fetch_all(pool)
        .await?,
    };

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<Uuid> = rows.iter().map(|row| row.0).collect();
    let attribute_rows: Vec<AttrRow> = sqlx::query_as(
        "SELECT id, entity_template_id, name, description, value_type::text, is_required, \
                access_level_id, listing_index \
         FROM entity_template_attributes \
         WHERE entity_template_id = ANY($1) \
         ORDER BY entity_template_id, listing_index",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let link_rows: Vec<LinkRow> = sqlx::query_as(
        "SELECT id, entity_template_id, target_entity_template_id, name, description, listing_index \
         FROM entity_template_links \
         WHERE entity_template_id = ANY($1) \
         ORDER BY entity_template_id, listing_index",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let templates = rows
        .into_iter()
        .map(|(tid, name, description, listing_attribute_id, owner_user_id, owner_username)| {
            EntityTemplate {
                attributes: attribute_rows
                    .iter()
                    .filter(|row| row.1 == tid)
                    .map(|row| EntityTemplateAttribute {
                        id: row.0.to_string(),
                        name: row.2.clone(),
                        description: row.3.clone(),
                        value_type: row.4.clone(),
                        is_required: row.5,
                        access_level_id: row.6,
                        listing_index: row.7,
                    })
                    .collect(),
                description,
                id: tid.to_string(),
                owner_user_id: owner_user_id.to_string(),
                owner_username: Some(owner_username),
                links: link_rows
                    .iter()
                    .filter(|row| row.1 == tid)
                    .map(|row| EntityTemplateLink {
                        id: row.0.to_string(),
                        entity_template_id: row.1.to_string(),
                        target_entity_template_id: row.2.map(|t| t.to_string()),
                        name: row.3.clone(),
                        description: row.4.clone(),
                        listing_index: row.5,
                    })
                    .collect(),
                listing_attribute_id: listing_attribute_id.to_string(),
                name,
            }
        })
        .collect();

    Ok(templates)
}

pub async fn list_entity_templates(pool: &PgPool) -> DbResult<Vec<EntityTemplate>> {
    read_entity_template_rows(pool, None).await
}

async fn replace_attributes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entity_template_id: Uuid,
    attributes: &[NormAttr],
) -> DbResult<()> {
    let existing: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM entity_template_attributes WHERE entity_template_id = $1",
    )
    .bind(entity_template_id)
    .fetch_all(&mut **tx)
    .await?;
    let next_ids: Vec<Uuid> = attributes.iter().map(|a| a.id).collect();

    for attribute in attributes {
        sqlx::query(
            "INSERT INTO entity_template_attributes \
                (id, entity_template_id, name, description, value_type, is_required, access_level_id, listing_index) \
             VALUES ($1, $2, $3, $4, $5::attribute_template_value_type, $6, $7, $8) \
             ON CONFLICT (id) DO UPDATE SET \
                entity_template_id = EXCLUDED.entity_template_id, \
                name = EXCLUDED.name, \
                description = EXCLUDED.description, \
                value_type = EXCLUDED.value_type, \
                is_required = EXCLUDED.is_required, \
                access_level_id = EXCLUDED.access_level_id, \
                listing_index = EXCLUDED.listing_index",
        )
        .bind(attribute.id)
        .bind(entity_template_id)
        .bind(&attribute.name)
        .bind(&attribute.description)
        .bind(&attribute.value_type)
        .bind(attribute.is_required)
        .bind(attribute.access_level_id)
        .bind(attribute.listing_index)
        .execute(&mut **tx)
        .await?;
    }

    let removed: Vec<Uuid> = existing
        .into_iter()
        .filter(|id| !next_ids.contains(id))
        .collect();
    if !removed.is_empty() {
        sqlx::query("DELETE FROM entity_template_attributes WHERE id = ANY($1)")
            .bind(&removed)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

async fn replace_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entity_template_id: Uuid,
    links: &[NormLink],
) -> DbResult<()> {
    let existing: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM entity_template_links WHERE entity_template_id = $1",
    )
    .bind(entity_template_id)
    .fetch_all(&mut **tx)
    .await?;
    let next_ids: Vec<Uuid> = links.iter().map(|l| l.id).collect();

    for link in links {
        sqlx::query(
            "INSERT INTO entity_template_links \
                (id, entity_template_id, target_entity_template_id, name, description, listing_index) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (id) DO UPDATE SET \
                entity_template_id = EXCLUDED.entity_template_id, \
                target_entity_template_id = EXCLUDED.target_entity_template_id, \
                name = EXCLUDED.name, \
                description = EXCLUDED.description, \
                listing_index = EXCLUDED.listing_index",
        )
        .bind(link.id)
        .bind(entity_template_id)
        .bind(link.target)
        .bind(&link.name)
        .bind(&link.description)
        .bind(link.listing_index)
        .execute(&mut **tx)
        .await?;
    }

    let removed: Vec<Uuid> = existing
        .into_iter()
        .filter(|id| !next_ids.contains(id))
        .collect();
    if !removed.is_empty() {
        sqlx::query("DELETE FROM entity_template_links WHERE id = ANY($1)")
            .bind(&removed)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

pub struct CreateEntityTemplate {
    pub name: String,
    pub description: String,
    pub listing_attribute_id: String,
    pub attributes: Vec<EtAttr>,
    pub links: Vec<EtLink>,
}

pub async fn create_entity_template(
    pool: &PgPool,
    owner_user_id: Uuid,
    input: CreateEntityTemplate,
) -> DbResult<Option<EntityTemplate>> {
    let attributes = normalize_attributes(input.attributes);
    let links = normalize_links(input.links);
    let listing_attribute_id = parse_uuid(&input.listing_attribute_id);

    if !listing_attribute_included(&attributes, listing_attribute_id) {
        return Err(DbError::Other(
            "Listing attribute must be included in attributes.".into(),
        ));
    }

    let id = new_uuid();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO entity_templates (id, owner_user_id, name, description, listing_attribute_id) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(owner_user_id)
    .bind(input.name.trim())
    .bind(input.description.trim())
    .bind(listing_attribute_id)
    .execute(&mut *tx)
    .await?;
    replace_attributes(&mut tx, id, &attributes).await?;
    replace_links(&mut tx, id, &links).await?;
    tx.commit().await?;

    Ok(read_entity_template_rows(pool, Some(id)).await?.into_iter().next())
}

#[derive(Default)]
pub struct UpdateEntityTemplate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub owner_user_id: Option<Uuid>,
    pub listing_attribute_id: Option<String>,
    pub attributes: Option<Vec<EtAttr>>,
    pub links: Option<Vec<EtLink>>,
}

pub async fn update_entity_template(
    pool: &PgPool,
    id: Uuid,
    input: UpdateEntityTemplate,
) -> DbResult<Option<EntityTemplate>> {
    let Some(existing) = read_entity_template_rows(pool, Some(id)).await?.into_iter().next() else {
        return Ok(None);
    };

    let next_attributes = match input.attributes {
        Some(attributes) => normalize_attributes(attributes),
        None => normalize_attributes_existing(&existing.attributes),
    };
    let next_listing_attribute_id = input
        .listing_attribute_id
        .as_deref()
        .map(parse_uuid)
        .unwrap_or_else(|| parse_uuid(&existing.listing_attribute_id));
    let normalized_links = input.links.map(normalize_links);

    if !listing_attribute_included(&next_attributes, next_listing_attribute_id) {
        return Err(DbError::Other(
            "Listing attribute must be included in attributes.".into(),
        ));
    }

    let owner_user_id = input
        .owner_user_id
        .unwrap_or_else(|| parse_uuid(&existing.owner_user_id));
    let name = input.name.map(|n| n.trim().to_string()).unwrap_or(existing.name);
    let description = input
        .description
        .map(|d| d.trim().to_string())
        .unwrap_or(existing.description);

    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE entity_templates SET \
            owner_user_id = $2, name = $3, description = $4, listing_attribute_id = $5 \
         WHERE id = $1",
    )
    .bind(id)
    .bind(owner_user_id)
    .bind(&name)
    .bind(&description)
    .bind(next_listing_attribute_id)
    .execute(&mut *tx)
    .await?;
    replace_attributes(&mut tx, id, &next_attributes).await?;
    if let Some(links) = normalized_links {
        replace_links(&mut tx, id, &links).await?;
    }
    tx.commit().await?;

    Ok(read_entity_template_rows(pool, Some(id)).await?.into_iter().next())
}

pub async fn delete_entity_template(pool: &PgPool, id: Uuid) -> DbResult<Option<EntityTemplate>> {
    let Some(template) = read_entity_template_rows(pool, Some(id)).await?.into_iter().next() else {
        return Ok(None);
    };
    sqlx::query("DELETE FROM entity_templates WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(Some(template))
}

// Exposed for the entities module (building an entity from a template).
pub async fn read_one(pool: &PgPool, id: Uuid) -> DbResult<Option<EntityTemplate>> {
    Ok(read_entity_template_rows(pool, Some(id)).await?.into_iter().next())
}
