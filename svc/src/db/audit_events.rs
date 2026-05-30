use chrono::{DateTime, Utc};
use sqlx::PgExecutor;
use uuid::Uuid;

use super::DbResult;
use crate::crypto::new_uuid;
use crate::types::AuditEvent;

/// Formats a timestamp the way JavaScript's `Date.toISOString()` does, e.g.
/// `2024-01-02T03:04:05.678Z`, so audit timestamps match the Bun service.
pub fn to_iso8601(value: DateTime<Utc>) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

pub async fn insert_audit_event<'e, E>(executor: E, name: &str, content: &str) -> DbResult<()>
where
    E: PgExecutor<'e>,
{
    sqlx::query("INSERT INTO audit_events (id, name, content) VALUES ($1, $2, $3)")
        .bind(new_uuid())
        .bind(name)
        .bind(content)
        .execute(executor)
        .await?;

    Ok(())
}

pub async fn list_audit_events(pool: &sqlx::PgPool) -> DbResult<Vec<AuditEvent>> {
    let rows = sqlx::query_as::<_, (Uuid, String, String, DateTime<Utc>)>(
        "SELECT id, name, content, created_at FROM audit_events ORDER BY id DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, content, created_at)| AuditEvent {
            id: id.to_string(),
            name,
            content,
            created_at: to_iso8601(created_at),
        })
        .collect())
}
