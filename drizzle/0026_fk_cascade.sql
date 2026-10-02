ALTER TABLE "expenses" DROP CONSTRAINT "expenses_ingredient_id_ingredients_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menu_item_id_menu_items_id_fk";
--> statement-breakpoint
ALTER TABLE "order_packaging" DROP CONSTRAINT "order_packaging_packaging_id_packaging_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_components" DROP CONSTRAINT "recipe_components_menu_item_id_menu_items_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk";
--> statement-breakpoint
ALTER TABLE "recipe_packaging" DROP CONSTRAINT "recipe_packaging_packaging_id_packaging_id_fk";
--> statement-breakpoint
ALTER TABLE "wastage" DROP CONSTRAINT "wastage_menu_item_id_menu_items_id_fk";
--> statement-breakpoint
ALTER TABLE "wastage" DROP CONSTRAINT "wastage_ingredient_id_ingredients_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_packaging" ADD CONSTRAINT "order_packaging_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_packaging" ADD CONSTRAINT "recipe_packaging_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wastage" ADD CONSTRAINT "wastage_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;