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

<br/>

## Database

In case the database was already populated by the `service` (TypeScript w/ Bun.js based) backend,
you need to manually populate sqlx's migration table (that is `_sqlx_migrations`) using:
```sql
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMPTZ NOT NULL DEFAULT now(),
    success BOOLEAN NOT NULL,
    checksum BYTEA NOT NULL,
    execution_time BIGINT NOT NULL
);

INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
VALUES
    (0, 'access levels', to_timestamp(1776433786303 / 1000.0), true, decode('1a481ecd402c336e51ff602cb408845bb74075ece4965f9dfeab8de52b46e524334c356da1e723a751bc526806ee9459', 'hex'), -1),
    (1, 'users permissions', to_timestamp(1776669067759 / 1000.0), true, decode('5df6a530929e524ca6d9435e385ebb0f051e2413fd43929fd28b7f8154026e5b5a373c318cfddf1c77edc0816992c7a9', 'hex'), -1),
    (2, 'user sessions', to_timestamp(1776673900000 / 1000.0), true, decode('372e6807a0da5503253a1dfa0e5d849d07a5d6bb8501a1d88337bec122ad79102ba4e4e86ac36d987d79525676c64f19', 'hex'), -1),
    (3, 'user access levels', to_timestamp(1776748860000 / 1000.0), true, decode('b5abee728ab27ef0c8693b74b61bccd4971654fcf2b91f308ea6f488c3b05448e997529feb821aeb1988f789b2fd6047', 'hex'), -1),
    (4, 'attribute templates', to_timestamp(1776776960635 / 1000.0), true, decode('ddfd73cf7f20bea07479c5616083c6fffc1a8d7a377ee6d752983c65cd1fba99dc8270e171d5fd25a934ac1eb47dcf93', 'hex'), -1),
    (5, 'entity templates', to_timestamp(1776922301981 / 1000.0), true, decode('edd65ad909d118674ade500417431c611d1bedfb286bef9df221775729f7c48237aeeb286733b20548ea46a4c9c70f84', 'hex'), -1),
    (6, 'entities', to_timestamp(1777280400000 / 1000.0), true, decode('a0fe4c191ecbc7eddb5b263c80e98b84c966f24201f169565dfd04b96e15e6868d5a6a449ab0346a7d3ee78e8df64802', 'hex'), -1),
    (7, 'audit events', to_timestamp(1777284000000 / 1000.0), true, decode('422e1f7f3efd54ca91651dd6c7363325a5cbc629af11f2632bd7aec8b0cdcec5f61448267206cca58f568d907b8d68bb', 'hex'), -1)
ON CONFLICT (version) DO UPDATE SET
    description = EXCLUDED.description,
    installed_on = EXCLUDED.installed_on,
    success = EXCLUDED.success,
    checksum = EXCLUDED.checksum,
    execution_time = EXCLUDED.execution_time;
```