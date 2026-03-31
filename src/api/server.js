import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import mysql from "mysql2/promise";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DB || "credit_shop",
  waitForConnections: true,
  connectionLimit: 10,
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/sync/push", async (req, res) => {
  const { customers = [], products = [], transactions = [] } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of customers) {
      await conn.query(
        `INSERT INTO customers (id,name,mobile,created_at)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), mobile=VALUES(mobile)`,
        [c.id, c.name, c.mobile, c.createdAt],
      );
    }

    for (const p of products) {
      await conn.query(
        `INSERT INTO products (id,name,barcode,price,created_at)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), price=VALUES(price), barcode=VALUES(barcode)`,
        [p.id, p.name, p.barcode, p.price, p.createdAt],
      );
    }

    for (const t of transactions) {
      await conn.query(
        `INSERT INTO transactions (id,customer_id,product_name,note,amount,tx_type,items_json,timestamp)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE note=VALUES(note), amount=VALUES(amount), tx_type=VALUES(tx_type), items_json=VALUES(items_json)`,
        [
          t.id,
          t.customerId,
          t.productName,
          t.note,
          t.amount,
          t.txType,
          t.itemsJson || null,
          t.timestamp,
        ],
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ ok: false, message: String(error) });
  } finally {
    conn.release();
  }
});

app.get("/sync/pull", async (_req, res) => {
  const [customers] = await pool.query("SELECT id, name, mobile, created_at AS createdAt FROM customers");
  const [products] = await pool.query("SELECT id, name, barcode, price, created_at AS createdAt FROM products");
  const [transactions] = await pool.query(
    "SELECT id, customer_id AS customerId, product_name AS productName, note, amount, tx_type AS txType, items_json AS itemsJson, timestamp FROM transactions",
  );
  res.json({ customers, products, transactions });
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(`Sync API listening on :${port}`);
});
