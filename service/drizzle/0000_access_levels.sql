CREATE TABLE "access_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "access_levels_name_unique" UNIQUE("name")
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_trimmed_check" CHECK ("users"."email" = btrim("users"."email")),
	CONSTRAINT "users_first_name_trimmed_check" CHECK ("users"."first_name" = btrim("users"."first_name")),
	CONSTRAINT "users_last_name_trimmed_check" CHECK ("users"."last_name" = btrim("users"."last_name")),
	CONSTRAINT "users_username_trimmed_check" CHECK ("users"."username" = btrim("users"."username")),
	CONSTRAINT "users_email_contains_at_check" CHECK (position('@' in "users"."email") > 1)
);

INSERT INTO "access_levels" ("id", "name", "description")
VALUES
	(1, 'Public', 'Publicly visible'),
	(2, 'Private', 'Private access needed'),
	(3, 'Confidential', 'A more restricted access'),
	(4, 'Audit', 'Can view audit events')
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description";

-- Update the sequence after seeding, so future inserts 
-- won’t collide with existing ids.
SELECT setval(
	pg_get_serial_sequence('access_levels', 'id'),
	GREATEST((SELECT MAX("id") FROM "access_levels"), 1),
	true
);
