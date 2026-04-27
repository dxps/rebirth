CREATE TYPE "public"."permission_name" AS ENUM('Admin', 'Editor', 'Manage Own Data', 'Viewer');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "permission_name" NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission_id" integer NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_id_pk" PRIMARY KEY("user_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "permissions" ("id", "name", "description")
VALUES
	(1, 'Admin', 'Can manage users, permissions, security data, and templates.'),
	(2, 'Editor', 'Can create, update, and delete managed data, besides viewing it.'),
	(3, 'Manage Own Data', 'Allows managing only your own data (entities, entity templates, attribute templates)'),
	(4, 'Viewer', 'Can view managed data with public (and any other assigned) access levels.')
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description";
--> statement-breakpoint
SELECT setval(
	pg_get_serial_sequence('permissions', 'id'),
	GREATEST((SELECT MAX("id") FROM "permissions"), 1),
	true
);
