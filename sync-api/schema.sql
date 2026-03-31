CREATE TABLE IF NOT EXISTS customers (
  id BIGINT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  mobile VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  barcode VARCHAR(120) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uniq_barcode (barcode)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  note TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tx_type VARCHAR(32) NOT NULL,
  timestamp BIGINT NOT NULL,
  items_json LONGTEXT NULL,
  INDEX idx_customer (customer_id)
);
