ALTER TABLE "expenses" ADD COLUMN "paid_from" text DEFAULT 'Company' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_by_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "created_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "created_by_id" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivered_by_id_users_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;