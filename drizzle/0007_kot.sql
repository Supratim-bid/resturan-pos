ALTER TABLE "orders" ADD COLUMN "kot_no" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "kot_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "kot_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "kot_updated" boolean DEFAULT false NOT NULL;