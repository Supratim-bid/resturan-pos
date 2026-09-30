CREATE TYPE "public"."role" AS ENUM('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN');--> statement-breakpoint
CREATE TABLE "admin_otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_closings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"opening_cash" numeric(12, 2) NOT NULL,
	"cash_in" numeric(12, 2) NOT NULL,
	"cash_out" numeric(12, 2) NOT NULL,
	"expected" numeric(12, 2) NOT NULL,
	"actual" numeric(12, 2) NOT NULL,
	"difference" numeric(12, 2) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"closed_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"flat" text DEFAULT '' NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"birthday" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"menu_item_id" integer NOT NULL,
	"planned_plates" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ingredient_id" integer,
	"qty" numeric(14, 4),
	"vendor_id" integer,
	"staff_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"payment_mode" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Other' NOT NULL,
	"unit" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"wastage_pct" numeric(6, 2) DEFAULT 0 NOT NULL,
	"reorder_level" numeric(14, 4),
	"track_stock" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"fails" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"veg_type" text DEFAULT 'Veg' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"manual_cost" numeric(12, 2),
	"image_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"name" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_packaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"packaging_id" integer NOT NULL,
	"name" text NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_no" integer NOT NULL,
	"fy" text DEFAULT '' NOT NULL,
	"bill_no" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"customer_id" integer,
	"order_type" text NOT NULL,
	"table_no" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"cancel_status" text DEFAULT '' NOT NULL,
	"cancel_reason" text DEFAULT '' NOT NULL,
	"cancel_requested_by_id" integer,
	"cancel_requested_at" timestamp,
	"cancel_decided_by_id" integer,
	"cancel_decided_at" timestamp,
	"cancel_note" text DEFAULT '' NOT NULL,
	"cancel_money" text DEFAULT '' NOT NULL,
	"items_total" numeric(12, 2) NOT NULL,
	"item_discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"order_discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"delivery_charge" numeric(12, 2) DEFAULT 0 NOT NULL,
	"packing_charge" numeric(12, 2) DEFAULT 0 NOT NULL,
	"taxable" numeric(12, 2) NOT NULL,
	"gst_rate" numeric(6, 2) NOT NULL,
	"gst_amount" numeric(12, 2) NOT NULL,
	"round_off" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"food_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"packaging_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"packaging_charged" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"is_preorder" boolean DEFAULT false NOT NULL,
	"meal_slot" text DEFAULT '' NOT NULL,
	"slot_time" text DEFAULT '' NOT NULL,
	"booked_on" date,
	"fulfil_status" text DEFAULT '' NOT NULL,
	"pay_link_id" text DEFAULT '' NOT NULL,
	"pay_link_short" text DEFAULT '' NOT NULL,
	"pay_link_amount" numeric(12, 2),
	"pay_link_status" text DEFAULT '' NOT NULL,
	"created_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "packaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Container' NOT NULL,
	"pack_price" numeric(12, 2) NOT NULL,
	"pieces_per_pack" integer DEFAULT 1 NOT NULL,
	"bill_price" numeric(12, 2),
	"reorder_level" integer,
	"image_id" integer,
	"barcode" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packaging_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"packaging_id" integer NOT NULL,
	"date" date NOT NULL,
	"qty" integer NOT NULL,
	"type" text NOT NULL,
	"ref_type" text DEFAULT '' NOT NULL,
	"ref_id" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"order_id" integer,
	"customer_id" integer,
	"amount" numeric(12, 2) NOT NULL,
	"mode" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"ref" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"qty_per_plate" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"unit" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_packaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"packaging_id" integer NOT NULL,
	"qty_per_plate" numeric(14, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"menu_item_id" integer NOT NULL,
	"plates_per_batch" numeric(14, 4) DEFAULT 1 NOT NULL,
	"portion" text DEFAULT '' NOT NULL,
	"gas_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"misc_pct" numeric(6, 2) DEFAULT 0 NOT NULL,
	"method" text DEFAULT '' NOT NULL,
	"taste_notes" text DEFAULT '' NOT NULL,
	"made_by" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_menu_item_id_unique" UNIQUE("menu_item_id")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"title" text NOT NULL,
	"due_date" date NOT NULL,
	"repeat" text DEFAULT 'NONE' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"tenant_id" integer PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'My Restaurant' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"fssai" text DEFAULT '' NOT NULL,
	"gst_rate" numeric(6, 2) DEFAULT 5 NOT NULL,
	"upi_id" text DEFAULT '' NOT NULL,
	"bill_footer" text DEFAULT 'Thank you! Please visit again.' NOT NULL,
	"price_multiplier" numeric(6, 2) DEFAULT 3 NOT NULL,
	"platform_commission" numeric(6, 2) DEFAULT 25 NOT NULL,
	"default_delivery_charge" numeric(12, 2) DEFAULT 0 NOT NULL,
	"default_packing_charge" numeric(12, 2) DEFAULT 0 NOT NULL,
	"logo_image_id" integer,
	"qr_image_id" integer,
	"bill_prefix" text DEFAULT 'ORD-' NOT NULL,
	"bill_digits" integer DEFAULT 4 NOT NULL,
	"bill_start" integer DEFAULT 1 NOT NULL,
	"bill_use_fy" boolean DEFAULT false NOT NULL,
	"reuse_cancelled_no" boolean DEFAULT true NOT NULL,
	"primary_color" text DEFAULT '#9a1c1f' NOT NULL,
	"accent_color" text DEFAULT '#c8962e' NOT NULL,
	"receipt_width" text DEFAULT '58' NOT NULL,
	"scanner_enabled" boolean DEFAULT false NOT NULL,
	"bill_show_logo" boolean DEFAULT true NOT NULL,
	"bill_header_note" text DEFAULT '' NOT NULL,
	"bill_show_qr" text DEFAULT 'due' NOT NULL,
	"bill_qr_label" text DEFAULT 'Scan & pay with any UPI app' NOT NULL,
	"bill_social" text DEFAULT '' NOT NULL,
	"bill_terms" text DEFAULT '' NOT NULL,
	"bill_show_cashier" boolean DEFAULT false NOT NULL,
	"pay_link_url" text DEFAULT '' NOT NULL,
	"razorpay_key_id" text DEFAULT '' NOT NULL,
	"razorpay_key_secret" text DEFAULT '' NOT NULL,
	"razorpay_webhook_secret" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"platform" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"payout_date" date NOT NULL,
	"payout" numeric(12, 2) NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"joining_date" date,
	"monthly_salary" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"type" text NOT NULL,
	"ref_type" text,
	"ref_id" integer,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "super_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"contact_phone" text DEFAULT '' NOT NULL,
	"plan" text DEFAULT 'Standard' NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"permissions" text[],
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"vendor_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"mode" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"supplies" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wastage" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"date" date NOT NULL,
	"menu_item_id" integer,
	"plates" numeric(14, 4),
	"ingredient_id" integer,
	"qty" numeric(14, 4),
	"cost" numeric(12, 2) NOT NULL,
	"reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closings" ADD CONSTRAINT "cash_closings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_menus" ADD CONSTRAINT "daily_menus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_menus" ADD CONSTRAINT "daily_menus_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookups" ADD CONSTRAINT "lookups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_packaging" ADD CONSTRAINT "order_packaging_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_packaging" ADD CONSTRAINT "order_packaging_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging" ADD CONSTRAINT "packaging_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_movements" ADD CONSTRAINT "packaging_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_movements" ADD CONSTRAINT "packaging_movements_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_packaging" ADD CONSTRAINT "recipe_packaging_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_packaging" ADD CONSTRAINT "recipe_packaging_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_otps_email" ON "admin_otps" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_staff_date" ON "attendance" USING btree ("staff_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_tenant_date" ON "cash_closings" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_name" ON "categories" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_menu_date_item" ON "daily_menus" USING btree ("date","menu_item_id");--> statement-breakpoint
CREATE INDEX "expenses_tenant_date" ON "expenses" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_tenant_name" ON "ingredients" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "lookup_tenant_kind_value" ON "lookups" USING btree ("tenant_id","kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_tenant_name" ON "menu_items" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "order_items_order" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_packaging_order" ON "order_packaging" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_bill" ON "orders" USING btree ("tenant_id","bill_no");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_fy_no" ON "orders" USING btree ("tenant_id","fy","order_no");--> statement-breakpoint
CREATE INDEX "orders_tenant_date" ON "orders" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "orders_customer" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "packaging_tenant_name" ON "packaging" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "pack_mov_tenant_item" ON "packaging_movements" USING btree ("tenant_id","packaging_id");--> statement-breakpoint
CREATE INDEX "pack_mov_ref" ON "packaging_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "payments_order" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_ref" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "stock_ing" ON "stock_movements" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "stock_tenant" ON "stock_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_username" ON "users" USING btree ("tenant_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_tenant_name" ON "vendors" USING btree ("tenant_id","name");