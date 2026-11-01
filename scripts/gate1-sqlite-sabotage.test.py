import sqlite3
import sys
import os
import uuid

db_path = os.path.join(os.path.dirname(__file__), "..", "data", "geenora.sqlite")
schema_path = os.path.join(os.path.dirname(__file__), "..", "schema.sql")

os.makedirs(os.path.dirname(db_path), exist_ok=True)
con = sqlite3.connect(db_path)
con.execute("PRAGMA foreign_keys = ON;")

if os.path.exists(schema_path):
    with open(schema_path, "r", encoding="utf-8") as f:
        con.executescript(f.read())

# Ensure canonical seeds exist
prod_count = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
if prod_count == 0:
    products = [
        ("prod-1", "Premium Egyptian Cotton Bedding Set", 125000, "merch-1", 25),
        ("prod-2", "Artisanal Handmade Brass Lantern", 85000, "merch-1", 40),
        ("prod-3", "Organic Siwa Olive Oil 1L", 42000, "merch-2", 100)
    ]
    con.executemany("INSERT OR IGNORE INTO products (id, name, price_piasters, merchant_id, stock) VALUES (?, ?, ?, ?, ?)", products)

merch_count = con.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
if merch_count == 0:
    merchants = [
        ("merch-1", "Cairo Artisanal Guild", "EG5000000000000000000000001"),
        ("merch-2", "Siwa Oasis Organics", "EG5000000000000000000000002")
    ]
    con.executemany("INSERT OR IGNORE INTO merchants (id, name, payout_account) VALUES (?, ?, ?)", merchants)
con.commit()

passed = 0
failed = 0

print("=== GEENORA & URBANA MARKETPLACE: GATE 1 RAW SQLITE SABOTAGE TEST ===")

# --- TEST 1: Negative/Zero price_piasters CHECK Constraint Sabotage ---
print("\n[TEST 1] Attempting to insert price_piasters = 0 into products...")
try:
    con.execute("""
        INSERT INTO products (id, name, price_piasters, merchant_id, stock)
        VALUES ('prod-sabotage-zero', 'Illegal Zero Price Item', 0, 'merch-1', 10)
    """)
    con.commit()
    print("FAILED: price_piasters = 0 was accepted! CHECK constraint failed.")
    failed += 1
except sqlite3.IntegrityError as e:
    print(f"PASSED: SQLite engine rejected insertion as expected: {e}")
    passed += 1

# --- TEST 2: Zero or Negative quantity CHECK Constraint Sabotage ---
print("\n[TEST 2] Attempting to insert quantity = 0 into orders...")
try:
    con.execute("""
        INSERT INTO orders (order_id, buyer_phone, merchant_id, product_id, quantity, gross_piasters, platform_take_rate_piasters, net_merchant_piasters, state, funds_released)
        VALUES ('ord-sabotage-qty', '+201012345678', 'merch-1', 'prod-1', 0, 125000, 18750, 106250, 'ESCROW_LOCKED', 0)
    """)
    con.commit()
    print("FAILED: quantity = 0 was accepted! CHECK constraint failed.")
    failed += 1
except sqlite3.IntegrityError as e:
    print(f"PASSED: SQLite engine rejected insertion as expected: {e}")
    passed += 1

# --- TEST 3: Foreign Key Constraint Sabotage (Non-existent product_id) ---
print("\n[TEST 3] Attempting to insert orphan order referencing non-existent product...")
try:
    con.execute("""
        INSERT INTO orders (order_id, buyer_phone, merchant_id, product_id, quantity, gross_piasters, platform_take_rate_piasters, net_merchant_piasters, state, funds_released)
        VALUES ('ord-sabotage-orphan', '+201012345678', 'merch-1', 'non-existent-product-id', 1, 125000, 18750, 106250, 'ESCROW_LOCKED', 0)
    """)
    con.commit()
    print("FAILED: Orphan order was accepted! Foreign key constraint failed.")
    failed += 1
except sqlite3.IntegrityError as e:
    print(f"PASSED: SQLite engine rejected insertion as expected: {e}")
    passed += 1

# Unique IDs for trigger tests
test_run_id = uuid.uuid4().hex[:8]
order_id = f"ord-sabotage-{test_run_id}"
audit_id = f"audit-sabotage-{test_run_id}"

# --- TEST 4: Append-Only Trigger Sabotage (DELETE Blocked on orders) ---
print("\n[TEST 4] Inserting valid order, then attempting DELETE...")
con.execute("""
    INSERT INTO orders (order_id, buyer_phone, merchant_id, product_id, quantity, gross_piasters, platform_take_rate_piasters, net_merchant_piasters, state, funds_released)
    VALUES (?, '+201012345678', 'merch-1', 'prod-1', 1, 125000, 18750, 106250, 'ESCROW_LOCKED', 0)
""", (order_id,))
con.commit()

try:
    con.execute("DELETE FROM orders WHERE order_id = ?", (order_id,))
    con.commit()
    print("FAILED: Order was deleted! Immutability trigger failed.")
    failed += 1
except sqlite3.DatabaseError as e:
    if "ORDER_IMMUTABLE" in str(e):
        print(f"PASSED: SQLite BEFORE DELETE trigger successfully blocked order deletion: {e}")
        passed += 1
    else:
        print(f"FAILED: Unexpected error: {e}")
        failed += 1

# --- TEST 5: Append-Only Trigger Sabotage (DELETE Blocked on audit_ledger) ---
print("\n[TEST 5] Inserting valid audit record, then attempting DELETE...")
con.execute("""
    INSERT INTO audit_ledger (aggregate_type, aggregate_id, event_type, payload_json, prev_hash, signature_sha256)
    VALUES ('ESCROW', ?, 'TEST_AUDIT', '{"test": true}', '0000000000000000000000000000000000000000000000000000000000000000', 'mock_hash')
""", (audit_id,))
con.commit()

row = con.execute("SELECT id FROM audit_ledger WHERE aggregate_id = ?", (audit_id,)).fetchone()
inserted_audit_pk = row[0]

try:
    con.execute("DELETE FROM audit_ledger WHERE id = ?", (inserted_audit_pk,))
    con.commit()
    print("FAILED: Audit record was deleted! Immutability trigger failed.")
    failed += 1
except sqlite3.DatabaseError as e:
    if "AUDIT_LEDGER_IMMUTABLE" in str(e):
        print(f"PASSED: SQLite BEFORE DELETE trigger successfully blocked audit deletion: {e}")
        passed += 1
    else:
        print(f"FAILED: Unexpected error: {e}")
        failed += 1

con.close()

print(f"\nGate 1 Verification Summary: {passed} PASSED, {failed} FAILED.")
if failed > 0:
    sys.exit(1)
print("ALL GATE 1 SQLITE SABOTAGE PROOFS VERIFIED WITH EXIT CODE 0.")
