ALTER TABLE "orders" ADD COLUMN "pay_link_provider" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pay_gateway" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instamojo_client_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instamojo_client_secret" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instamojo_salt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "instamojo_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cashfree_app_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cashfree_secret" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cashfree_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "settings" SET "pay_gateway" = 'razorpay' WHERE "razorpay_key_id" <> '' AND "pay_gateway" = '';--> statement-breakpoint
UPDATE "orders" SET "pay_link_provider" = 'razorpay' WHERE "pay_link_id" <> '' AND "pay_link_provider" = '';
