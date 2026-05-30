pub mod access_levels;
pub mod attribute_templates;
pub mod audit_events;
pub mod entities;
pub mod entity_templates;
pub mod permissions;
pub mod users;

/// Errors surfaced by the data layer. Handlers translate these into HTTP
/// responses identical to the Bun service (validation classes map to specific
/// status codes; everything else falls through to 500).
#[derive(Debug)]
pub enum DbError {
    Sqlx(sqlx::Error),
    /// Equivalent of `EntityValidationError`.
    Entity(String),
    /// Equivalent of `UserValidationError`.
    User(String),
    /// Equivalent of a generic thrown `Error`.
    Other(String),
}

impl From<sqlx::Error> for DbError {
    fn from(value: sqlx::Error) -> Self {
        DbError::Sqlx(value)
    }
}

pub type DbResult<T> = Result<T, DbError>;
