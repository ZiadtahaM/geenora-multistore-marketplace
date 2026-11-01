import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, "../data/geenora.sqlite");

describe("Geenora & Urbana Gate 3: Stateful API, Idempotency & Outbox Suite", () => {
  let baseUrl;
  let serverInstance = null;
  const idempotencyKey = `idem_order_${Date.now()}`;

  before(async () => {
    try {
      const probe = await fetch("http://127.0.0.1:8098/health");
      if (probe.ok) {
        baseUrl = "http://127.0.0.1:8098";
        return;
      }
    } catch {
      // background server not up; spin up test server
    }

    process.env.NODE_ENV = "test";
    const mod = await import("../server-api.mjs");
    serverInstance = mod.server;
    await new Promise((resolve) => {
      serverInstance.listen(0, "127.0.0.1", () => {
        const port = serverInstance.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance && serverInstance.listening) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  let initialResponseJson;
  let createdOrderId;

  test("POST 1: Initial order placement with Idempotency-Key writes to SQLite and outbox", async () => {
    const payload = {
      buyerPhone: "+201012345678",
      merchantId: "merch-1",
      productId: "prod-1",
      quantity: 2,
    };

    const res = await fetch(`${baseUrl}/api/geenora/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201, "First order placement POST must succeed with 201 Created");
    initialResponseJson = await res.json();
    assert.ok(initialResponseJson.orderId, "Must return orderId");
    createdOrderId = initialResponseJson.orderId;

    // Verify physical SQLite row persistence
    const db = new DatabaseSync(dbPath);
    const orderRow = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(createdOrderId);
    assert.ok(orderRow, "Order must physically exist in SQLite orders table");
    assert.equal(orderRow.product_id, "prod-1");
    assert.equal(orderRow.quantity, 2);
    assert.equal(orderRow.gross_piasters, 250000);
    assert.equal(orderRow.state, "ESCROW_LOCKED");

    // Verify idempotency cache in SQLite
    const idemRow = db.prepare("SELECT * FROM idempotency_keys WHERE key = ?").get(idempotencyKey);
    assert.ok(idemRow, "Idempotency key must be stored in SQLite idempotency_keys table");

    // Verify audit outbox row
    const outboxRows = db.prepare("SELECT * FROM audit_outbox WHERE event_type = ?").all("ORDER_CREATED");
    assert.ok(outboxRows.length >= 1, "Audit outbox must contain ORDER_CREATED event");
    db.close();
  });

  test("POST 2: Duplicate POST with identical Idempotency-Key returns cached response without duplicate side effects", async () => {
    const db = new DatabaseSync(dbPath);
    const countBefore = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE order_id = ?").get(createdOrderId).cnt;
    db.close();

    const payload = {
      buyerPhone: "+201012345678",
      merchantId: "merch-1",
      productId: "prod-1",
      quantity: 2,
    };

    const res = await fetch(`${baseUrl}/api/geenora/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200, "Idempotent retry must return 200 OK");
    assert.equal(res.headers.get("x-cache"), "HIT-IDEMPOTENCY", "Response must carry X-Cache: HIT-IDEMPOTENCY");

    const duplicateResponseJson = await res.json();
    assert.deepEqual(duplicateResponseJson, initialResponseJson, "Payload must match initial response exactly");

    // Verify no duplicate rows were inserted
    const db2 = new DatabaseSync(dbPath);
    const countAfter = db2.prepare("SELECT COUNT(*) as cnt FROM orders WHERE order_id = ?").get(createdOrderId).cnt;
    db2.close();

    assert.equal(countAfter, countBefore, "Row count must remain exactly 1 after duplicate idempotent request");
  });
});
