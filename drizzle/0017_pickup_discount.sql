ALTER TABLE "online_orders" ADD COLUMN "discount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pickup_discount_on" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pickup_discount_pct" numeric(12, 2) DEFAULT 0 NOT NULL;