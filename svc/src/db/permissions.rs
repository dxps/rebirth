use sqlx::PgPool;

use super::DbResult;
use crate::types::Permission;

pub async fn list_permissions(pool: &PgPool) -> DbResult<Vec<Permission>> {
    let rows = sqlx::query_as::<_, (i32, String, String)>(
        "SELECT id, name::text, description FROM permissions ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, description)| Permission {
            id,
            name,
            description,
        })
        .collect())
}
