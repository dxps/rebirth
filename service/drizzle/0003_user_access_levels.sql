CREATE TABLE "user_access_levels" (
	"user_id" uuid NOT NULL,
	"access_level_id" integer NOT NULL,
	CONSTRAINT "user_access_levels_user_id_access_level_id_pk" PRIMARY KEY("user_id","access_level_id")
);
--> statement-breakpoint
ALTER TABLE "user_access_levels" ADD CONSTRAINT "user_access_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_access_levels" ADD CONSTRAINT "user_access_levels_access_level_id_access_levels_id_fk" FOREIGN KEY ("access_level_id") REFERENCES "public"."access_levels"("id") ON DELETE cascade ON UPDATE no action;
