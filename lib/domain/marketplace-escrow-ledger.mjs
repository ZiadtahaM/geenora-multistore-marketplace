import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.resolve(ROOT_DIR, "data");
const STORE_PATH = path.resolve(DATA_DIR, "geenora-store.json");
const SQLITE_PATH = path.resolve(DATA_DIR, "geenora.sqlite");
const SCHEMA_PATH = path.resolve(ROOT_DIR, "schema.sql");

// 1. Catalogs
export const PRODUCTS_CATALOG = [
  { id: "prod-1", name: "Premium Egyptian Cotton Bedding Set", pricePiasters: 125000, merchantId: "merch-1", stock: 25 },
  { id: "prod-2", name: "Artisanal Handmade Brass Lantern", pricePiasters: 85000, merchantId: "merch-1", stock: 40 },
  { id: "prod-3", name: "Organic Siwa Olive Oil 1L", pricePiasters: 42000, merchantId: "merch-2", stock: 100 }
];

export const BROKERS_CATALOG = [
  { id: "brk-1", name: "Ahmed El-Kady", phone: "+201009876543", region: "New Cairo" },
  { id: "brk-2", name: "Nouran Mansour", phone: "+201001122334", region: "Sheikh Zayed" }
];

export const TAKE_RATE_BPS = 1500; // 15.00% platform commission

// 2. Pure Domain Aggregate: Order & Escrow
export class EscrowOrderAggregate {
  static createOrder({ buyerPhone, merchantId, productId, quantity }) {
    const product = PRODUCTS_CATALOG.find(p => p.id === productId);
    if (!product) throw new Error("Product not found in catalog");

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than 0");

    const grossPiasters = product.pricePiasters * qty;
    const platformTakeRatePiasters = Math.round((grossPiasters * TAKE_RATE_BPS) / 10000);
    const netMerchantPiasters = grossPiasters - platformTakeRatePiasters;

    return {
      orderId: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      buyerPhone,
      merchantId,
      productId,
      productName: product.name,
      quantity: qty,
      grossPiasters,
      platformTakeRatePiasters,
      netMerchantPiasters,
      state: "ESCROW_LOCKED",
      fundsReleased: false,
      createdAt: new Date().toISOString()
    };
  }

  static deliverOrder(order) {
    if (order.state !== "ESCROW_LOCKED") {
      throw new Error(`Cannot release escrow for order in state ${order.state}`);
    }
    return {
      ...order,
      state: "DELIVERED",
      fundsReleased: true,
      deliveredAt: new Date().toISOString()
    };
  }
}

// 2b. Cash on Delivery (COD) Pre-Shipment Intercept Engine (Omar DTC Operator Edit)
export class CodPreShipmentEngine {
  static interceptOrder({ buyerPhone, merchantId, productId, quantity, deliveryAddress }) {
    const product = PRODUCTS_CATALOG.find(p => p.id === productId);
    if (!product) throw new Error("Product not found in catalog");

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) throw new Error("Quantity must be greater than 0");

    const grossPiasters = product.pricePiasters * qty;
    const platformTakeRatePiasters = Math.round((grossPiasters * TAKE_RATE_BPS) / 10000);
    const netMerchantPiasters = grossPiasters - platformTakeRatePiasters;
    const confirmationExpiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours window

    const cleanPhone = (buyerPhone || "").replace(/[^\d]/g, "");
    const msg = `السلام عليكم ورحمة الله، نود تأكيد طلبك من متجر جينورا: (${product.name} - عدد ${qty}) بإجمالي ${(grossPiasters / 100).toFixed(2)} ج.م، لشحنه إلى: ${deliveryAddress || "العنوان المحدد"}.\nيرجى الضغط لتأكيد استلام الشحنة وتجنب إلغائها:\nhttps://geenora.com/orders/confirm?order=ord-${Date.now()}`;
    const whatsappConfirmationUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;

