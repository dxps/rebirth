# rebirth-svc

A Rust (Axum + sqlx) re-implementation of the `service` backend, exposing an
identical HTTP API. It targets the same PostgreSQL schema and reuses the
Drizzle migration SQL (copied into `migrations/`), which is applied
automatically on startup via the sqlx migrator, followed by the same data
seeding the Bun service performs (permissions, access levels, built-in admin).

## Stack

- axum 0.7 (HTTP)
- sqlx 0.8 (PostgreSQL, runtime-checked queries)
- tokio (async runtime)
- argon2 (password hashing, compatible with the Bun service's hashes)
- uuid v7 (time-ordered identifiers)

## Running

```sh
cp .env.example .env   # adjust DATABASE_URL / PORT as needed
cargo run
```

The service listens on `PORT` (default `9908`) and runs migrations + seeding at
startup. Start a local PostgreSQL with the repository's `start_db.sh`.

## Parity notes

- Routes, status codes, JSON response shapes, auth (Bearer + Basic for the
  Spring config endpoint), permission checks, masking of restricted attribute
  values, pagination, search, and the Spring Cloud Config endpoint mirror the
  Bun `service/src/index.ts`.
- Migration files in `migrations/` are copied verbatim from `service/drizzle`
  (only the `.sql` files; Drizzle's `meta/` journal is not needed by sqlx).
- Passwords use Argon2id PHC strings; the Bun service uses `Bun.password`
  (Argon2id by default), so hashes are mutually verifiable on a shared database.
