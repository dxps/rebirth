CREATE TYPE "public"."permission_name" AS ENUM('Admin', 'Manager', 'Viewer');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "permission_name" NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
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
	(1, 'Admin', 'Can manage users, permissions, security data, and templates'),
	(2, 'Manager', 'Can create, update, and delete managed data'),
	(3, 'Viewer', 'Can view managed data')
ON CONFLICT ("id") DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description";
--> statement-breakpoint
SELECT setval(
	pg_get_serial_sequence('permissions', 'id'),
	GREATEST((SELECT MAX("id") FROM "permissions"), 1),
	true
);
