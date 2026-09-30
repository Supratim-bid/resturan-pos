ALTER TABLE "online_orders" DROP COLUMN "verify_code";--> statement-breakpoint
ALTER TABLE "online_orders" DROP COLUMN "wa_confirmed";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "online_wa_confirm";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN "online_new_upi_only";