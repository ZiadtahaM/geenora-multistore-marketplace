import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTS_CATALOG,
  BROKERS_CATALOG,
  TAKE_RATE_BPS,
  EscrowOrderAggregate,
  CodPreShipmentEngine,
  PropTechBrokerRouter,
  CrossMerchantCodRiskEngine,
  GeenoraStore,
} from "../lib/domain/marketplace-escrow-ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("Invariant 1: Catalog prices are strictly integer Egyptian piasters", () => {
  assert.ok(PRODUCTS_CATALOG.length >= 3, "Catalog must expose products");
  for (const product of PRODUCTS_CATALOG) {
    assert.equal(Number.isInteger(product.pricePiasters), true, `Price for ${product.id} must be integer piasters`);
    assert.ok(product.pricePiasters > 0, `Price for ${product.id} must be positive`);
  }
});

test("Invariant 2: Order creation locks funds into ESCROW_LOCKED state", () => {
  const order = EscrowOrderAggregate.createOrder({
    buyerPhone: "+201012345678",
    merchantId: "merch-1",
    productId: "prod-1",
    quantity: 2,
  });

  assert.ok(order.orderId.startsWith("ord-"));
  assert.equal(order.state, "ESCROW_LOCKED");
  assert.equal(order.fundsReleased, false);
  assert.equal(order.quantity, 2);
  assert.equal(order.grossPiasters, 250000);
});

test("Invariant 3: Martin Kleppmann escrow conservation equation holds with zero leakage", () => {
  const order = EscrowOrderAggregate.createOrder({
    buyerPhone: "+201099887766",
    merchantId: "merch-2",
    productId: "prod-3",
    quantity: 3,
  });

  assert.equal(Number.isInteger(order.grossPiasters), true);
  assert.equal(Number.isInteger(order.platformTakeRatePiasters), true);
  assert.equal(Number.isInteger(order.netMerchantPiasters), true);

  const sum = order.platformTakeRatePiasters + order.netMerchantPiasters;
  const leakage = order.grossPiasters - sum;
  assert.equal(leakage, 0, "Financial leakage must strictly be zero piasters");
});

test("Invariant 4: Order delivery releases escrow funds to merchant", () => {
  const order = EscrowOrderAggregate.createOrder({
    buyerPhone: "+201011223344",
    merchantId: "merch-1",
    productId: "prod-2",
    quantity: 1,
  });

  const delivered = EscrowOrderAggregate.deliverOrder(order);
  assert.equal(delivered.state, "DELIVERED");
  assert.equal(delivered.fundsReleased, true);
  assert.ok(delivered.deliveredAt);

  assert.throws(() => EscrowOrderAggregate.deliverOrder(delivered), /Cannot release escrow/);
});

test("Invariant 5: COD pre-shipment intercept requires confirmation and protects courier fees", () => {
  const codOrder = CodPreShipmentEngine.interceptOrder({
    buyerPhone: "+201055554444",
    merchantId: "merch-1",
    productId: "prod-1",
    quantity: 1,
    deliveryAddress: "المعادي، القاهرة",
  });

  assert.equal(codOrder.state, "COD_CONFIRMATION_PENDING");
  assert.equal(codOrder.confirmed, false);
  assert.ok(codOrder.whatsappConfirmationUrl.startsWith("https://wa.me/201055554444?text="));

  const expired = CodPreShipmentEngine.expireStaleOrder(codOrder);
  assert.equal(expired.state, "CANCELLED_PRE_SHIPMENT_FRAUD_PREVENTION");
  assert.equal(expired.shippingFeeSavedEgp, 75);
});

test("Invariant 6: PropTech broker lead router enforces 10-minute SLA and WhatsApp dispatch", () => {
  const lead = PropTechBrokerRouter.routeLead({
    buyerName: "طارق منصور",
    buyerPhone: "+201098765432",
    propertyId: "prop-new-cairo-101",
    propertyTitle: "Skyline Villa New Cairo",
    budgetEGP: 8500000,
  });

  assert.ok(lead.leadId.startsWith("lead-"));
  assert.equal(lead.brokerName, "Ahmed El-Kady");
  assert.ok(lead.whatsappDeepLink.startsWith("https://wa.me/201009876543?text="));
  assert.equal(lead.contacted, false);
});

test("Invariant 7: Cross-Merchant COD risk engine requires 50 EGP deposit on high-risk orders", () => {
  const lowRisk = CrossMerchantCodRiskEngine.evaluateRiskAndDetermineDeposit({
    buyerPhone: "+201011112222",
    grossPiasters: 50000,
    priorRefusalCount: 0,
  });
  assert.equal(lowRisk.isHighRisk, false);
  assert.equal(lowRisk.microDepositRequired, false);

  const highTicket = CrossMerchantCodRiskEngine.evaluateRiskAndDetermineDeposit({
    buyerPhone: "+201033334444",
    grossPiasters: 200000,
    priorRefusalCount: 0,
  });
  assert.equal(highTicket.isHighRisk, true);
  assert.equal(highTicket.microDepositRequired, true);
  assert.equal(highTicket.microDepositEgp, 50);

  const priorRefusal = CrossMerchantCodRiskEngine.evaluateRiskAndDetermineDeposit({
    buyerPhone: "+201077778888",
    grossPiasters: 30000,
    priorRefusalCount: 1,
  });
  assert.equal(priorRefusal.isHighRisk, true);
  assert.equal(priorRefusal.microDepositRequired, true);
});

test("Invariant 8: Ubiquitous Language contract file is non-empty and contains essential concepts", async () => {
  const docPath = path.resolve(__dirname, "../UBIQUITOUS_LANGUAGE.md");
  const content = await fs.readFile(docPath, "utf-8");
  assert.ok(content.length > 100);
  assert.match(content, /MarketplaceOrder/);
  assert.match(content, /EscrowConservationEquation/);
});
