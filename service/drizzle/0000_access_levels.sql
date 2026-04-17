CREATE TABLE "access_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "access_levels_name_unique" UNIQUE("name")
);
