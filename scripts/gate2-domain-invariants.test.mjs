import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTS_CATALOG,
  BROKERS_CATALOG,
  TAKE_RATE_BPS,
  EscrowOrderAggregate,
  CodPreShipmentEngine,
  PropTechBrokerRouter,
  CrossMerchantCodRiskEngine,
} from "../lib/domain/marketplace-escrow-ledger.mjs";

test("Geenora & Urbana Gate 2: Pure Domain Invariants Suite", async (t) => {
  await t.test("Invariant 1: Product and Broker catalogs maintain fixed-point integer integrity", () => {
    assert.ok(PRODUCTS_CATALOG.length >= 3, "Catalog must expose at least 3 products");
    for (const p of PRODUCTS_CATALOG) {
      assert.equal(Number.isInteger(p.pricePiasters), true, `Price for ${p.id} must be integer piasters`);
      assert.ok(p.pricePiasters > 0, `Price for ${p.id} must be positive`);
    }

    assert.ok(BROKERS_CATALOG.length >= 2, "Broker catalog must expose at least 2 brokers");
    for (const b of BROKERS_CATALOG) {
      assert.ok(b.id, "Broker must have id");
      assert.ok(b.name, "Broker must have name");
      assert.ok(b.phone.startsWith("+20"), "Broker must have Egyptian international phone format");
    }
  });

  await t.test("Invariant 2: Order creation locks funds into ESCROW_LOCKED with exact piasters math", () => {
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
    assert.equal(order.platformTakeRatePiasters, 37500); // 15% of 250,000
    assert.equal(order.netMerchantPiasters, 212500);
  });

  await t.test("Invariant 3: Escrow conservation equation holds with zero leakage", () => {
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

  await t.test("Invariant 4: Order delivery releases escrow funds to merchant and prevents duplicate delivery", () => {
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

    assert.throws(
      () => EscrowOrderAggregate.deliverOrder(delivered),
      /Cannot release escrow/,
      "Must reject delivery attempt on already delivered order"
    );
  });

  await t.test("Invariant 5: COD pre-shipment intercept enforces WhatsApp confirmation and saves courier fees on expiration", () => {
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

    const confirmed = CodPreShipmentEngine.confirmOrder(codOrder);
    assert.equal(confirmed.state, "ESCROW_LOCKED");
    assert.equal(confirmed.confirmed, true);

    const staleOrder = CodPreShipmentEngine.interceptOrder({
      buyerPhone: "+201055554444",
      merchantId: "merch-1",
      productId: "prod-1",
      quantity: 1,
    });
    const expired = CodPreShipmentEngine.expireStaleOrder(staleOrder);
    assert.equal(expired.state, "CANCELLED_PRE_SHIPMENT_FRAUD_PREVENTION");
    assert.equal(expired.shippingFeeSavedEgp, 75);
  });

  await t.test("Invariant 6: PropTech broker router enforces 10-minute decay SLA and auto-reassignment", () => {
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

    // Simulate stale decay past 10 minutes
    const staleLead = { ...lead, expiresAt: new Date(Date.now() - 1000).toISOString() };
    const reassigned = PropTechBrokerRouter.reassignIfStale(staleLead);
    assert.equal(reassigned.reassigned, true);
    assert.equal(reassigned.brokerName, "Nouran Mansour");
  });

  await t.test("Invariant 7: Cross-Merchant COD risk engine requires 50 EGP deposit on high-risk orders", () => {
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
});
