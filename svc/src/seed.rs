use sqlx::PgPool;
use uuid::Uuid;

use crate::crypto::hash_password;

/// Reproduces the post-migration seeding performed by the Bun service's
/// `runMigrations`, in the same order: permissions, the audit access-level to
/// permission backfill, access levels, then the built-in admin user. Every
/// step is idempotent.
pub async fn run_seeding(pool: &PgPool) -> Result<(), sqlx::Error> {
    seed_permissions(pool).await?;
    migrate_audit_access_level_permission(pool).await?;
    seed_access_levels(pool).await?;
    seed_initial_admin_user(pool).await?;
    Ok(())
}

async fn seed_permissions(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO permissions (id, name, description) VALUES \
            (1, 'Admin', 'Can manage users, security (access levels, permissions), templates and data.'), \
            (2, 'Editor', 'Can create, update, and delete templates and data.'), \
            (3, 'Manage Own Data', 'Allows managing only your own data (entities, entity templates, attribute templates)'), \
            (4, 'Viewer', 'Can view managed data with public (and any other assigned) access levels.'), \
            (5, 'Audit', 'Can view audit events.') \
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "SELECT setval(pg_get_serial_sequence('permissions', 'id'), \
            GREATEST((SELECT MAX(id) FROM permissions), 1), true)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn migrate_audit_access_level_permission(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO user_permissions (user_id, permission_id) \
         SELECT user_access_levels.user_id, permissions.id \
         FROM user_access_levels \
         INNER JOIN access_levels ON access_levels.id = user_access_levels.access_level_id \
         INNER JOIN permissions ON permissions.name = 'Audit' \
         WHERE access_levels.name = 'Audit' \
         ON CONFLICT (user_id, permission_id) DO NOTHING",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_access_levels(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO access_levels (id, name, description) VALUES \
            (1, 'Public', 'Publicly visible'), \
            (2, 'Private', 'Private access needed'), \
            (3, 'Confidential', 'A more restricted access'), \
            (4, 'Owner View', 'The owner of the entity having the attribute can only view it') \
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description",
    )
    .execute(pool)
    .await?;

    sqlx::query("DELETE FROM access_levels WHERE name = 'Audit'")
        .execute(pool)
        .await?;

    sqlx::query(
        "SELECT setval(pg_get_serial_sequence('access_levels', 'id'), \
            GREATEST((SELECT MAX(id) FROM access_levels), 1), true)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_initial_admin_user(pool: &PgPool) -> Result<(), sqlx::Error> {
    let admin_id = Uuid::parse_str("0196626d-7d6f-7a12-9f64-1c4f7a1f7a01").expect("valid uuid");
    let password_hash = hash_password("admin");

    sqlx::query(
        "INSERT INTO users (id, email, first_name, last_name, username, password_hash) \
         VALUES ($1, 'admin@rebirth.localhost', 'Admin', 'User', 'admin', $2) \
         ON CONFLICT (username) DO NOTHING",
    )
    .bind(admin_id)
    .bind(&password_hash)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO user_permissions (user_id, permission_id) \
         SELECT users.id, 1 FROM users WHERE users.username = 'admin' \
         ON CONFLICT (user_id, permission_id) DO NOTHING",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO user_access_levels (user_id, access_level_id) \
         SELECT users.id, access_levels.id FROM users \
         CROSS JOIN access_levels \
         WHERE users.username = 'admin' AND access_levels.id IN (1, 2, 3) \
         ON CONFLICT (user_id, access_level_id) DO NOTHING",
    )
    .execute(pool)
    .await?;
    Ok(())
}
