// Restaurant Manager (multi-restaurant SaaS) - database schema (PostgreSQL, Drizzle ORM)
// Every business table carries tenant_id; all queries filter by the logged-in restaurant.
import {
  pgTable, serial, integer, text, boolean, timestamp, date, numeric, uniqueIndex, index, pgEnum, customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const qtyN = (name: string) => numeric(name, { precision: 14, scale: 4, mode: "number" });
const pct = (name: string) => numeric(name, { precision: 6, scale: 2, mode: "number" });
const day = (name: string) => date(name, { mode: "string" });

// ---------- Platform: restaurants (tenants) & super admins ----------
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(), // login code, e.g. "alooposto"
  active: boolean("active").notNull().default(true),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  plan: text("plan").notNull().default("Standard"),
  features: text("features").array().notNull().default([]), // extra features switched on by the super admin, e.g. "preorders"
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
const tid = () => integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });

export const superAdmins = pgTable("super_admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const adminOtps = pgTable("admin_otps", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("admin_otps_email").on(t.email)]);

// Wrong-password counter for every login form (kept in the database so it survives restarts)
export const loginThrottle = pgTable("login_throttle", {
  key: text("key").primaryKey(),              // e.g. "user:alooposto:owner", "ip:1.2.3.4", "admin:me@x.com"
  fails: integer("fails").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ---------- Images (logo, dish photos) - stored in the database so backups include them ----------
export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Settings & accounts ----------
export const settings = pgTable("settings", {
  tenantId: integer("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My Restaurant"),
  tagline: text("tagline").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  fssai: text("fssai").notNull().default(""),
  gstRate: pct("gst_rate").notNull().default(5),
  upiId: text("upi_id").notNull().default(""),
  billFooter: text("bill_footer").notNull().default("Thank you! Please visit again."),
  priceMultiplier: pct("price_multiplier").notNull().default(3),
  platformCommission: pct("platform_commission").notNull().default(25),
  defaultDeliveryCharge: money("default_delivery_charge").notNull().default(0),
  defaultPackingCharge: money("default_packing_charge").notNull().default(0),
  logoImageId: integer("logo_image_id"),
  qrImageId: integer("qr_image_id"), // uploaded payment QR (shop's UPI QR image) printed on bills
  // bill / order number format, e.g. "AP-" + "25-26/" + "0001"
  billPrefix: text("bill_prefix").notNull().default("ORD-"),
  billDigits: integer("bill_digits").notNull().default(4),
  billStart: integer("bill_start").notNull().default(1),
  billUseFy: boolean("bill_use_fy").notNull().default(false),
  reuseCancelledNo: boolean("reuse_cancelled_no").notNull().default(true), // AP-0002 cancelled -> AP-0002-CAN, next bill gets AP-0002
  // brand colours (whole app + bills)
  primaryColor: text("primary_color").notNull().default("#9a1c1f"),
  accentColor: text("accent_color").notNull().default("#c8962e"),
  receiptWidth: text("receipt_width").notNull().default("58"), // 58 (2 inch) or 80 (3 inch)
  scannerEnabled: boolean("scanner_enabled").notNull().default(false), // Bluetooth / USB barcode scanner on the order screen
  // online ordering by customers (feature "onlineOrders")
  onlineOpen: boolean("online_open").notNull().default(true),              // taking online orders right now
  onlineClosedMsg: text("online_closed_msg").notNull().default("We are not taking online orders right now. Please try again later."),
  onlineNote: text("online_note").notNull().default(""),                    // shown at the top of the order page
  onlineDelivery: boolean("online_delivery").notNull().default(true),
  onlineTakeaway: boolean("online_takeaway").notNull().default(true),
  onlinePreorder: boolean("online_preorder").notNull().default(true),      // needs the Pre-orders feature too
  onlineMinOrder: money("online_min_order").notNull().default(0),
  onlineDeliveryType: text("online_delivery_type").notNull().default("Delivery"), // order type used when accepting
  onlineTakeawayType: text("online_takeaway_type").notNull().default("Takeaway"),
  // stopping fake orders (free - no SMS)
  onlineWaConfirm: boolean("online_wa_confirm").notNull().default(true),   // ask customers to confirm on WhatsApp
  onlineNewUpiOnly: boolean("online_new_upi_only").notNull().default(false), // first order from a new number must be paid by UPI
  onlineNewMax: money("online_new_max").notNull().default(0),                // max first order from a new number (0 = no limit)
  // bill design
  billShowLogo: boolean("bill_show_logo").notNull().default(true),
  billHeaderNote: text("bill_header_note").notNull().default(""),   // e.g. "100% homemade · No MSG"
  billShowQr: text("bill_show_qr").notNull().default("due"),         // due | always | never
  billQrLabel: text("bill_qr_label").notNull().default("Scan & pay with any UPI app"),
  billSocial: text("bill_social").notNull().default(""),            // Instagram / website / WhatsApp line
  billTerms: text("bill_terms").notNull().default(""),              // small print at the bottom
  billShowCashier: boolean("bill_show_cashier").notNull().default(false),
  // online payments
  payLinkUrl: text("pay_link_url").notNull().default(""),           // fixed payment page (razorpay.me, PhonePe/Paytm link...)
  razorpayKeyId: text("razorpay_key_id").notNull().default(""),
  razorpayKeySecret: text("razorpay_key_secret").notNull().default(""),       // stored encrypted
  razorpayWebhookSecret: text("razorpay_webhook_secret").notNull().default(""), // stored encrypted
});

export const roleEnum = pgEnum("role", ["OWNER", "MANAGER", "CASHIER", "KITCHEN"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  username: text("username").notNull(),
  phone: text("phone").notNull().default(""),
  permissions: text("permissions").array(), // tab keys this person may open (null = role default)
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("users_tenant_username").on(t.tenantId, t.username)]);

// Editable dropdown lists
export const lookups = pgTable("lookups", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  kind: text("kind").notNull(), // ORDER_TYPE, PAYMENT_MODE, EXPENSE_CATEGORY, STAFF_ROLE, INGREDIENT_CATEGORY, PACKAGING_TYPE, PLATFORM
  value: text("value").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("lookup_tenant_kind_value").on(t.tenantId, t.kind, t.value)]);

// ---------- Menu ----------
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("categories_tenant_name").on(t.tenantId, t.name)]);

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  code: text("code").notNull().default(""),
  name: text("name").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  vegType: text("veg_type").notNull().default("Veg"),
  price: money("price").notNull(),
  manualCost: money("manual_cost"),
  imageId: integer("image_id"),
  active: boolean("active").notNull().default(true),        // on the menu at all
  available: boolean("available").notNull().default(true),  // can be ordered right now (sold out = false)
}, (t) => [uniqueIndex("menu_items_tenant_name").on(t.tenantId, t.name)]);

