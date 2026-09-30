// Creating a restaurant (tenant): defaults, owner login, optional sample data.
// Used by the super admin portal and by the seed script (so: no "server-only" here).
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { RESERVED_PATHS } from "@/lib/reserved";

type DB = PostgresJsDatabase<typeof schema>;

export const DEFAULT_LISTS: Record<string, string[]> = {
  ORDER_TYPE: ["Dine-in", "Takeaway", "Delivery", "Society Order", "Swiggy", "Zomato", "Catering"],
  PAYMENT_MODE: ["Cash", "UPI", "Card", "Swiggy/Zomato Payout", "Credit"],
  EXPENSE_CATEGORY: ["Vegetables", "Fish & Meat", "Grocery & Spices", "Dairy", "Gas / Fuel", "Packaging", "Staff Salary", "Salary Advance", "Rent", "Electricity & Water", "Delivery Charges", "Marketing", "Equipment & Repairs", "Other"],
  STAFF_ROLE: ["Head Chef", "Cook", "Kitchen Helper", "Delivery", "Cashier", "Manager", "Waiter", "Cleaner"],
  INGREDIENT_CATEGORY: ["Vegetables", "Meat & Chicken", "Fish", "Spices & Masala", "Oil & Ghee", "Dairy", "Grocery", "Other"],
  PACKAGING_TYPE: ["Container", "Lid", "Wrap", "Bag", "Cutlery", "Label", "Other"],
  PLATFORM: ["Swiggy", "Zomato"],
  MEAL_SLOT: ["Breakfast", "Lunch", "Evening Snacks", "Dinner"],
};
export const DEFAULT_CATEGORIES = ["Starters", "Main Course", "Rice & Bread", "Thali", "Sweets", "Beverages"];

export const CODE_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export type NewTenant = {
  name: string; code: string; ownerName: string; ownerUsername: string; ownerPassword: string; ownerPhone?: string;
  contactEmail?: string; contactPhone?: string; plan?: string; notes?: string; billPrefix?: string;
  categories?: string[];
};

export async function provisionTenant(db: DB, t: NewTenant) {
  const code = t.code.trim().toLowerCase(), username = t.ownerUsername.trim().toLowerCase();
  if (!t.name.trim()) throw new Error("Enter the restaurant name.");
  if (!CODE_RE.test(code)) throw new Error("Restaurant code: 2-31 lowercase letters, numbers or dashes (e.g. alooposto).");
  if (RESERVED_PATHS.includes(code)) throw new Error(`"${code}" is used by the app itself - pick another restaurant code.`);
  if (!t.ownerName.trim()) throw new Error("Enter the owner's name.");
  if (!USERNAME_RE.test(username)) throw new Error("Owner username: 3-30 letters/numbers, no spaces.");
  if ((t.ownerPassword ?? "").length < 6) throw new Error("Owner password must be at least 6 characters.");
  const exists = await db.query.tenants.findFirst({ where: eq(schema.tenants.code, code) });
  if (exists) throw new Error(`The code "${code}" is already taken.`);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.tenants).values({
      name: t.name.trim(), code, contactName: t.ownerName.trim(), contactEmail: t.contactEmail?.trim() ?? "",
      contactPhone: t.contactPhone?.trim() ?? "", plan: t.plan?.trim() || "starter", notes: t.notes ?? "",
    }).returning();
    const tenantId = row.id;
    await tx.insert(schema.settings).values({
      tenantId, name: t.name.trim(), phone: t.contactPhone?.trim() ?? "", email: t.contactEmail?.trim() ?? "",
      billPrefix: t.billPrefix?.trim() || code.slice(0, 3).toUpperCase() + "-",
    });
    await tx.insert(schema.users).values({
      tenantId, name: t.ownerName.trim(), username, phone: t.ownerPhone?.trim() ?? "", passwordHash: await bcrypt.hash(t.ownerPassword, 10), role: "OWNER",
    });
    for (const [kind, vals] of Object.entries(DEFAULT_LISTS))
      await tx.insert(schema.lookups).values(vals.map((value, i) => ({ tenantId, kind, value, sortOrder: i })));
    const cats = t.categories?.length ? t.categories : DEFAULT_CATEGORIES;
    await tx.insert(schema.categories).values(cats.map((name, i) => ({ tenantId, name, sortOrder: i })));
    return row;
  });
}

