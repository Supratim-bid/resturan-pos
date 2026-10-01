// Field definitions shared by forms (client) and validation (server)
import type { ModuleKey } from "./permissions";
import { STOCK_UNITS } from "./units";

export type FieldType = "text" | "textarea" | "number" | "money" | "date" | "select" | "checkbox" | "tel" | "image";
export type OptionSource =
  | { lookup: string }          // editable list in Settings
  | { entity: "vendors" | "categories" | "menuItems" | "ingredients" | "staff" | "customers" }
  | { people: true }            // owners + staff names (value = the name, for "paid by")
  | { values: string[] };

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  source?: OptionSource;
  numericValue?: boolean; // select whose value is an id
  help?: string;
  defaultToday?: boolean;
  step?: string;
  half?: boolean; // half width on desktop
};

export type EntityKey =
  | "customers" | "categories" | "menuItems" | "ingredients" | "packaging" | "vendors" | "vendorPayments"
  | "staff" | "reminders" | "settlements" | "expenses" | "wastage" | "dailyMenus" | "lookups";

export const ENTITIES: Record<EntityKey, { perm: ModuleKey; label: string; fields: FieldDef[] }> = {
  customers: {
    perm: "customers", label: "Customer",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, help: "Keep unique, e.g. Priya Sharma (B-1204)" },
      { name: "phone", label: "Phone", type: "tel", half: true },
      { name: "email", label: "Email", type: "text", half: true },
      { name: "flat", label: "Flat / House", type: "text", half: true },
      { name: "area", label: "Society / Area", type: "text", half: true },
      { name: "birthday", label: "Birthday", type: "date", half: true },
      { name: "notes", label: "Preferences / Notes", type: "textarea" },
    ],
  },
  categories: {
    perm: "menu", label: "Category",
    fields: [
      { name: "name", label: "Category name", type: "text", required: true },
      { name: "sortOrder", label: "Display order", type: "number", help: "Smaller shows first" },
    ],
  },
  menuItems: {
    perm: "menu", label: "Dish",
    fields: [
      { name: "imageId", label: "Photo", type: "image", numericValue: true },
      { name: "name", label: "Dish name", type: "text", required: true },
      { name: "categoryId", label: "Category", type: "select", required: true, source: { entity: "categories" }, numericValue: true, half: true },
      { name: "vegType", label: "Veg / Non-Veg", type: "select", source: { values: ["Veg", "Non-Veg", "Egg"] }, half: true },
      { name: "price", label: "Selling price (₹)", type: "money", required: true, half: true },
      { name: "manualCost", label: "Est. cost / plate (₹)", type: "money", half: true, help: "Used only until you make a recipe" },
      { name: "code", label: "Item code", type: "text", half: true },
      { name: "available", label: "Available now (can be ordered)", type: "checkbox", half: true },
      { name: "active", label: "On the menu (untick to hide)", type: "checkbox", half: true },
    ],
  },
  ingredients: {
    perm: "ingredients", label: "Ingredient",
    fields: [
      { name: "name", label: "Ingredient", type: "text", required: true },
      { name: "category", label: "Category", type: "select", source: { lookup: "INGREDIENT_CATEGORY" }, half: true },
      { name: "unit", label: "Buying / stock unit", type: "select", required: true, source: { values: STOCK_UNITS }, half: true },
      { name: "price", label: "Price per unit (₹)", type: "money", required: true, half: true },
      { name: "wastagePct", label: "Wastage %", type: "number", half: true, help: "Weight lost in cleaning/peeling" },
      { name: "reorderLevel", label: "Reorder level", type: "number", half: true, help: "Alert when stock falls to this" },
      { name: "trackStock", label: "Track stock", type: "checkbox", half: true },
    ],
  },
  packaging: {
    perm: "packaging", label: "Packaging",
    fields: [
      { name: "imageId", label: "Photo (shown on the order screen)", type: "image", numericValue: true },
      { name: "name", label: "Packaging item", type: "text", required: true },
      { name: "type", label: "Type", type: "select", source: { lookup: "PACKAGING_TYPE" }, half: true },
      { name: "packPrice", label: "Pack price (₹)", type: "money", required: true, half: true },
      { name: "piecesPerPack", label: "Pieces per pack", type: "number", required: true, half: true },
      { name: "reorderLevel", label: "Low-stock alert at (pieces)", type: "number", half: true, help: "Dashboard warns when stock falls to this" },
      { name: "barcode", label: "Barcode (optional)", type: "text", half: true, help: "For a barcode scanner. Scan the pack's barcode here or type any code you print" },
      { name: "billPrice", label: "Price if charged to customer (₹ / piece)", type: "money", half: true, help: "Only used on orders where you tick “Add packaging to the customer's bill”. Blank = your cost" },
      { name: "notes", label: "Used for / notes", type: "text" },
    ],
  },
  vendors: {
    perm: "vendors", label: "Vendor",
    fields: [
      { name: "name", label: "Vendor name", type: "text", required: true },
      { name: "phone", label: "Phone", type: "tel", half: true },
      { name: "supplies", label: "Supplies", type: "text", half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  vendorPayments: {
    perm: "vendors", label: "Vendor payment",
    fields: [
      { name: "vendorId", label: "Vendor", type: "select", required: true, source: { entity: "vendors" }, numericValue: true },
      { name: "date", label: "Date", type: "date", required: true, defaultToday: true, half: true },
      { name: "amount", label: "Amount (₹)", type: "money", required: true, half: true },
      { name: "mode", label: "Paid by", type: "select", required: true, source: { lookup: "PAYMENT_MODE" }, half: true },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  staff: {
    perm: "staff", label: "Staff member",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "role", label: "Role", type: "select", required: true, source: { lookup: "STAFF_ROLE" }, half: true },
      { name: "phone", label: "Phone", type: "tel", half: true },
      { name: "joiningDate", label: "Joining date", type: "date", half: true },
      { name: "monthlySalary", label: "Monthly salary (₹)", type: "money", half: true },
      { name: "active", label: "Active", type: "checkbox", half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  reminders: {
    perm: "reminders", label: "Reminder",
    fields: [
      { name: "title", label: "What", type: "text", required: true, help: "e.g. FSSAI licence renewal, GST return, Rent" },
      { name: "dueDate", label: "Due date", type: "date", required: true, half: true },
      { name: "repeat", label: "Repeats", type: "select", source: { values: ["NONE", "MONTHLY", "YEARLY"] }, half: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  settlements: {
    perm: "settlements", label: "Payout",
    fields: [
      { name: "platform", label: "Platform (order type)", type: "select", required: true, source: { lookup: "PLATFORM" } },
      { name: "fromDate", label: "Orders from", type: "date", required: true, half: true },
      { name: "toDate", label: "Orders to", type: "date", required: true, half: true },
      { name: "payoutDate", label: "Payout received on", type: "date", required: true, defaultToday: true, half: true },
      { name: "payout", label: "Amount received (₹)", type: "money", required: true, half: true },
      { name: "notes", label: "Notes / UTR", type: "text" },
    ],
  },
  expenses: {
    perm: "expenses", label: "Expense",
    fields: [
      { name: "date", label: "Date", type: "date", required: true, defaultToday: true, half: true },
      { name: "category", label: "Category", type: "select", required: true, source: { lookup: "EXPENSE_CATEGORY" }, half: true },
      { name: "description", label: "Description", type: "text" },
      { name: "amount", label: "Amount (₹)", type: "money", required: true, half: true },
      { name: "paymentMode", label: "How paid", type: "select", required: true, source: { lookup: "PAYMENT_MODE" }, half: true, help: "'Credit' = not paid yet (vendor due)" },
      { name: "paidFrom", label: "Whose money", type: "select", required: true, source: { values: ["Company", "Owner", "Staff"] }, half: true, help: "Owner / Staff = paid from their own pocket (to be reimbursed)" },
      { name: "paidByName", label: "Owner / staff name", type: "select", source: { people: true }, half: true, help: "Who paid, if not from company money - so you know whom to repay (add people in Staff & Attendance)" },
      { name: "ingredientId", label: "Stock item (optional)", type: "select", source: { entity: "ingredients" }, numericValue: true, half: true, help: "Adds to stock" },
      { name: "qty", label: "Qty (in item's unit)", type: "number", half: true },
      { name: "vendorId", label: "Vendor", type: "select", source: { entity: "vendors" }, numericValue: true, half: true },
      { name: "staffId", label: "Staff (salary/advance)", type: "select", source: { entity: "staff" }, numericValue: true, half: true },
      { name: "notes", label: "Notes", type: "text" },
    ],
  },
  wastage: {
    perm: "wastage", label: "Wastage",
    fields: [
      { name: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { name: "menuItemId", label: "Cooked dish wasted / left over", type: "select", source: { entity: "menuItems" }, numericValue: true, half: true },
      { name: "plates", label: "Plates", type: "number", half: true },
      { name: "ingredientId", label: "Or raw ingredient wasted", type: "select", source: { entity: "ingredients" }, numericValue: true, half: true },
      { name: "qty", label: "Qty (in its unit)", type: "number", half: true },
      { name: "reason", label: "Reason", type: "text", help: "e.g. unsold, spoiled, burnt" },
    ],
  },
  dailyMenus: {
    perm: "dailyMenu", label: "Menu plan",
    fields: [
      { name: "date", label: "Date", type: "date", required: true, defaultToday: true, half: true },
      { name: "menuItemId", label: "Dish", type: "select", required: true, source: { entity: "menuItems" }, numericValue: true, half: true },
      { name: "plannedPlates", label: "Planned plates", type: "number", required: true, half: true },
      { name: "notes", label: "Notes", type: "text", half: true },
    ],
  },
  lookups: {
    perm: "settings", label: "List value",
    fields: [
      { name: "kind", label: "List", type: "select", required: true, source: { values: ["ORDER_TYPE", "PAYMENT_MODE", "EXPENSE_CATEGORY", "STAFF_ROLE", "INGREDIENT_CATEGORY", "PACKAGING_TYPE", "PLATFORM", "MEAL_SLOT"] } },
      { name: "value", label: "Value", type: "text", required: true },
      { name: "sortOrder", label: "Order", type: "number" },
    ],
  },
};

export type Option = { value: string; label: string; group?: string };