export const dailyMenus = pgTable("daily_menus", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  plannedPlates: integer("planned_plates").notNull(),
  notes: text("notes").notNull().default(""),
}, (t) => [uniqueIndex("daily_menu_date_item").on(t.date, t.menuItemId)]);

// ---------- Recipes & costing ----------
export const ingredients = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Other"),
  unit: text("unit").notNull(), // stock unit: kg, litre, pcs, packet, bunch
  price: money("price").notNull(), // per unit
  wastagePct: pct("wastage_pct").notNull().default(0),
  reorderLevel: qtyN("reorder_level"),
  trackStock: boolean("track_stock").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("ingredients_tenant_name").on(t.tenantId, t.name)]);

export const packaging = pgTable("packaging", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  type: text("type").notNull().default("Container"),
  packPrice: money("pack_price").notNull(),
  piecesPerPack: integer("pieces_per_pack").notNull().default(1),
  billPrice: money("bill_price"), // price per piece when an order is set to "charge packaging"; null = same as cost
  reorderLevel: integer("reorder_level"), // alert when pieces in stock fall to this
  imageId: integer("image_id"),          // photo shown on the order screen
  barcode: text("barcode").notNull().default(""), // for a barcode scanner (optional)
  notes: text("notes").notNull().default(""),
}, (t) => [uniqueIndex("packaging_tenant_name").on(t.tenantId, t.name)]);

// Packaging inventory in pieces: + purchase / count correction, - used on orders
export const packagingMovements = pgTable("packaging_movements", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  packagingId: integer("packaging_id").notNull().references(() => packaging.id, { onDelete: "cascade" }),
  date: day("date").notNull(),
  qty: integer("qty").notNull(),                 // pieces (+ in, - out)
  type: text("type").notNull(),                  // PURCHASE | USE | COUNT
  refType: text("ref_type").notNull().default(""), // "order" for USE
  refId: integer("ref_id"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("pack_mov_tenant_item").on(t.tenantId, t.packagingId), index("pack_mov_ref").on(t.refType, t.refId)]);

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  menuItemId: integer("menu_item_id").notNull().unique().references(() => menuItems.id, { onDelete: "cascade" }),
  platesPerBatch: qtyN("plates_per_batch").notNull().default(1),
  portion: text("portion").notNull().default(""),
  gasCost: money("gas_cost").notNull().default(0),
  miscPct: pct("misc_pct").notNull().default(0),
  method: text("method").notNull().default(""),
  tasteNotes: text("taste_notes").notNull().default(""),
  madeBy: text("made_by").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  qty: qtyN("qty").notNull(), // per batch
  unit: text("unit").notNull(),
});

