# UBIQUITOUS LANGUAGE: GEENORA MARKETPLACE & PROPTECH ESCROW OS
*Domain 6: E-Commerce, Multi-Vendor Marketplaces & PropTech*
*Standard: ANTIGRAVITY-SPEC-V2 | DDD Level 3*

---

## 1. Core Domain Glossary

### MarketplaceOrder (طلب المنصة)
- **Definition**: Commercial transaction between a buyer and one or more independent merchants.
- **Attributes**: `orderId`, `buyerPhone`, `merchantId`, `grossPiasters`, `platformTakeRateBps` (1500 bps = 15%), `netMerchantPiasters`, `state`.

### OrderState Lifecycle
- `PLACED`: Customer created order; payment authorized.
- `ESCROW_LOCKED`: Funds held securely in escrow vault; merchant notified to fulfill.
- `SHIPPED`: Goods in transit via carrier.
- `DELIVERED`: Goods delivered and confirmed by buyer; escrow releases funds to merchant payout balance.
- `REFUNDED`: Order cancelled before delivery; full escrow returned to buyer.

### TakeRateBasisPoints (عمولة المنصة)
- **Definition**: The platform fee expressed in integer basis points (1% = 100 bps). Never floating point.

### EscrowConservationEquation (معادلة حفظ أموال الضمان)
- **Formula**:
  $$\text{Total Gross Inflow} = \text{Locked Escrow} + \text{Released Merchant Payouts} + \text{Retained Platform Fees} + \text{Refunds}$$
  *Invariant: Zero financial leakage ($E = 0$).*

### PropTechLead (استفسار عقاري)
- **Definition**: Qualified property buyer inquiry routed to an accredited broker with Click-to-WhatsApp deep linking.