/** Bengali-kitchen sample menu, ingredients, packaging, recipes, customers (for demos) */
export async function addSampleData(db: DB, tenantId: number) {
  const want = ["Veg Main", "Non-Veg Main", "Fish", "Dal", "Fry / Bhaja", "Rice & Bread", "Thali", "Sweets"];
  const have = new Set((await db.query.categories.findMany({ where: eq(schema.categories.tenantId, tenantId) })).map((c) => c.name));
  const add = want.filter((c) => !have.has(c));
  if (add.length) await db.insert(schema.categories).values(add.map((name, i) => ({ tenantId, name, sortOrder: 10 + i })));
  const cats = new Map((await db.query.categories.findMany({ where: eq(schema.categories.tenantId, tenantId) })).map((c) => [c.name, c.id]));
  const menu: [string, string, string, number, number][] = [
    ["Aloo Posto", "Veg Main", "Veg", 180, 60], ["Shukto", "Veg Main", "Veg", 160, 55], ["Mochar Ghonto", "Veg Main", "Veg", 180, 65],
    ["Dhokar Dalna", "Veg Main", "Veg", 180, 60], ["Cholar Dal", "Dal", "Veg", 140, 40], ["Begun Bhaja (2 pc)", "Fry / Bhaja", "Veg", 60, 20],
    ["Kosha Mangsho", "Non-Veg Main", "Non-Veg", 380, 170], ["Chicken Kosha", "Non-Veg Main", "Non-Veg", 280, 110],
    ["Chingri Malai Curry", "Fish", "Non-Veg", 420, 190], ["Shorshe Ilish", "Fish", "Non-Veg", 450, 220], ["Doi Katla", "Fish", "Non-Veg", 320, 130],
    ["Fish Fry", "Fry / Bhaja", "Non-Veg", 150, 60], ["Luchi (4 pc)", "Rice & Bread", "Veg", 80, 20], ["Steamed Rice", "Rice & Bread", "Veg", 60, 15],
    ["Basanti Pulao", "Rice & Bread", "Veg", 160, 50], ["Veg Thali", "Thali", "Veg", 250, 95], ["Fish Thali", "Thali", "Non-Veg", 350, 150],
    ["Mishti Doi", "Sweets", "Veg", 60, 20], ["Rosogolla (2 pc)", "Sweets", "Veg", 50, 15],
  ];
  await db.insert(schema.menuItems).values(menu.map(([name, c, vegType, price, manualCost], i) => ({
    tenantId, code: `M${String(i + 1).padStart(3, "0")}`, name, categoryId: cats.get(c)!, vegType, price, manualCost,
  }))).onConflictDoNothing();

  const ings: [string, string, string, number, number, number | null][] = [
    ["Chicken", "Meat & Chicken", "kg", 240, 0, null], ["Mutton", "Meat & Chicken", "kg", 800, 5, null],
    ["Onion", "Vegetables", "kg", 40, 10, 5], ["Potato", "Vegetables", "kg", 25, 10, 5], ["Tomato", "Vegetables", "kg", 40, 5, 2],
    ["Ginger", "Vegetables", "kg", 120, 15, 0.5], ["Garlic", "Vegetables", "kg", 160, 15, 0.5], ["Green Chilli", "Vegetables", "kg", 80, 5, 0.25],
    ["Mustard Oil", "Oil & Ghee", "litre", 180, 0, 3], ["Refined Oil", "Oil & Ghee", "litre", 150, 0, 3], ["Ghee", "Oil & Ghee", "kg", 650, 0, 0.5],
    ["Dahi (Curd)", "Dairy", "kg", 80, 0, 1], ["Turmeric Powder", "Spices & Masala", "kg", 300, 0, 0.2], ["Red Chilli Powder", "Spices & Masala", "kg", 400, 0, 0.2],
    ["Cumin Powder", "Spices & Masala", "kg", 500, 0, 0.2], ["Coriander Powder", "Spices & Masala", "kg", 250, 0, 0.2], ["Garam Masala", "Spices & Masala", "kg", 800, 0, 0.1],
    ["Bay Leaf", "Spices & Masala", "kg", 300, 0, null], ["Posto (Poppy Seeds)", "Spices & Masala", "kg", 1800, 0, 0.5], ["Kalonji (Nigella)", "Spices & Masala", "kg", 400, 0, null],
    ["Salt", "Grocery", "kg", 25, 0, 1], ["Sugar", "Grocery", "kg", 45, 0, 1], ["Gobindobhog Rice", "Grocery", "kg", 120, 0, 5], ["Basmati Rice", "Grocery", "kg", 110, 0, 5],
    ["Chana Dal", "Grocery", "kg", 110, 0, 2], ["Maida", "Grocery", "kg", 40, 0, 2],
  ];
  await db.insert(schema.ingredients).values(ings.map(([name, category, unit, price, wastagePct, reorderLevel]) => ({ tenantId, name, category, unit, price, wastagePct, reorderLevel }))).onConflictDoNothing();

  const packs: [string, string, number, number, string][] = [
    ["250 ml round container + lid", "Container", 300, 50, "Dal, sabzi, dahi"], ["500 ml round container + lid", "Container", 400, 50, "Curries"],
    ["750 ml round container + lid", "Container", 500, 50, "Rice"], ["3-compartment thali tray", "Container", 750, 50, "Thali"],
    ["Dahi / sweet cup 100 ml", "Container", 150, 50, "Mishti doi"], ["Paper carry bag", "Bag", 200, 50, "One per order"],
    ["Spoon (wooden)", "Cutlery", 100, 100, ""], ["Tissue", "Cutlery", 50, 100, ""], ["Brand sticker", "Label", 200, 500, ""],
  ];
  await db.insert(schema.packaging).values(packs.map(([name, type, packPrice, piecesPerPack, notes]) => ({ tenantId, name, type, packPrice, piecesPerPack, notes }))).onConflictDoNothing();

  const item = new Map((await db.query.menuItems.findMany({ where: eq(schema.menuItems.tenantId, tenantId) })).map((m) => [m.name, m.id]));
  const ing = new Map((await db.query.ingredients.findMany({ where: eq(schema.ingredients.tenantId, tenantId) })).map((m) => [m.name, m.id]));
  const pk = new Map((await db.query.packaging.findMany({ where: eq(schema.packaging.tenantId, tenantId) })).map((m) => [m.name, m.id]));

  async function recipe(dish: string, plates: number, portion: string, gas: number, misc: number, lines: [string, number, string][], packsL: [string, number][], comps: [string, number][], method: string) {
    const [r] = await db.insert(schema.recipes).values({ tenantId, menuItemId: item.get(dish)!, platesPerBatch: plates, portion, gasCost: gas, miscPct: misc, method }).onConflictDoNothing().returning();
    if (!r) return;
    if (lines.length) await db.insert(schema.recipeIngredients).values(lines.map(([n, qty, unit]) => ({ recipeId: r.id, ingredientId: ing.get(n)!, qty, unit })));
    if (packsL.length) await db.insert(schema.recipePackaging).values(packsL.map(([n, q]) => ({ recipeId: r.id, packagingId: pk.get(n)!, qtyPerPlate: q })));
    if (comps.length) await db.insert(schema.recipeComponents).values(comps.map(([n, q]) => ({ recipeId: r.id, menuItemId: item.get(n)!, qtyPerPlate: q })));
  }
  await recipe("Chicken Kosha", 8, "approx. 250 g / 4 pcs", 25, 3, [
    ["Chicken", 1, "kg"], ["Onion", 700, "g"], ["Ginger", 50, "g"], ["Garlic", 50, "g"], ["Tomato", 200, "g"], ["Dahi (Curd)", 150, "g"],
    ["Mustard Oil", 150, "ml"], ["Green Chilli", 20, "g"], ["Turmeric Powder", 10, "g"], ["Red Chilli Powder", 15, "g"], ["Cumin Powder", 10, "g"],
    ["Coriander Powder", 10, "g"], ["Garam Masala", 8, "g"], ["Bay Leaf", 3, "g"], ["Sugar", 10, "g"], ["Salt", 20, "g"],
  ], [["500 ml round container + lid", 1], ["Spoon (wooden)", 1], ["Tissue", 1], ["Brand sticker", 1]], [],
  "SAMPLE - replace with your own.\n1. Marinate chicken with dahi, turmeric, salt (30 min).\n2. Heat mustard oil, bay leaf, sugar; fry onion till golden.\n3. Add ginger-garlic paste, tomato and dry masalas; bhuno till oil separates.\n4. Add chicken, cook covered on low flame; finish with garam masala.");
  await recipe("Aloo Posto", 6, "approx. 200 g", 15, 0, [
    ["Potato", 1, "kg"], ["Posto (Poppy Seeds)", 100, "g"], ["Mustard Oil", 60, "ml"], ["Green Chilli", 20, "g"], ["Kalonji (Nigella)", 3, "g"], ["Salt", 10, "g"],
  ], [["250 ml round container + lid", 1], ["Spoon (wooden)", 1]], [], "SAMPLE - replace.\n1. Grind soaked posto with green chilli.\n2. Temper oil with kalonji, cook potatoes covered.\n3. Add posto paste and salt; cook till dry.");
  await recipe("Steamed Rice", 10, "approx. 200 g", 10, 0, [["Gobindobhog Rice", 1, "kg"], ["Salt", 5, "g"]], [["750 ml round container + lid", 1]], [], "");
  await recipe("Cholar Dal", 10, "1 katori", 15, 5, [["Chana Dal", 500, "g"], ["Ghee", 30, "g"], ["Sugar", 20, "g"], ["Salt", 15, "g"], ["Turmeric Powder", 5, "g"]], [["250 ml round container + lid", 1]], [], "SAMPLE");
  await recipe("Veg Thali", 1, "Rice + dal + aloo posto + mishti doi", 0, 0, [], [["3-compartment thali tray", 1], ["Spoon (wooden)", 1], ["Tissue", 1]],
    [["Steamed Rice", 1], ["Cholar Dal", 1], ["Aloo Posto", 0.5]], "Thali is costed from its component dishes.");

  await db.insert(schema.customers).values([
    { tenantId, name: "Walk-in Customer", notes: "Use for counter / unknown customers" },
    { tenantId, name: "Riya Sen (B-1204)", phone: "98XXXXXX10", flat: "Tower B, 1204", area: "Your Society, Sector XX", notes: "Less spicy" },
    { tenantId, name: "Arjun Das (C-503)", phone: "99XXXXXX22", flat: "Tower C, 503", area: "Your Society, Sector XX" },
  ]);
  await db.insert(schema.reminders).values([
    { tenantId, title: "FSSAI licence renewal", dueDate: "2027-03-31", repeat: "YEARLY" },
    { tenantId, title: "Pay rent", dueDate: "2026-10-05", repeat: "MONTHLY" },
  ]);
}
