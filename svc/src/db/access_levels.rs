use sqlx::PgPool;

use super::DbResult;
use crate::types::AccessLevel;

fn to_access_level(row: (i32, String, String)) -> AccessLevel {
    AccessLevel {
        id: row.0,
        name: row.1,
        description: row.2,
    }
}

pub async fn list_access_levels(pool: &PgPool) -> DbResult<Vec<AccessLevel>> {
    let rows = sqlx::query_as::<_, (i32, String, String)>(
        "SELECT id, name, description FROM access_levels ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(to_access_level).collect())
}

pub async fn create_access_level(
    pool: &PgPool,
    name: &str,
    description: &str,
) -> DbResult<AccessLevel> {
    let row = sqlx::query_as::<_, (i32, String, String)>(
        "INSERT INTO access_levels (name, description) VALUES ($1, $2) \
         RETURNING id, name, description",
    )
    .bind(name)
    .bind(description)
    .fetch_one(pool)
    .await?;

    Ok(to_access_level(row))
}

pub async fn update_access_level(
    pool: &PgPool,
    id: i32,
    name: Option<String>,
    description: Option<String>,
) -> DbResult<Option<AccessLevel>> {
    let row = sqlx::query_as::<_, (i32, String, String)>(
        "UPDATE access_levels \
         SET name = COALESCE($2, name), description = COALESCE($3, description) \
         WHERE id = $1 \
         RETURNING id, name, description",
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(to_access_level))
}

pub async fn delete_access_level(pool: &PgPool, id: i32) -> DbResult<Option<AccessLevel>> {
    let row = sqlx::query_as::<_, (i32, String, String)>(
        "DELETE FROM access_levels WHERE id = $1 RETURNING id, name, description",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(to_access_level))
}
