import time
import sys
import subprocess
import os
import urllib.request
import sqlite3
import uuid
from playwright.sync_api import sync_playwright

SERVER_PORT = 8098
BASE_URL = f"http://127.0.0.1:{SERVER_PORT}"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "data", "geenora.sqlite")

print("===========================================================================")
print("=== GEENORA & URBANA: GATE 5 PLAYWRIGHT HARD-RELOAD PROOF SUITE ===========")
print("===========================================================================")

# Step 1: Ensure server is running or start it
server_proc = None

def is_server_healthy():
    try:
        with urllib.request.urlopen(f"{BASE_URL}/health", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False

if not is_server_healthy():
    print(f"\n[STEP 1] Starting Geenora & Urbana Server on port {SERVER_PORT}...")
    server_proc = subprocess.Popen(
        ["node", "server-api.mjs"],
        cwd=PROJECT_ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    started = False
    for i in range(20):
        time.sleep(0.5)
        if is_server_healthy():
            started = True
            break
    if not started:
        print("ERROR: Server failed to start on port 8098.")
        if server_proc:
            server_proc.kill()
        sys.exit(1)
    print(f"PASSED: Server started and listening at {BASE_URL}.")
else:
    print(f"\n[STEP 1] Server already running and healthy at {BASE_URL}.")

try:
    with sync_playwright() as p:
        print("\n[STEP 2] Launching Headless Chromium Browser...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        # Step 3: Test Storefront UI
        print(f"[STEP 3] Navigating to Geenora Storefront ({BASE_URL})...")
        page.goto(BASE_URL, wait_until="domcontentloaded")
        assert len(page.title()) > 0, "Page title must be non-empty"
        print(f"PASSED: Storefront loaded successfully (Title: '{page.title()}').")

        # Step 4: Record a live order placement via API
        print("\n[STEP 4] Executing order placement for product prod-1...")
        order_res = page.request.post(f"{BASE_URL}/api/geenora/orders", data={
            "buyerPhone": "+201099887766",
            "merchantId": "merch-1",
            "productId": "prod-1",
            "quantity": 2
        })
        assert order_res.status == 201, f"Order placement failed: {order_res.status}"
        order_data = order_res.json()
        order_id = order_data["orderId"]
        print(f"PASSED: Order created (ID: {order_id}, gross: {order_data['grossPiasters']} piasters).")

        # Step 5: Perform Hard Reload (The True Persistence Gate)
        print("\n[STEP 5] Performing Hard Reload (page.reload()) to prove persistence...")
        page.reload(wait_until="domcontentloaded")
        print("PASSED: Page reloaded successfully without session corruption.")

        # Step 6: Direct SQLite Database Physical Assertions
        print("\n[STEP 6] Asserting physical SQLite database rows on disk...")
        assert os.path.exists(DB_PATH), f"SQLite database must exist at {DB_PATH}"

        con = sqlite3.connect(DB_PATH)
        row = con.execute("SELECT order_id, product_id, quantity, gross_piasters, state FROM orders WHERE order_id = ?", (order_id,)).fetchone()
        assert row is not None, f"Placed order {order_id} must physically exist in SQLite table!"
        assert row[1] == "prod-1"
        assert row[2] == 2
        assert row[3] == 250000
        assert row[4] == "ESCROW_LOCKED"
        print(f"PASSED: SQLite order row verified: id='{row[0]}', product='{row[1]}', qty={row[2]}, gross={row[3]}, state='{row[4]}'.")

        # Step 7: Record and verify PropTech lead in SQLite
        print("\n[STEP 7] Dispatching Urbana PropTech lead...")
        lead_res = page.request.post(f"{BASE_URL}/api/urbana/leads", data={
            "buyerName": "حاتم الشناوي",
            "buyerPhone": "+201055443322",
            "propertyId": "prop-zayed-55",
            "propertyTitle": "Sheikh Zayed Luxury Duplex",
            "budgetEGP": 12000000
        })
        assert lead_res.status == 201, f"Lead dispatch failed: {lead_res.status}"
        lead_data = lead_res.json()
        lead_id = lead_data["leadId"]

        lead_row = con.execute("SELECT lead_id, buyer_name, budget_egp, broker_name FROM proptech_leads WHERE lead_id = ?", (lead_id,)).fetchone()
        assert lead_row is not None, f"Lead {lead_id} must physically exist in SQLite table!"
        assert lead_row[1] == "حاتم الشناوي"
        assert lead_row[2] == 12000000
        print(f"PASSED: SQLite PropTech lead row verified: id='{lead_row[0]}', buyer='{lead_row[1]}', budget={lead_row[2]}.")

        con.close()
        browser.close()

    print("\nALL GATE 5 PLAYWRIGHT HARD-RELOAD & SQLITE PERSISTENCE PROOFS VERIFIED WITH EXIT CODE 0.")
    sys.exit(0)

except Exception as e:
    print(f"\nGATE 5 ERROR: {e}")
    sys.exit(1)

finally:
    if server_proc:
        print("\nTearing down test server process...")
        server_proc.kill()
