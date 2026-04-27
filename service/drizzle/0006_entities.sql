CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"entity_template_id" uuid,
	"listing_attribute_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_template_attribute_id" uuid,
	"attribute_template_id" uuid,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"value_type" "attribute_template_value_type" NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "entity_attrs_listing_idx_check" CHECK ("entity_attributes"."listing_index" >= 0),
	CONSTRAINT "entity_attrs_name_trimmed_check" CHECK ("entity_attributes"."name" = btrim("entity_attributes"."name")),
	CONSTRAINT "entity_attrs_desc_trimmed_check" CHECK ("entity_attributes"."description" = btrim("entity_attributes"."description"))
);
--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_template_link_id" uuid,
	"target_entity_template_id" uuid,
	"target_entity_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"listing_index" integer NOT NULL,
	CONSTRAINT "entity_links_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "entity_links_listing_idx_check" CHECK ("entity_links"."listing_index" >= 0),
	CONSTRAINT "entity_links_name_trimmed_check" CHECK ("entity_links"."name" = btrim("entity_links"."name")),
	CONSTRAINT "entity_links_desc_trimmed_check" CHECK ("entity_links"."description" IS NULL OR "entity_links"."description" = btrim("entity_links"."description"))
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_entity_tmpl_id_entity_tmpls_id_fk" FOREIGN KEY ("entity_template_id") REFERENCES "public"."entity_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attrs_entity_tmpl_attr_id_entity_tmpl_attrs_id_fk" FOREIGN KEY ("entity_template_attribute_id") REFERENCES "public"."entity_template_attributes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attrs_attr_tmpl_id_attribute_tmpls_id_fk" FOREIGN KEY ("attribute_template_id") REFERENCES "public"."attribute_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_attributes" ADD CONSTRAINT "entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_entity_tmpl_link_id_entity_tmpl_links_id_fk" FOREIGN KEY ("entity_template_link_id") REFERENCES "public"."entity_template_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_target_entity_tmpl_id_entity_tmpls_id_fk" FOREIGN KEY ("target_entity_template_id") REFERENCES "public"."entity_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
