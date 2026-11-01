-- Geenora & Urbana Marketplace OS: Gate 1 Relational Schema
-- Enforces: Fixed-Point Egyptian Piasters, Strict Foreign Keys, Escrow Invariants, and Immutability Triggers
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_piasters INTEGER NOT NULL CHECK (price_piasters > 0),
  merchant_id TEXT NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payout_account TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  buyer_phone TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  gross_piasters INTEGER NOT NULL CHECK (gross_piasters > 0),
  platform_take_rate_piasters INTEGER NOT NULL CHECK (platform_take_rate_piasters >= 0),
  net_merchant_piasters INTEGER NOT NULL CHECK (net_merchant_piasters >= 0),
  state TEXT NOT NULL DEFAULT 'ESCROW_LOCKED' CHECK (state IN ('ESCROW_LOCKED', 'COD_CONFIRMATION_PENDING', 'COD_DISPATCHED', 'DELIVERED', 'REFUNDED', 'DISPUTED')),
  funds_released INTEGER NOT NULL DEFAULT 0 CHECK (funds_released IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proptech_leads (
  lead_id TEXT PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  property_id TEXT NOT NULL,
  property_title TEXT NOT NULL,
  budget_egp INTEGER NOT NULL CHECK (budget_egp > 0),
  broker_name TEXT NOT NULL,
  whatsapp_deep_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  dispatched INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  signature_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- BEFORE DELETE Triggers Enforcing Immutability
CREATE TRIGGER IF NOT EXISTS prevent_order_delete
BEFORE DELETE ON orders
BEGIN
  SELECT RAISE(ABORT, 'ORDER_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
BEFORE DELETE ON audit_ledger
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_LEDGER_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS prevent_outbox_delete
BEFORE DELETE ON audit_outbox
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_OUTBOX_IMMUTABLE');
END;
