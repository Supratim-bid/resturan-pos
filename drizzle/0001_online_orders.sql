CREATE TABLE "online_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'NEW' NOT NULL,
	"customer_id" integer,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"is_preorder" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"meal_slot" text DEFAULT '' NOT NULL,
	"slot_time" text DEFAULT '' NOT NULL,
	"items" text NOT NULL,
	"est_total" numeric(12, 2) NOT NULL,
	"pay_method" text NOT NULL,
	"upi_ref" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"reject_reason" text DEFAULT '' NOT NULL,
	"order_id" integer,
	"decided_by_id" integer,
	"decided_at" timestamp,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "online_orders_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_closed_msg" text DEFAULT 'We are not taking online orders right now. Please try again later.' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_delivery" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_takeaway" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_preorder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_min_order" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_delivery_type" text DEFAULT 'Delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "online_takeaway_type" text DEFAULT 'Takeaway' NOT NULL;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "online_orders_tenant_status" ON "online_orders" USING btree ("tenant_id","status","created_at");