export const recipePackaging = pgTable("recipe_packaging", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  packagingId: integer("packaging_id").notNull().references(() => packaging.id),
  qtyPerPlate: qtyN("qty_per_plate").notNull(),
});

// Thali / combo made from other dishes (fraction of a plate)
export const recipeComponents = pgTable("recipe_components", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id),
  qtyPerPlate: qtyN("qty_per_plate").notNull(),
});

// ---------- Customers & orders ----------
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  flat: text("flat").notNull().default(""),
  area: text("area").notNull().default(""),
  email: text("email").notNull().default(""),
  birthday: day("birthday"),
  notes: text("notes").notNull().default(""),
  onlineBlocked: boolean("online_blocked").notNull().default(false), // can't place online orders
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  orderNo: integer("order_no").notNull(),  // running number (per restaurant, per FY if enabled)
  fy: text("fy").notNull().default(""),     // "25-26" when yearly numbering is on
  billNo: text("bill_no").notNull(),        // formatted bill id printed on bills, fixed at creation
  date: day("date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  customerId: integer("customer_id").references(() => customers.id),
  orderType: text("order_type").notNull(),
  tableNo: text("table_no").notNull().default(""),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE / CANCELLED
  // cancellation approval: staff request -> owner/approver decides. Bill stays ACTIVE until approved.
  cancelStatus: text("cancel_status").notNull().default(""), // "" | REQUESTED | APPROVED | REJECTED
  cancelReason: text("cancel_reason").notNull().default(""),
  cancelRequestedById: integer("cancel_requested_by_id"),
  cancelRequestedAt: timestamp("cancel_requested_at"),
  cancelDecidedById: integer("cancel_decided_by_id"),
  cancelDecidedAt: timestamp("cancel_decided_at"),
  cancelNote: text("cancel_note").notNull().default(""),
  cancelMoney: text("cancel_money").notNull().default(""), // what happened to money received: "" | REFUNDED | ADVANCE
  itemsTotal: money("items_total").notNull(),
  itemDiscount: money("item_discount").notNull().default(0),
  orderDiscount: money("order_discount").notNull().default(0),
  deliveryCharge: money("delivery_charge").notNull().default(0),
  packingCharge: money("packing_charge").notNull().default(0),
  taxable: money("taxable").notNull(),
  gstRate: pct("gst_rate").notNull(),
  gstAmount: money("gst_amount").notNull(),
  roundOff: money("round_off").notNull(),
  total: money("total").notNull(),
  foodCost: money("food_cost").notNull().default(0),
  packagingCost: money("packaging_cost").notNull().default(0), // what the packaging on this order cost you
  packagingCharged: boolean("packaging_charged").notNull().default(false), // packaging added to the customer's bill (off by default)
  notes: text("notes").notNull().default(""),
  // pre-orders: "date" is the day the food is served / delivered
  isPreorder: boolean("is_preorder").notNull().default(false),
  mealSlot: text("meal_slot").notNull().default(""),      // Breakfast / Lunch / Dinner ...
  slotTime: text("slot_time").notNull().default(""),      // "13:00"
  bookedOn: day("booked_on"),
  fulfilStatus: text("fulfil_status").notNull().default(""), // "" | PENDING | READY | DELIVERED
  // online payment link (Razorpay)
  payLinkId: text("pay_link_id").notNull().default(""),
  payLinkShort: text("pay_link_short").notNull().default(""),
  payLinkAmount: money("pay_link_amount"),
  payLinkStatus: text("pay_link_status").notNull().default(""),
  createdById: integer("created_by_id").references(() => users.id),
}, (t) => [
  uniqueIndex("orders_tenant_bill").on(t.tenantId, t.billNo),
  uniqueIndex("orders_tenant_fy_no").on(t.tenantId, t.fy, t.orderNo),
  index("orders_tenant_date").on(t.tenantId, t.date), index("orders_customer").on(t.customerId),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  qty: qtyN("qty").notNull(),
  rate: money("rate").notNull(),
  discount: money("discount").notNull().default(0),
  lineTotal: money("line_total").notNull(),
  unitCost: money("unit_cost").notNull().default(0),
}, (t) => [index("order_items_order").on(t.orderId)]);