    return {
      orderId: `cod-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      buyerPhone,
      deliveryAddress: deliveryAddress || "القاهرة الجديدة",
      merchantId,
      productId,
      productName: product.name,
      quantity: qty,
      grossPiasters,
      platformTakeRatePiasters,
      netMerchantPiasters,
      state: "COD_CONFIRMATION_PENDING",
      confirmationExpiresAt,
      whatsappConfirmationUrl,
      confirmed: false,
      fundsReleased: false,
      createdAt: new Date().toISOString()
    };
  }

  static confirmOrder(codOrder) {
    if (codOrder.state !== "COD_CONFIRMATION_PENDING") {
      throw new Error(`Cannot confirm order in state ${codOrder.state}`);
    }
    return {
      ...codOrder,
      state: "ESCROW_LOCKED",
      confirmed: true,
      confirmedAt: new Date().toISOString()
    };
  }

  static expireStaleOrder(codOrder) {
    if (codOrder.state === "COD_CONFIRMATION_PENDING") {
      return {
        ...codOrder,
        state: "CANCELLED_PRE_SHIPMENT_FRAUD_PREVENTION",
        shippingFeeSavedEgp: 75, // Saved 75 EGP courier outbound fee + 40 return fee!
        expiredAt: new Date().toISOString()
      };
    }
    return codOrder;
  }
}

// 3. PropTech Broker Lead Router (Karim Brokerage 5-min decay & auto-reassignment)
export class PropTechBrokerRouter {
  static routeLead({ buyerName, buyerPhone, propertyId, propertyTitle, budgetEGP }) {
    const broker = BROKERS_CATALOG[0]; // Primary assigned broker
    const cleanPhone = broker.phone.replace(/[^\d]/g, "");
    const message = `مرحباً كابتن ${broker.name}، لدينا عميل جديد مهتم بالعقار: ${propertyTitle} (ميزانية: ${Number(budgetEGP).toLocaleString()} ج.م). بيانات العميل: ${buyerName} - ${buyerPhone}. يرجى المتابعة وتحديث البورتال.`;
    const whatsappDeepLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

    return {
      leadId: `lead-${Date.now()}`,
      buyerName,
      buyerPhone,
      propertyId,
      propertyTitle,
      budgetEGP,
      brokerId: broker.id,
      brokerName: broker.name,
      whatsappDeepLink,
      contacted: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes decay limit
    };
  }

  static reassignIfStale(lead) {
    if (!lead.contacted && new Date(lead.expiresAt) <= new Date()) {
      const nextBroker = BROKERS_CATALOG[1]; // Failover to second broker
      const cleanPhone = nextBroker.phone.replace(/[^\d]/g, "");
      const message = `[إعادة توجيه عاجل لعدم الرد خلال 10 دقائق] مرحباً كابتن ${nextBroker.name}، تم تحويل العميل إليك: ${lead.propertyTitle}. بيانات العميل: ${lead.buyerName} - ${lead.buyerPhone}.`;
      return {
        ...lead,
        brokerId: nextBroker.id,
        brokerName: nextBroker.name,
        whatsappDeepLink: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
        reassigned: true,
        reassignedAt: new Date().toISOString()
      };
    }
    return lead;
  }

  static verifyProofOfContact(lead, { eventType, durationSeconds }) {
    if (eventType === "WHATSAPP_REPLY_WEBHOOK" || (eventType === "BRIDGE_CALL" && Number(durationSeconds) >= 30)) {
      return {
        ...lead,
        contacted: true,
        contactMethod: eventType,
        contactProofVerified: true,
        disarmedAt: new Date().toISOString(),
        notes: `10-minute decay watchdog disarmed via verified ${eventType} event.`
      };
    }
    throw new Error("Proof of contact rejected: Requires two-way WhatsApp webhook reply or verified call >= 30s.");
  }
}

/**
 * Cross-Merchant COD Risk & Shipping-Fee Micro-Deposit Engine (Digitology 2026 Operator Pattern)
 * Demands a 50 EGP non-refundable shipping deposit via InstaPay/Fawry on high-risk COD orders,
 * reducing doorstep courier refusals from 35% down to <2%.
 */
export class CrossMerchantCodRiskEngine {
  static evaluateRiskAndDetermineDeposit({ buyerPhone, grossPiasters, priorRefusalCount = 0 }) {
    const isHighTicket = Number(grossPiasters) >= 150000; // >= 1,500 EGP
    const hasPriorRefusal = Number(priorRefusalCount) > 0;
    const isHighRisk = isHighTicket || hasPriorRefusal;

    const microDepositRequired = isHighRisk;
    const microDepositEgp = isHighRisk ? 50 : 0;
    const microDepositPiasters = microDepositEgp * 100;

    return {
      buyerPhone,
      isHighRisk,
      riskReason: hasPriorRefusal
        ? "PRIOR_DOORSTEP_REFUSAL_DETECTED"
        : isHighTicket
        ? "HIGH_TICKET_COD_VALUE"
        : "LOW_RISK_VERIFIED",
      microDepositRequired,
      microDepositEgp,
      microDepositPiasters,
      acceptedRails: ["INSTAPAY", "FAWRY", "VODAFONE_CASH"],
      prepaidDiscountBps: 500
    };
  }
}

// 4. Append-Only Store & Invariant Probe with SQLite Persistence
export class GeenoraStore {
  static _db = null;

  static getDb() {
    if (!this._db) {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this._db = new DatabaseSync(SQLITE_PATH);
      this._db.exec("PRAGMA journal_mode = WAL;");
      this._db.exec("PRAGMA foreign_keys = ON;");

      if (fs.existsSync(SCHEMA_PATH)) {
        const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
        this._db.exec(schema);
      }

      this.seedIfEmpty(this._db);
    }
    return this._db;
  }

  static seedIfEmpty(db) {
    try {
      const prodCount = db.prepare("SELECT COUNT(*) as cnt FROM products").get();
      if (!prodCount || prodCount.cnt === 0) {
        const pStmt = db.prepare("INSERT OR IGNORE INTO products (id, name, price_piasters, merchant_id, stock) VALUES (?, ?, ?, ?, ?)");
        for (const p of PRODUCTS_CATALOG) {
          pStmt.run(p.id, p.name, p.pricePiasters, p.merchantId, p.stock);
        }
      }

      const merchCount = db.prepare("SELECT COUNT(*) as cnt FROM merchants").get();
      if (!merchCount || merchCount.cnt === 0) {
        const mStmt = db.prepare("INSERT OR IGNORE INTO merchants (id, name, payout_account) VALUES (?, ?, ?)");
        mStmt.run("merch-1", "Cairo Artisanal Guild", "EG5000000000000000000000001");
        mStmt.run("merch-2", "Siwa Oasis Organics", "EG5000000000000000000000002");
      }
    } catch (e) {
      console.warn("[Geenora DB Seed Warning]", e.message);
    }
  }

  static getIdempotentResponse(key) {
    const db = this.getDb();
    const row = db.prepare("SELECT response_json FROM idempotency_keys WHERE key = ?").get(key);
    return row ? JSON.parse(row.response_json) : null;
  }

  static saveIdempotentResponse(key, endpoint, response) {
    const db = this.getDb();
    db.prepare(`
      INSERT OR REPLACE INTO idempotency_keys (key, endpoint, response_json)
      VALUES (?, ?, ?)
    `).run(key, endpoint, JSON.stringify(response));
  }

  static appendOutbox(eventType, payload) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO audit_outbox (event_type, payload_json)
      VALUES (?, ?)
    `).run(eventType, JSON.stringify(payload));
  }

  static appendAudit(aggregateType, aggregateId, eventType, payload) {
    const db = this.getDb();
    const last = db.prepare("SELECT signature_sha256 FROM audit_ledger ORDER BY id DESC LIMIT 1").get();
    const prevHash = last ? last.signature_sha256 : "0".repeat(64);
    const payloadStr = JSON.stringify(payload);
    const sig = crypto.createHash("sha256").update(prevHash + payloadStr).digest("hex");
    db.prepare(`
      INSERT INTO audit_ledger (aggregate_type, aggregate_id, event_type, payload_json, prev_hash, signature_sha256)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(aggregateType, aggregateId, eventType, payloadStr, prevHash, sig);
  }

  static insertOrder(order) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO orders (order_id, buyer_phone, merchant_id, product_id, quantity, gross_piasters, platform_take_rate_piasters, net_merchant_piasters, state, funds_released)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.orderId,
      order.buyerPhone,
      order.merchantId,
      order.productId,
      order.quantity,
      order.grossPiasters,
      order.platformTakeRatePiasters,
      order.netMerchantPiasters,
      order.state || "ESCROW_LOCKED",
      order.fundsReleased ? 1 : 0
    );

    this.appendOutbox("ORDER_CREATED", order);
    this.appendAudit("ORDER", order.orderId, "ORDER_CREATED", order);

    const store = this.load();
    store.orders = store.orders || [];
    store.orders.push(order);
    this.save(store);
  }

  static updateOrder(order) {
    const db = this.getDb();
    db.prepare(`
      UPDATE orders
      SET state = ?, funds_released = ?
      WHERE order_id = ?
    `).run(order.state, order.fundsReleased ? 1 : 0, order.orderId);

    this.appendOutbox("ORDER_STATE_CHANGED", order);
    this.appendAudit("ORDER", order.orderId, "ORDER_STATE_CHANGED", order);

    const store = this.load();
    const idx = (store.orders || []).findIndex(o => o.orderId === order.orderId);
    if (idx !== -1) {
      store.orders[idx] = order;
      this.save(store);
    }
  }

  static insertLead(lead) {
    const db = this.getDb();
    db.prepare(`
      INSERT INTO proptech_leads (lead_id, buyer_name, buyer_phone, property_id, property_title, budget_egp, broker_name, whatsapp_deep_link, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lead.leadId,
      lead.buyerName,
      lead.buyerPhone,
      lead.propertyId,
      lead.propertyTitle,
      lead.budgetEGP,
      lead.brokerName,
      lead.whatsappDeepLink,
      lead.contacted ? "CONTACTED" : "NEW"
    );

    this.appendOutbox("PROPTECH_LEAD_ROUTED", lead);
    this.appendAudit("LEAD", lead.leadId, "LEAD_ROUTED", lead);

    const store = this.load();
    store.proptechLeads = store.proptechLeads || [];
    store.proptechLeads.push(lead);
    this.save(store);
  }

  static updateLead(lead) {
    const db = this.getDb();
    db.prepare(`
      UPDATE proptech_leads
      SET broker_name = ?, whatsapp_deep_link = ?, status = ?
      WHERE lead_id = ?
    `).run(lead.brokerName, lead.whatsappDeepLink, lead.contacted ? "CONTACTED" : (lead.reassigned ? "REASSIGNED" : "NEW"), lead.leadId);

    const store = this.load();
    const idx = (store.proptechLeads || []).findIndex(l => l.leadId === lead.leadId);
    if (idx !== -1) {
      store.proptechLeads[idx] = lead;
      this.save(store);
    }
  }

  static load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
      }
    } catch {}
    return {
      version: 1,
      orders: [],
      proptechLeads: []
    };
  }

  static save(store) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  }

  static verifyInvariants() {
    const store = this.load();
    let totalGross = 0;
    let totalLocked = 0;
    let totalReleased = 0;
    let totalFees = 0;

    for (const order of (store.orders || [])) {
      totalGross += order.grossPiasters;
      totalFees += order.platformTakeRatePiasters;
      if (order.state === "ESCROW_LOCKED" || order.state === "COD_CONFIRMATION_PENDING" || order.state === "COD_DISPATCHED") {
        totalLocked += order.netMerchantPiasters;
      } else if (order.state === "DELIVERED") {
        totalReleased += order.netMerchantPiasters;
      }
    }

    const leakagePiasters = totalGross - (totalLocked + totalReleased + totalFees);
    return {
      status: leakagePiasters === 0 ? "PASS" : "FAIL",
      totalOrders: (store.orders || []).length,
      totalGrossPiasters: totalGross,
      totalLockedEscrowPiasters: totalLocked,
      totalReleasedPayoutsPiasters: totalReleased,
      totalPlatformFeesPiasters: totalFees,
      leakagePiasters
    };
  }
}
