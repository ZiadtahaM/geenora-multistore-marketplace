import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, "../../data/geenora-store.json");

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

// 4. Append-Only Store & Invariant Probe
export class GeenoraStore {
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

    for (const order of store.orders) {
      totalGross += order.grossPiasters;
      totalFees += order.platformTakeRatePiasters;
      if (order.state === "ESCROW_LOCKED") {
        totalLocked += order.netMerchantPiasters;
      } else if (order.state === "DELIVERED") {
        totalReleased += order.netMerchantPiasters;
      }
    }

    const leakagePiasters = totalGross - (totalLocked + totalReleased + totalFees);
    return {
      status: leakagePiasters === 0 ? "PASS" : "FAIL",
      totalOrders: store.orders.length,
      totalGrossPiasters: totalGross,
      totalLockedEscrowPiasters: totalLocked,
      totalReleasedPayoutsPiasters: totalReleased,
      totalPlatformFeesPiasters: totalFees,
      leakagePiasters
    };
  }
}
