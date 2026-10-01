ALTER TABLE "online_orders" ADD COLUMN "pay_link_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "pay_link_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "pay_link_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "pay_link_provider" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "paid_online" numeric(12, 2) DEFAULT 0 NOT NULL;