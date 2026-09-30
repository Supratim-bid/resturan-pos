CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"max_users" integer DEFAULT 0 NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'starter';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "features_removed" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "max_users" integer;--> statement-breakpoint
INSERT INTO "plans" ("key","name","description","price","max_users","features","sort_order") VALUES
 ('starter','Starter','Billing, customers, menu and expenses for a small kitchen',499,2,'{preorders,reminders}',1),
 ('growth','Growth','Adds online ordering, KOT, recipes & stock, staff and reports',999,5,'{preorders,reminders,onlineOrders,kot,recipes,stock,packaging,vendors,staff,reports}',2),
 ('pro','Pro','Everything: Cash & Bank, payment gateways, Swiggy/Zomato payouts',1999,15,'{preorders,reminders,onlineOrders,kot,recipes,stock,packaging,vendors,staff,reports,money,settlements,paymentGateways,aggregators,deliveryPartners}',3)
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "tenants" SET "plan" = 'pro' WHERE "plan" NOT IN (SELECT "key" FROM "plans");
