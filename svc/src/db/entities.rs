use std::collections::HashMap;

use sqlx::PgPool;
use uuid::Uuid;

use super::{DbError, DbResult};
use crate::crypto::new_uuid;
use crate::db::entity_templates;
use crate::types::{Entity, EntityAttribute, EntityIncomingLink, EntityLink};

pub struct EntAttrInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub value_type: String,
    pub is_required: bool,
    pub access_level_id: i32,
    pub listing_index: Option<i32>,
    pub value: String,
}

pub struct EntLinkInput {
    pub target_entity_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub listing_index: Option<i32>,
}

pub enum CreateEntity {
    FromScratch {
        attributes: Vec<EntAttrInput>,
        listing_attribute_id: String,
        links: Vec<EntLinkInput>,
    },
    FromTemplate {
        entity_template_id: String,
        attributes: Option<Vec<EntAttrInput>>,
        listing_attribute_id: Option<String>,
        links: Option<Vec<EntLinkInput>>,
    },
}

pub struct UpdateEntity {
    pub attributes: Vec<EntAttrInput>,
    pub listing_attribute_id: String,
    pub links: Vec<EntLinkInput>,
    pub owner_user_id: Option<Uuid>,
}

struct NormAttr {
    id: Uuid,
    name: String,
    description: String,
    value_type: String,
    is_required: bool,
    access_level_id: i32,
    listing_index: i32,
    value: String,
}

struct NormLink {
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

fn normalize_attributes(attributes: Vec<EntAttrInput>) -> Vec<NormAttr> {
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
            value: attribute.value,
        })
        .collect();
    normalized.sort_by_key(|attribute| attribute.listing_index);
    normalized
}

// Template-derived attributes keep names/descriptions verbatim (no trim),
// matching `buildEntityFromTemplate` in the Bun service.
fn map_template_explicit_attributes(attributes: Vec<EntAttrInput>) -> Vec<NormAttr> {
    let mut mapped: Vec<NormAttr> = attributes
        .into_iter()
        .enumerate()
        .map(|(index, attribute)| NormAttr {
            id: parse_uuid(&attribute.id),
            name: attribute.name,
            description: attribute.description,
            value_type: attribute.value_type,
            is_required: attribute.is_required,
            access_level_id: attribute.access_level_id,
            listing_index: attribute.listing_index.unwrap_or(index as i32),
            value: attribute.value,
        })
        .collect();
    mapped.sort_by_key(|attribute| attribute.listing_index);
    mapped
}

fn normalize_links(links: Vec<EntLinkInput>) -> Vec<NormLink> {
    let mut normalized: Vec<NormLink> = links
        .into_iter()
        .enumerate()
        .map(|(index, link)| NormLink {
            target: link.target_entity_id.as_deref().and_then(|v| Uuid::parse_str(v).ok()),
            name: link.name.trim().to_string(),
            description: normalize_nullable_text(link.description),
            listing_index: link.listing_index.unwrap_or(index as i32),
        })
        .collect();
    normalized.sort_by_key(|link| link.listing_index);
    normalized
}

// Links supplied alongside a template are inserted in given order (no sort),
// matching the Bun service.
fn map_links_raw(links: Vec<EntLinkInput>) -> Vec<NormLink> {
    links
        .into_iter()
        .enumerate()
        .map(|(index, link)| NormLink {
            target: link.target_entity_id.as_deref().and_then(|v| Uuid::parse_str(v).ok()),
            name: link.name.trim().to_string(),
            description: normalize_nullable_text(link.description),
            listing_index: link.listing_index.unwrap_or(index as i32),
        })
        .collect()
}

fn listing_included(attributes: &[NormAttr], listing_attribute_id: Uuid) -> bool {
    attributes.iter().any(|attribute| attribute.id == listing_attribute_id)
}

fn validate_required(attributes: &[NormAttr]) -> DbResult<()> {
    let missing: Vec<&str> = attributes
        .iter()
        .filter(|attribute| {
            attribute.is_required
                && attribute.value_type != "boolean"
                && attribute.value.trim().is_empty()
        })
        .map(|attribute| attribute.name.as_str())
        .collect();

    if missing.is_empty() {
        Ok(())
    } else {
        Err(DbError::Entity(format!(
            "Required attribute values are missing: {}.",
            missing.join(", ")
        )))
    }
}

