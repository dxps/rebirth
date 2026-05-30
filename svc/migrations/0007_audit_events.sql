CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
