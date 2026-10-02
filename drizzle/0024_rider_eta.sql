ALTER TABLE "online_orders" ADD COLUMN "dest_lat" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "dest_lng" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rider_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dest_lat" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dest_lng" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_min" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;