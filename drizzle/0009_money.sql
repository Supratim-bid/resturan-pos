CREATE TABLE "money_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"account" text NOT NULL,
	"to_account" text DEFAULT '' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_entries_tenant_date" ON "money_entries" USING btree ("tenant_id","date");