// Packaging that went with an order (shown on the bill)
export const orderPackaging = pgTable("order_packaging", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  packagingId: integer("packaging_id").notNull().references(() => packaging.id),
  name: text("name").notNull(),
  qty: qtyN("qty").notNull(),
  unitPrice: money("unit_price").notNull(), // charged to customer (0 unless the order charges packaging)
  unitCost: money("unit_cost").notNull(),   // your cost
}, (t) => [index("order_packaging_order").on(t.orderId)]);

// Orders placed by customers on the public order page; become real bills when staff accept them
export const onlineOrders = pgTable("online_orders", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  token: text("token").notNull().unique(),                  // secret link for the customer's status page
  status: text("status").notNull().default("NEW"),          // NEW | ACCEPTED | REJECTED
  customerId: integer("customer_id").references(() => customers.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull().default(""),
  kind: text("kind").notNull(),                             // DELIVERY | TAKEAWAY
  isPreorder: boolean("is_preorder").notNull().default(false),
  date: day("date").notNull(),                              // day the food is wanted
  mealSlot: text("meal_slot").notNull().default(""),
  slotTime: text("slot_time").notNull().default(""),
  items: text("items").notNull(),                           // JSON [{menuItemId, name, qty, rate}]
  estTotal: money("est_total").notNull(),
  payMethod: text("pay_method").notNull(),                  // COD | UPI
  upiRef: text("upi_ref").notNull().default(""),            // UTR / transaction id the customer typed
  notes: text("notes").notNull().default(""),
  rejectReason: text("reject_reason").notNull().default(""),
  orderId: integer("order_id").references(() => orders.id), // the bill created on accept
  decidedById: integer("decided_by_id"),
  decidedAt: timestamp("decided_at"),
  ip: text("ip").notNull().default(""),
  verifyCode: text("verify_code").notNull().default(""),      // 4 digits the customer sends on WhatsApp
  waConfirmed: boolean("wa_confirmed").notNull().default(false), // staff saw the WhatsApp message from this number
  device: text("device").notNull().default(""),               // hash of the customer's browser id (for "My orders")
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("online_orders_tenant_status").on(t.tenantId, t.status, t.createdAt)]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customers.id),
  amount: money("amount").notNull(),
  mode: text("mode").notNull(),
  notes: text("notes").notNull().default(""),
  ref: text("ref").notNull().default(""), // gateway payment id (e.g. Razorpay pay_...), to avoid double entries
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("payments_order").on(t.orderId)]);

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  platform: text("platform").notNull(),
  fromDate: day("from_date").notNull(),
  toDate: day("to_date").notNull(),
  payoutDate: day("payout_date").notNull(),
  payout: money("payout").notNull(),
  notes: text("notes").notNull().default(""),
});

// ---------- Stock ----------
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  qty: qtyN("qty").notNull(), // in ingredient unit; + in, - out
  type: text("type").notNull(), // OPENING, PURCHASE, SALE, WASTAGE, COUNT
  refType: text("ref_type"),
  refId: integer("ref_id"),
  notes: text("notes").notNull().default(""),
}, (t) => [index("stock_ref").on(t.refType, t.refId), index("stock_ing").on(t.ingredientId), index("stock_tenant").on(t.tenantId)]);

export const wastage = pgTable("wastage", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  menuItemId: integer("menu_item_id").references(() => menuItems.id),
  plates: qtyN("plates"),
  ingredientId: integer("ingredient_id").references(() => ingredients.id),
  qty: qtyN("qty"),
  cost: money("cost").notNull(),
  reason: text("reason").notNull().default(""),
});

// ---------- Money out ----------
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  supplies: text("supplies").notNull().default(""),
  notes: text("notes").notNull().default(""),
}, (t) => [uniqueIndex("vendors_tenant_name").on(t.tenantId, t.name)]);

export const vendorPayments = pgTable("vendor_payments", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  mode: text("mode").notNull(),
  notes: text("notes").notNull().default(""),
});

