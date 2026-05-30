/// Helpers for inspecting PostgreSQL errors raised through sqlx, used to map
/// constraint violations to the same HTTP responses the Bun service returns.
pub fn is_unique_violation(err: &sqlx::Error) -> bool {
    if let sqlx::Error::Database(db) = err {
        return db.code().as_deref() == Some("23505");
    }
    false
}

pub fn has_constraint(err: &sqlx::Error, constraint: &str) -> bool {
    if let sqlx::Error::Database(db) = err {
        return db.constraint() == Some(constraint);
    }
    false
}
