CREATE TYPE "public"."attribute_template_value_type" AS ENUM('text', 'number', 'boolean', 'date', 'datetime');--> statement-breakpoint
CREATE TABLE "attribute_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"value_type" "attribute_template_value_type" DEFAULT 'text' NOT NULL,
	"default_value" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	CONSTRAINT "attribute_templates_name_trimmed_check" CHECK ("name" = btrim("name")),
	CONSTRAINT "attribute_templates_description_trimmed_check" CHECK ("description" = btrim("description")),
	CONSTRAINT "attribute_templates_name_description_unique" UNIQUE("name","description")
);
--> statement-breakpoint
ALTER TABLE "attribute_templates" ADD CONSTRAINT "attribute_templates_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;
