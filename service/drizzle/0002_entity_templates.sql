CREATE TABLE "entity_template_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_template_id" uuid NOT NULL,
	"attribute_template_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"value_type" "attribute_template_value_type" NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	CONSTRAINT "entity_tmpl_attrs_entity_tmpl_id_listing_idx_unique" UNIQUE("entity_template_id","listing_index"),
	CONSTRAINT "entity_tmpl_attrs_listing_idx_check" CHECK ("entity_template_attributes"."listing_index" >= 0),
	CONSTRAINT "entity_tmpl_attrs_name_trimmed_check" CHECK ("entity_template_attributes"."name" = btrim("entity_template_attributes"."name")),
	CONSTRAINT "entity_tmpl_attrs_desc_trimmed_check" CHECK ("entity_template_attributes"."description" = btrim("entity_template_attributes"."description"))
);
--> statement-breakpoint
CREATE TABLE "entity_template_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_template_id" uuid NOT NULL,
	"target_entity_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "entity_tmpl_links_source_target_name_unique" UNIQUE("entity_template_id","target_entity_template_id","name"),
	CONSTRAINT "entity_tmpl_links_name_trimmed_check" CHECK ("entity_template_links"."name" = btrim("entity_template_links"."name")),
	CONSTRAINT "entity_tmpl_links_desc_trimmed_check" CHECK ("entity_template_links"."description" IS NULL OR "entity_template_links"."description" = btrim("entity_template_links"."description"))
);
--> statement-breakpoint
CREATE TABLE "entity_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"listing_attribute_id" uuid NOT NULL,
	CONSTRAINT "entity_tmpls_name_unique" UNIQUE("name"),
	CONSTRAINT "entity_tmpls_name_trimmed_check" CHECK ("entity_templates"."name" = btrim("entity_templates"."name")),
	CONSTRAINT "entity_tmpls_desc_trimmed_check" CHECK ("entity_templates"."description" = btrim("entity_templates"."description"))
);
--> statement-breakpoint
ALTER TABLE "entity_template_attributes" ADD CONSTRAINT "entity_tmpl_attrs_entity_tmpl_id_entity_tmpls_id_fk" FOREIGN KEY ("entity_template_id") REFERENCES "public"."entity_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_template_attributes" ADD CONSTRAINT "entity_tmpl_attrs_attr_tmpl_id_attribute_tmpls_id_fk" FOREIGN KEY ("attribute_template_id") REFERENCES "public"."attribute_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_template_attributes" ADD CONSTRAINT "entity_tmpl_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_template_links" ADD CONSTRAINT "entity_tmpl_links_entity_tmpl_id_entity_tmpls_id_fk" FOREIGN KEY ("entity_template_id") REFERENCES "public"."entity_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_template_links" ADD CONSTRAINT "entity_tmpl_links_target_entity_tmpl_id_entity_tmpls_id_fk" FOREIGN KEY ("target_entity_template_id") REFERENCES "public"."entity_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
