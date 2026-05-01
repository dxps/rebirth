CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"listing_attribute_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "text_entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "text_entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "text_entity_attrs_listing_idx_check" CHECK ("text_entity_attributes"."listing_index" >= 0),
	CONSTRAINT "text_entity_attrs_name_trimmed_check" CHECK ("text_entity_attributes"."name" = btrim("text_entity_attributes"."name")),
	CONSTRAINT "text_entity_attrs_desc_trimmed_check" CHECK ("text_entity_attributes"."description" = btrim("text_entity_attributes"."description"))
);
--> statement-breakpoint
CREATE INDEX "text_entity_attrs_value_idx" ON "text_entity_attributes" USING btree ("value");--> statement-breakpoint
CREATE TABLE "number_entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" numeric,
	CONSTRAINT "number_entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "number_entity_attrs_listing_idx_check" CHECK ("number_entity_attributes"."listing_index" >= 0),
	CONSTRAINT "number_entity_attrs_name_trimmed_check" CHECK ("number_entity_attributes"."name" = btrim("number_entity_attributes"."name")),
	CONSTRAINT "number_entity_attrs_desc_trimmed_check" CHECK ("number_entity_attributes"."description" = btrim("number_entity_attributes"."description"))
);
--> statement-breakpoint
CREATE INDEX "number_entity_attrs_value_idx" ON "number_entity_attributes" USING btree ("value");--> statement-breakpoint
CREATE TABLE "boolean_entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" boolean NOT NULL,
	CONSTRAINT "boolean_entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "boolean_entity_attrs_listing_idx_check" CHECK ("boolean_entity_attributes"."listing_index" >= 0),
	CONSTRAINT "boolean_entity_attrs_name_trimmed_check" CHECK ("boolean_entity_attributes"."name" = btrim("boolean_entity_attributes"."name")),
	CONSTRAINT "boolean_entity_attrs_desc_trimmed_check" CHECK ("boolean_entity_attributes"."description" = btrim("boolean_entity_attributes"."description"))
);
--> statement-breakpoint
CREATE INDEX "boolean_entity_attrs_value_idx" ON "boolean_entity_attributes" USING btree ("value");--> statement-breakpoint
CREATE TABLE "date_entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" date,
	CONSTRAINT "date_entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "date_entity_attrs_listing_idx_check" CHECK ("date_entity_attributes"."listing_index" >= 0),
	CONSTRAINT "date_entity_attrs_name_trimmed_check" CHECK ("date_entity_attributes"."name" = btrim("date_entity_attributes"."name")),
	CONSTRAINT "date_entity_attrs_desc_trimmed_check" CHECK ("date_entity_attributes"."description" = btrim("date_entity_attributes"."description"))
);
--> statement-breakpoint
CREATE INDEX "date_entity_attrs_value_idx" ON "date_entity_attributes" USING btree ("value");--> statement-breakpoint
CREATE TABLE "datetime_entity_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"access_level_id" integer NOT NULL,
	"listing_index" integer NOT NULL,
	"value" timestamp,
	CONSTRAINT "datetime_entity_attrs_entity_id_listing_idx_unique" UNIQUE("entity_id","listing_index"),
	CONSTRAINT "datetime_entity_attrs_listing_idx_check" CHECK ("datetime_entity_attributes"."listing_index" >= 0),
	CONSTRAINT "datetime_entity_attrs_name_trimmed_check" CHECK ("datetime_entity_attributes"."name" = btrim("datetime_entity_attributes"."name")),
	CONSTRAINT "datetime_entity_attrs_desc_trimmed_check" CHECK ("datetime_entity_attributes"."description" = btrim("datetime_entity_attributes"."description"))
);
--> statement-breakpoint
CREATE INDEX "datetime_entity_attrs_value_idx" ON "datetime_entity_attributes" USING btree ("value");--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity_id" uuid NOT NULL,
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
ALTER TABLE "text_entity_attributes" ADD CONSTRAINT "text_entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_entity_attributes" ADD CONSTRAINT "text_entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_entity_attributes" ADD CONSTRAINT "number_entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_entity_attributes" ADD CONSTRAINT "number_entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boolean_entity_attributes" ADD CONSTRAINT "boolean_entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boolean_entity_attributes" ADD CONSTRAINT "boolean_entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_entity_attributes" ADD CONSTRAINT "date_entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_entity_attributes" ADD CONSTRAINT "date_entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datetime_entity_attributes" ADD CONSTRAINT "datetime_entity_attrs_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datetime_entity_attributes" ADD CONSTRAINT "datetime_entity_attrs_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_target_entity_id_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
