import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const DB_PATH = process.env.DB_PATH ?? "./data/credit_shop.db";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      note TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      items_json TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
  `);
}

initDb();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function nowNanos() {
  return Date.now() * 1_000_000;
}

function mapCustomer(row) {
  return {
    id: String(row.id),
    name: row.name,
    mobile: row.mobile,
    createdAt: String(row.created_at),
  };
}

function mapProduct(row) {
  return {
    id: String(row.id),
    name: row.name,
    price: row.price,
    barcode: row.barcode,
    createdAt: String(row.created_at),
  };
}

function mapTransaction(row) {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    productName: row.product_name,
    note: row.note,
    amount: row.amount,
    txType: row.tx_type,
    timestamp: String(row.timestamp),
    itemsJson: row.items_json ?? undefined,
  };
}

function getCustomerBalanceById(id) {
  const customerRow = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  if (!customerRow) return null;
  const totals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN tx_type = 'udhaar' THEN amount ELSE 0 END) AS total_udhaar,
         SUM(CASE WHEN tx_type = 'payment' THEN amount ELSE 0 END) AS total_paid,
         MAX(CASE WHEN tx_type = 'payment' THEN timestamp ELSE 0 END) AS last_payment_date
       FROM transactions
       WHERE customer_id = ?`,
    )
    .get(id);

  const totalUdhaar = Number(totals.total_udhaar ?? 0);
  const totalPaid = Number(totals.total_paid ?? 0);
  const lastPaymentDate = Number(totals.last_payment_date ?? 0);

  return {
    customer: mapCustomer(customerRow),
    totalUdhaar,
    totalPaid,
    remainingBalance: totalUdhaar - totalPaid,
    lastPaymentDate: String(lastPaymentDate),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/customers", (req, res) => {
  const { name, mobile } = req.body;
  if (!mobile || typeof mobile !== "string") return res.json(null);

  const existing = db
    .prepare("SELECT id FROM customers WHERE mobile = ?")
    .get(mobile);
  if (existing) return res.json(null);

  const createdAt = nowNanos();
  const info = db
    .prepare("INSERT INTO customers (name, mobile, created_at) VALUES (?, ?, ?)")
    .run(name ?? "", mobile, createdAt);

  const customer = db
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(info.lastInsertRowid);

  res.json(mapCustomer(customer));
});

app.put("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, mobile } = req.body;
  if (!mobile || typeof mobile !== "string") return res.json(false);

  const existing = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  if (!existing) return res.json(false);

  const duplicate = db
    .prepare("SELECT id FROM customers WHERE mobile = ? AND id != ?")
    .get(mobile, id);
  if (duplicate) return res.json(false);

  db.prepare("UPDATE customers SET name = ?, mobile = ? WHERE id = ?").run(
    name ?? existing.name,
    mobile,
    id,
  );

  res.json(true);
});

app.delete("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  res.json(info.changes > 0);
});

app.get("/api/customers", (_req, res) => {
  const rows = db.prepare("SELECT id FROM customers").all();
  const balances = rows.map((row) => getCustomerBalanceById(row.id));
  res.json(balances.filter(Boolean));
});

app.get("/api/customers/:id/balance", (req, res) => {
  const id = Number(req.params.id);
  res.json(getCustomerBalanceById(id));
});

app.get("/api/customers/search", (req, res) => {
  const term = String(req.query.term ?? "");
  const like = `%${term}%`;
  const rows = db
    .prepare(
      "SELECT * FROM customers WHERE name LIKE ? OR mobile LIKE ? ORDER BY id ASC",
    )
    .all(like, like);
  res.json(rows.map(mapCustomer));
});

app.get("/api/customers/sorted-by-balance", (_req, res) => {
  const rows = db.prepare("SELECT id FROM customers").all();
  const balances = rows
    .map((row) => getCustomerBalanceById(row.id))
    .filter(Boolean)
    .sort((a, b) => b.remainingBalance - a.remainingBalance);
  res.json(balances);
});

app.get("/api/customers/high-balance", (req, res) => {
  const threshold = Number(req.query.threshold ?? 0);
  const rows = db.prepare("SELECT id FROM customers").all();
  const balances = rows
    .map((row) => getCustomerBalanceById(row.id))
    .filter((row) => row && row.remainingBalance > threshold);
  res.json(balances);
});

