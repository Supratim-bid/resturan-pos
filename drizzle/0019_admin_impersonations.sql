CREATE TABLE "admin_impersonations" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_email" text NOT NULL,
	"tenant_id" integer,
	"tenant_name" text DEFAULT '' NOT NULL,
	"tenant_code" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
