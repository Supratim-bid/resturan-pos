ALTER TABLE "customers" ADD COLUMN "online_blocked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "verify_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "wa_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD COLUMN "device" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_wa_confirm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_new_upi_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_new_max" numeric(12, 2) DEFAULT 0 NOT NULL;