export const staff = pgTable("staff", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  phone: text("phone").notNull().default(""),
  joiningDate: day("joining_date"),
  monthlySalary: money("monthly_salary").notNull().default(0),
  active: boolean("active").notNull().default(true),
  notes: text("notes").notNull().default(""),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  ingredientId: integer("ingredient_id").references(() => ingredients.id),
  qty: qtyN("qty"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  staffId: integer("staff_id").references(() => staff.id),
  amount: money("amount").notNull(),
  paymentMode: text("payment_mode").notNull(), // "Credit" = owed to vendor
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("expenses_tenant_date").on(t.tenantId, t.date)]);

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  date: day("date").notNull(),
  status: text("status").notNull(), // P, A, H, L
}, (t) => [uniqueIndex("attendance_staff_date").on(t.staffId, t.date)]);

export const cashClosings = pgTable("cash_closings", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  date: day("date").notNull(),
  openingCash: money("opening_cash").notNull(),
  cashIn: money("cash_in").notNull(),
  cashOut: money("cash_out").notNull(),
  expected: money("expected").notNull(),
  actual: money("actual").notNull(),
  difference: money("difference").notNull(),
  notes: text("notes").notNull().default(""),
  closedBy: text("closed_by").notNull().default(""),
}, (t) => [uniqueIndex("cash_tenant_date").on(t.tenantId, t.date)]);

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  tenantId: tid(),
  title: text("title").notNull(),
  dueDate: day("due_date").notNull(),
  repeat: text("repeat").notNull().default("NONE"), // NONE, MONTHLY, YEARLY
  notes: text("notes").notNull().default(""),
  done: boolean("done").notNull().default(false),
});

// ---------- Relations (for db.query ... with) ----------
export const menuItemsRel = relations(menuItems, ({ one, many }) => ({
  category: one(categories, { fields: [menuItems.categoryId], references: [categories.id] }),
  recipe: one(recipes, { fields: [menuItems.id], references: [recipes.menuItemId] }),
  orderItems: many(orderItems),
}));
export const categoriesRel = relations(categories, ({ many }) => ({ items: many(menuItems) }));
export const recipesRel = relations(recipes, ({ one, many }) => ({
  menuItem: one(menuItems, { fields: [recipes.menuItemId], references: [menuItems.id] }),
  ingredients: many(recipeIngredients),
  packaging: many(recipePackaging),
  components: many(recipeComponents),
}));
export const recipeIngredientsRel = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] }),
}));
export const recipePackagingRel = relations(recipePackaging, ({ one }) => ({
  recipe: one(recipes, { fields: [recipePackaging.recipeId], references: [recipes.id] }),
  packaging: one(packaging, { fields: [recipePackaging.packagingId], references: [packaging.id] }),
}));
export const recipeComponentsRel = relations(recipeComponents, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeComponents.recipeId], references: [recipes.id] }),
  menuItem: one(menuItems, { fields: [recipeComponents.menuItemId], references: [menuItems.id] }),
}));
export const ordersRel = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  createdBy: one(users, { fields: [orders.createdById], references: [users.id] }),
  packaging: many(orderPackaging),
  items: many(orderItems),
  payments: many(payments),
}));
export const orderPackagingRel = relations(orderPackaging, ({ one }) => ({
  order: one(orders, { fields: [orderPackaging.orderId], references: [orders.id] }),
  packaging: one(packaging, { fields: [orderPackaging.packagingId], references: [packaging.id] }),
}));
export const orderItemsRel = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  menuItem: one(menuItems, { fields: [orderItems.menuItemId], references: [menuItems.id] }),
}));
export const paymentsRel = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
}));
export const customersRel = relations(customers, ({ many }) => ({ orders: many(orders), payments: many(payments) }));
export const expensesRel = relations(expenses, ({ one }) => ({
  ingredient: one(ingredients, { fields: [expenses.ingredientId], references: [ingredients.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
  staff: one(staff, { fields: [expenses.staffId], references: [staff.id] }),
}));
export const wastageRel = relations(wastage, ({ one }) => ({
  menuItem: one(menuItems, { fields: [wastage.menuItemId], references: [menuItems.id] }),
  ingredient: one(ingredients, { fields: [wastage.ingredientId], references: [ingredients.id] }),
}));
export const dailyMenusRel = relations(dailyMenus, ({ one }) => ({
  menuItem: one(menuItems, { fields: [dailyMenus.menuItemId], references: [menuItems.id] }),
}));
export const vendorPaymentsRel = relations(vendorPayments, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorPayments.vendorId], references: [vendors.id] }),
}));
export const attendanceRel = relations(attendance, ({ one }) => ({
  staff: one(staff, { fields: [attendance.staffId], references: [staff.id] }),
}));