app.get("/api/customers/inactive", (req, res) => {
  const days = Number(req.query.days ?? 0);
  const now = nowNanos();
  const daysInNanos = 24 * 3600 * 1_000_000_000;

  const rows = db.prepare("SELECT id FROM customers").all();
  const balances = rows
    .map((row) => getCustomerBalanceById(row.id))
    .filter((cb) => {
      if (!cb) return false;
      const daysSincePayment =
        Number(cb.lastPaymentDate) === 0
          ? days + 1
          : Math.floor((now - Number(cb.lastPaymentDate)) / daysInNanos);
      return daysSincePayment > days;
    });

  res.json(balances);
});

app.post("/api/products", (req, res) => {
  const { name, price, barcode } = req.body;

  const existing = db
    .prepare("SELECT id FROM products WHERE barcode = ?")
    .get(barcode);
  if (existing) return res.json(null);

  const createdAt = nowNanos();
  const info = db
    .prepare("INSERT INTO products (name, price, barcode, created_at) VALUES (?, ?, ?, ?)")
    .run(name ?? "", Number(price ?? 0), barcode ?? "", createdAt);
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid);
  res.json(mapProduct(row));
});

app.put("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, price, barcode } = req.body;
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!existing) return res.json(false);

  db.prepare("UPDATE products SET name = ?, price = ?, barcode = ? WHERE id = ?").run(
    name ?? existing.name,
    Number(price ?? existing.price),
    barcode ?? existing.barcode,
    id,
  );
  res.json(true);
});

app.delete("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  res.json(info.changes > 0);
});

app.get("/api/products", (_req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id ASC").all();
  res.json(rows.map(mapProduct));
});

app.post("/api/products/bulk-import", (req, res) => {
  const productList = Array.isArray(req.body?.productList) ? req.body.productList : [];
  let added = 0;
  let skipped = 0;

  const insertStmt = db.prepare(
    "INSERT INTO products (name, price, barcode, created_at) VALUES (?, ?, ?, ?)",
  );
  const existsStmt = db.prepare("SELECT id FROM products WHERE barcode = ?");

  for (const product of productList) {
    const barcode = product?.barcode ?? "";
    if (existsStmt.get(barcode)) {
      skipped += 1;
      continue;
    }

    insertStmt.run(
      product?.name ?? "",
      Number(product?.price ?? 0),
      barcode,
      nowNanos(),
    );
    added += 1;
  }

  res.json({ added: String(added), skipped: String(skipped) });
});

app.get("/api/products/search", (req, res) => {
  const term = String(req.query.term ?? "");
  const like = `%${term}%`;
  const rows = db
    .prepare(
      "SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? ORDER BY id ASC",
    )
    .all(like, like);
  res.json(rows.map(mapProduct));
});

app.post("/api/transactions", (req, res) => {
  const { customerId, productName, note, amount, txType } = req.body;
  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ?")
    .get(Number(customerId));
  if (!customer) return res.json(null);

  const info = db
    .prepare(
      "INSERT INTO transactions (customer_id, product_name, note, amount, tx_type, timestamp, items_json) VALUES (?, ?, ?, ?, ?, ?, NULL)",
    )
    .run(
      Number(customerId),
      productName ?? "",
      note ?? "",
      Number(amount ?? 0),
      txType ?? "",
      nowNanos(),
    );
  const row = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(info.lastInsertRowid);
  res.json(mapTransaction(row));
});

app.post("/api/transactions/batch", (req, res) => {
  const { customerId, totalAmount, itemsJson, note } = req.body;
  const customer = db
    .prepare("SELECT id FROM customers WHERE id = ?")
    .get(Number(customerId));
  if (!customer) return res.json(null);

  const info = db
    .prepare(
      "INSERT INTO transactions (customer_id, product_name, note, amount, tx_type, timestamp, items_json) VALUES (?, 'Batch', ?, ?, 'udhaar', ?, ?)",
    )
    .run(Number(customerId), note ?? "", Number(totalAmount ?? 0), nowNanos(), itemsJson ?? null);

  const row = db
    .prepare("SELECT * FROM transactions WHERE id = ?")
    .get(info.lastInsertRowid);
  res.json(mapTransaction(row));
});

app.delete("/api/transactions/:id", (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
  res.json(info.changes > 0);
});

app.get("/api/transactions/customer/:customerId", (req, res) => {
  const customerId = Number(req.params.customerId);
  const rows = db
    .prepare(
      "SELECT * FROM transactions WHERE customer_id = ? ORDER BY timestamp ASC",
    )
    .all(customerId);
  res.json(rows.map(mapTransaction));
});

app.listen(PORT, () => {
  console.log(`Credit Shop API listening on port ${PORT}`);
});