fn nullable_typed_value(attribute: &NormAttr) -> Option<String> {
    let trimmed = attribute.value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

const ATTR_UNION: &str = "SELECT id, entity_id, name, description, 'text'::text AS value_type, \
            is_required, access_level_id, listing_index, value FROM text_entity_attributes \
        UNION ALL \
        SELECT id, entity_id, name, description, 'number'::text AS value_type, is_required, \
            access_level_id, listing_index, COALESCE(value::text, '') AS value FROM number_entity_attributes \
        UNION ALL \
        SELECT id, entity_id, name, description, 'boolean'::text AS value_type, is_required, \
            access_level_id, listing_index, value::text AS value FROM boolean_entity_attributes \
        UNION ALL \
        SELECT id, entity_id, name, description, 'date'::text AS value_type, is_required, \
            access_level_id, listing_index, COALESCE(value::text, '') AS value FROM date_entity_attributes \
        UNION ALL \
        SELECT id, entity_id, name, description, 'datetime'::text AS value_type, is_required, \
            access_level_id, listing_index, COALESCE(value::text, '') AS value FROM datetime_entity_attributes";

const LABEL_UNION: &str = "SELECT id, value FROM text_entity_attributes \
        UNION ALL SELECT id, COALESCE(value::text, '') AS value FROM number_entity_attributes \
        UNION ALL SELECT id, value::text AS value FROM boolean_entity_attributes \
        UNION ALL SELECT id, COALESCE(value::text, '') AS value FROM date_entity_attributes \
        UNION ALL SELECT id, COALESCE(value::text, '') AS value FROM datetime_entity_attributes";

type EntityRow = (Uuid, Uuid, Option<String>, Uuid);
type AttrRow = (Uuid, Uuid, String, String, String, bool, i32, i32, String);
type LinkRow = (Uuid, Uuid, Option<Uuid>, String, Option<String>, i32);
type LabelRow = (Uuid, Option<String>);
type IncomingRow = (Uuid, Uuid, Uuid, Option<String>, String, Option<String>, i32);

async fn read_entity_rows(
    pool: &PgPool,
    id: Option<Uuid>,
    search: Option<&str>,
) -> DbResult<Vec<Entity>> {
    let search_pattern = search
        .map(str::trim)
        .filter(|term| term.len() >= 3)
        .map(|term| format!("%{term}%"));

    let rows: Vec<EntityRow> = if let Some(id) = id {
        sqlx::query_as(
            "SELECT entities.id, entities.owner_user_id, users.username AS owner_username, \
                    entities.listing_attribute_id \
             FROM entities \
             INNER JOIN users ON users.id = entities.owner_user_id \
             WHERE entities.id = $1",
        )
            .bind(id)
            .fetch_all(pool)
            .await?
    } else if let Some(pattern) = &search_pattern {
        let query = format!(
            "SELECT entities.id, entities.owner_user_id, users.username AS owner_username, \
                    entities.listing_attribute_id \
             FROM entities \
             INNER JOIN users ON users.id = entities.owner_user_id \
             WHERE EXISTS ( \
                SELECT 1 FROM ( \
                    SELECT entity_id, name, value FROM text_entity_attributes \
                    UNION ALL SELECT entity_id, name, COALESCE(value::text, '') FROM number_entity_attributes \
                    UNION ALL SELECT entity_id, name, value::text FROM boolean_entity_attributes \
                    UNION ALL SELECT entity_id, name, COALESCE(value::text, '') FROM date_entity_attributes \
                    UNION ALL SELECT entity_id, name, COALESCE(value::text, '') FROM datetime_entity_attributes \
                ) AS entity_attributes \
                WHERE entity_attributes.entity_id = entities.id \
                    AND (entity_attributes.name ILIKE $1 OR entity_attributes.value ILIKE $1) \
             )"
        );
        sqlx::query_as(&query).bind(pattern).fetch_all(pool).await?
    } else {
        sqlx::query_as(
            "SELECT entities.id, entities.owner_user_id, users.username AS owner_username, \
                    entities.listing_attribute_id \
             FROM entities \
             INNER JOIN users ON users.id = entities.owner_user_id",
        )
            .fetch_all(pool)
            .await?
    };

    if rows.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<Uuid> = rows.iter().map(|row| row.0).collect();

    let attribute_query = format!(
        "SELECT id, entity_id, name, description, value_type, is_required, access_level_id, \
                listing_index, value \
         FROM ({ATTR_UNION}) AS entity_attributes \
         WHERE entity_id = ANY($1) ORDER BY entity_id, listing_index"
    );
    let attribute_rows: Vec<AttrRow> =
        sqlx::query_as(&attribute_query).bind(&ids).fetch_all(pool).await?;

    let link_rows: Vec<LinkRow> = sqlx::query_as(
        "SELECT id, entity_id, target_entity_id, name, description, listing_index \
         FROM entity_links WHERE entity_id = ANY($1) ORDER BY entity_id, listing_index",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let outgoing_target_ids: Vec<Uuid> = {
        let mut seen = Vec::new();
        for row in &link_rows {
            if let Some(target) = row.2 {
                if !seen.contains(&target) {
                    seen.push(target);
                }
            }
        }
        seen
    };

    let target_labels: HashMap<Uuid, String> = if outgoing_target_ids.is_empty() {
        HashMap::new()
    } else {
        let label_query = format!(
            "SELECT entities.id, entity_attributes.value AS label \
             FROM entities \
             LEFT JOIN ({LABEL_UNION}) AS entity_attributes \
                ON entity_attributes.id = entities.listing_attribute_id \
             WHERE entities.id = ANY($1)"
        );
        let label_rows: Vec<LabelRow> =
            sqlx::query_as(&label_query).bind(&outgoing_target_ids).fetch_all(pool).await?;
        label_rows
            .into_iter()
            .map(|(id, label)| (id, label.unwrap_or_default()))
            .collect()
    };

    let incoming_query = format!(
        "SELECT entity_links.id, entity_links.target_entity_id, \
                entity_links.entity_id AS source_entity_id, \
                source_listing_attribute.value AS source_entity_label, \
                entity_links.name, entity_links.description, entity_links.listing_index \
         FROM entity_links \
         INNER JOIN entities AS source_entities ON source_entities.id = entity_links.entity_id \
         LEFT JOIN ({LABEL_UNION}) AS source_listing_attribute \
            ON source_listing_attribute.id = source_entities.listing_attribute_id \
         WHERE entity_links.target_entity_id = ANY($1) \
         ORDER BY source_entity_label, entity_links.listing_index"
    );
    let incoming_rows: Vec<IncomingRow> =
        sqlx::query_as(&incoming_query).bind(&ids).fetch_all(pool).await?;

    let mut incoming_by_entity: HashMap<Uuid, Vec<EntityIncomingLink>> = HashMap::new();
    for row in incoming_rows {
        let source_id = row.2;
        let link = EntityIncomingLink {
            description: row.5,
            id: row.0.to_string(),
            listing_index: row.6,
            name: row.4,
            source_entity_id: source_id.to_string(),
            source_entity_label: row.3.unwrap_or_else(|| source_id.to_string()),
        };
        incoming_by_entity.entry(row.1).or_default().push(link);
    }

    let mut entities: Vec<Entity> = rows
        .into_iter()
        .map(|(eid, owner_user_id, owner_username, listing_attribute_id)| {
            let mut attributes: Vec<&AttrRow> =
                attribute_rows.iter().filter(|row| row.1 == eid).collect();
            attributes.sort_by_key(|row| row.7);

            let mut links: Vec<&LinkRow> = link_rows.iter().filter(|row| row.1 == eid).collect();
            links.sort_by_key(|row| row.5);

            Entity {
                attributes: attributes
                    .into_iter()
                    .map(|row| EntityAttribute {
                        id: row.0.to_string(),
                        name: row.2.clone(),
                        description: row.3.clone(),
                        is_required: row.5,
                        access_level_id: row.6,
                        listing_index: row.7,
                        value: row.8.clone(),
                        value_type: row.4.clone(),
                    })
                    .collect(),
                id: eid.to_string(),
                owner_user_id: owner_user_id.to_string(),
                owner_username,
                links: links
                    .into_iter()
                    .map(|row| EntityLink {
                        id: row.0.to_string(),
                        entity_id: row.1.to_string(),
                        target_entity_id: row.2.map(|t| t.to_string()),
                        target_entity_label: row
                            .2
                            .and_then(|t| target_labels.get(&t).cloned()),
                        name: row.3.clone(),
                        description: row.4.clone(),
                        listing_index: row.5,
                    })
                    .collect(),
                incoming_links: incoming_by_entity.remove(&eid).unwrap_or_default(),
                listing_attribute_id: listing_attribute_id.to_string(),
                incoming_links_count: None,
                outgoing_links_count: None,
            }
        })
        .collect();

    entities.sort_by(|left, right| {
        listing_value(left).cmp(&listing_value(right))
    });

    Ok(entities)
}

fn listing_value(entity: &Entity) -> String {
    entity
        .attributes
        .iter()
        .find(|attribute| attribute.id == entity.listing_attribute_id)
        .map(|attribute| attribute.value.clone())
        .unwrap_or_default()
}

async fn hydrate_counts(pool: &PgPool, entities: &mut [Entity]) -> DbResult<()> {
    if entities.is_empty() {
        return Ok(());
    }
    let ids: Vec<Uuid> = entities.iter().map(|entity| parse_uuid(&entity.id)).collect();

    let outgoing: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT entity_id, COUNT(*)::bigint AS total FROM entity_links \
         WHERE entity_id = ANY($1) GROUP BY entity_id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;
    let incoming: Vec<(Uuid, i64)> = sqlx::query_as(
        "SELECT target_entity_id AS entity_id, COUNT(*)::bigint AS total FROM entity_links \
         WHERE target_entity_id = ANY($1) GROUP BY target_entity_id",
    )
    .bind(&ids)
    .fetch_all(pool)
    .await?;

    let outgoing_map: HashMap<Uuid, i64> = outgoing.into_iter().collect();
    let incoming_map: HashMap<Uuid, i64> = incoming.into_iter().collect();

    for entity in entities.iter_mut() {
        let id = parse_uuid(&entity.id);
        entity.outgoing_links_count = Some(*outgoing_map.get(&id).unwrap_or(&0));
        entity.incoming_links_count = Some(*incoming_map.get(&id).unwrap_or(&0));
    }
    Ok(())
}

pub async fn list_entities_with_counts(
    pool: &PgPool,
    search: Option<&str>,
) -> DbResult<Vec<Entity>> {
    let mut entities = read_entity_rows(pool, None, search).await?;
    hydrate_counts(pool, &mut entities).await?;
    Ok(entities)
}

pub async fn list_all_entities(pool: &PgPool) -> DbResult<Vec<Entity>> {
    read_entity_rows(pool, None, None).await
}

pub async fn get_entity(pool: &PgPool, id: Uuid) -> DbResult<Option<Entity>> {
    Ok(read_entity_rows(pool, Some(id), None).await?.into_iter().next())
}

async fn insert_attributes(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entity_id: Uuid,
    attributes: &[NormAttr],
) -> DbResult<()> {
    for attribute in attributes {
        let nullable = nullable_typed_value(attribute);
        match attribute.value_type.as_str() {
            "text" => {
                sqlx::query(
                    "INSERT INTO text_entity_attributes \
                        (id, entity_id, name, description, is_required, access_level_id, listing_index, value) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                )
                .bind(attribute.id).bind(entity_id).bind(&attribute.name).bind(&attribute.description)
                .bind(attribute.is_required).bind(attribute.access_level_id).bind(attribute.listing_index)
                .bind(&attribute.value)
                .execute(&mut **tx).await?;
            }
            "number" => {
                sqlx::query(
                    "INSERT INTO number_entity_attributes \
                        (id, entity_id, name, description, is_required, access_level_id, listing_index, value) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric)",
                )
                .bind(attribute.id).bind(entity_id).bind(&attribute.name).bind(&attribute.description)
                .bind(attribute.is_required).bind(attribute.access_level_id).bind(attribute.listing_index)
                .bind(nullable)
                .execute(&mut **tx).await?;
            }
            "boolean" => {
                sqlx::query(
                    "INSERT INTO boolean_entity_attributes \
                        (id, entity_id, name, description, is_required, access_level_id, listing_index, value) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                )
                .bind(attribute.id).bind(entity_id).bind(&attribute.name).bind(&attribute.description)
                .bind(attribute.is_required).bind(attribute.access_level_id).bind(attribute.listing_index)
                .bind(attribute.value == "true")
                .execute(&mut **tx).await?;
            }
            "date" => {
                sqlx::query(
                    "INSERT INTO date_entity_attributes \
                        (id, entity_id, name, description, is_required, access_level_id, listing_index, value) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date)",
                )
                .bind(attribute.id).bind(entity_id).bind(&attribute.name).bind(&attribute.description)
                .bind(attribute.is_required).bind(attribute.access_level_id).bind(attribute.listing_index)
                .bind(nullable)
                .execute(&mut **tx).await?;
            }
            _ => {
                sqlx::query(
                    "INSERT INTO datetime_entity_attributes \
                        (id, entity_id, name, description, is_required, access_level_id, listing_index, value) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp)",
                )
                .bind(attribute.id).bind(entity_id).bind(&attribute.name).bind(&attribute.description)
                .bind(attribute.is_required).bind(attribute.access_level_id).bind(attribute.listing_index)
                .bind(nullable)
                .execute(&mut **tx).await?;
            }
        }
    }
    Ok(())
}

async fn insert_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entity_id: Uuid,
    links: &[NormLink],
) -> DbResult<()> {
    for link in links {
        sqlx::query(
            "INSERT INTO entity_links (id, entity_id, target_entity_id, name, description, listing_index) \
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(new_uuid())
        .bind(entity_id)
        .bind(link.target)
        .bind(&link.name)
        .bind(&link.description)
        .bind(link.listing_index)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn delete_entity_children(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    entity_id: Uuid,
) -> DbResult<()> {
    for table in [
        "text_entity_attributes",
        "number_entity_attributes",
        "boolean_entity_attributes",
        "date_entity_attributes",
        "datetime_entity_attributes",
    ] {
        sqlx::query(&format!("DELETE FROM {table} WHERE entity_id = $1"))
            .bind(entity_id)
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

struct NormalizedEntity {
    attributes: Vec<NormAttr>,
    links: Vec<NormLink>,
    listing_attribute_id: Uuid,
}

async fn build_from_template(
    pool: &PgPool,
    entity_template_id: &str,
    attributes: Option<Vec<EntAttrInput>>,
    listing_attribute_id: Option<String>,
    links: Option<Vec<EntLinkInput>>,
) -> DbResult<Option<NormalizedEntity>> {
    let template_uuid = parse_uuid(entity_template_id);
    let Some(template) = entity_templates::read_one(pool, template_uuid).await? else {
        return Ok(None);
    };

    let mut template_attr_to_entity_attr: HashMap<String, Uuid> = HashMap::new();
    let norm_attributes = match attributes {
        Some(explicit) => map_template_explicit_attributes(explicit),
        None => {
            let mut generated: Vec<NormAttr> = template
                .attributes
                .iter()
                .map(|attribute| {
                    let id = new_uuid();
                    template_attr_to_entity_attr.insert(attribute.id.clone(), id);
                    NormAttr {
                        id,
                        name: attribute.name.clone(),
                        description: attribute.description.clone(),
                        value_type: attribute.value_type.clone(),
                        is_required: attribute.is_required,
                        access_level_id: attribute.access_level_id,
                        listing_index: attribute.listing_index,
                        value: String::new(),
                    }
                })
                .collect();
            generated.sort_by_key(|attribute| attribute.listing_index);
            generated
        }
    };

    let listing_attribute_id = match listing_attribute_id {
        Some(id) => parse_uuid(&id),
        None => match template_attr_to_entity_attr.get(&template.listing_attribute_id) {
            Some(id) => *id,
            None => {
                return Err(DbError::Other("Template listing attribute is missing.".into()));
            }
        },
    };

    let norm_links = match links {
        Some(provided) => map_links_raw(provided),
        None => template
            .links
            .iter()
            .map(|link| NormLink {
                target: None,
                name: link.name.clone(),
                description: link.description.clone(),
                listing_index: link.listing_index,
            })
            .collect(),
    };

    Ok(Some(NormalizedEntity {
        attributes: norm_attributes,
        links: norm_links,
        listing_attribute_id,
    }))
}

pub async fn create_entity(
    pool: &PgPool,
    owner_user_id: Uuid,
    input: CreateEntity,
) -> DbResult<Option<Entity>> {
    let id = new_uuid();

    let normalized = match input {
        CreateEntity::FromTemplate {
            entity_template_id,
            attributes,
            listing_attribute_id,
            links,
        } => {
            match build_from_template(pool, &entity_template_id, attributes, listing_attribute_id, links)
                .await?
            {
                Some(normalized) => normalized,
                None => return Ok(None),
            }
        }
        CreateEntity::FromScratch {
            attributes,
            listing_attribute_id,
            links,
        } => NormalizedEntity {
            attributes: normalize_attributes(attributes),
            links: normalize_links(links),
            listing_attribute_id: parse_uuid(&listing_attribute_id),
        },
    };

    if !listing_included(&normalized.attributes, normalized.listing_attribute_id) {
        return Err(DbError::Other(
            "Listing attribute must be included in attributes.".into(),
        ));
    }
    validate_required(&normalized.attributes)?;

    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO entities (id, owner_user_id, listing_attribute_id) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(owner_user_id)
        .bind(normalized.listing_attribute_id)
        .execute(&mut *tx)
        .await?;
    insert_attributes(&mut tx, id, &normalized.attributes).await?;
    insert_links(&mut tx, id, &normalized.links).await?;
    tx.commit().await?;

    get_entity(pool, id).await
}

pub async fn update_entity(
    pool: &PgPool,
    id: Uuid,
    input: UpdateEntity,
) -> DbResult<Option<Entity>> {
    let Some(existing) = get_entity(pool, id).await? else {
        return Ok(None);
    };

    let next_attributes = normalize_attributes(input.attributes);
    let next_links = normalize_links(input.links);
    let next_listing_attribute_id = parse_uuid(&input.listing_attribute_id);

    if !listing_included(&next_attributes, next_listing_attribute_id) {
        return Err(DbError::Other(
            "Listing attribute must be included in attributes.".into(),
        ));
    }
    validate_required(&next_attributes)?;

    let owner_user_id = input
        .owner_user_id
        .unwrap_or_else(|| parse_uuid(&existing.owner_user_id));

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE entities SET owner_user_id = $2, listing_attribute_id = $3 WHERE id = $1")
        .bind(id)
        .bind(owner_user_id)
        .bind(next_listing_attribute_id)
        .execute(&mut *tx)
        .await?;
    delete_entity_children(&mut tx, id).await?;
    insert_attributes(&mut tx, id, &next_attributes).await?;
    sqlx::query("DELETE FROM entity_links WHERE entity_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    insert_links(&mut tx, id, &next_links).await?;
    tx.commit().await?;

    get_entity(pool, id).await
}

pub async fn delete_entity(pool: &PgPool, id: Uuid) -> DbResult<Option<Entity>> {
    let Some(existing) = get_entity(pool, id).await? else {
        return Ok(None);
    };

    let referencing: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM entity_links WHERE target_entity_id = $1 LIMIT 1")
            .bind(id)
            .fetch_optional(pool)
            .await?;
    if referencing.is_some() {
        return Err(DbError::Entity(
            "Entity cannot be deleted while other entities link to it.".into(),
        ));
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM entity_links WHERE entity_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    delete_entity_children(&mut tx, id).await?;
    sqlx::query("DELETE FROM entities WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    Ok(Some(existing))
}
