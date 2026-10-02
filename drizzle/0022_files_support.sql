CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"kind" text DEFAULT 'DOC' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"filename" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"data" "bytea" NOT NULL,
	"doc_number" text DEFAULT '' NOT NULL,
	"expiry" date,
	"uploaded_by_id" integer,
	"by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"from_user_id" integer,
	"from_name" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"replied_by_email" text DEFAULT '' NOT NULL,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_tenant" ON "files" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "files_kind" ON "files" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "support_tenant" ON "support_messages" USING btree ("tenant_id");