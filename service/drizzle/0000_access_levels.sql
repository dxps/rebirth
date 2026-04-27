CREATE TABLE "access_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "access_levels_name_unique" UNIQUE("name")
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
