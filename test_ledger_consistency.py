#!/usr/bin/env python3
"""
Verify stock ledger consistency
"""

import requests

BASE_URL = "https://warehouse-ops-125.preview.emergentagent.com/api"

# Login as admin
session = requests.Session()
resp = session.post(f"{BASE_URL}/auth/login", json={
    "email": "admin@stockcontrol.com",
    "password": "admin123"
}, timeout=10)

if resp.status_code != 200:
    print(f"❌ Login failed: {resp.status_code}")
    exit(1)

print(f"✅ Logged in")

# Get dashboard stats
print("\n=== Dashboard Stats ===")
resp = session.get(f"{BASE_URL}/dashboard", timeout=10)
if resp.status_code == 200:
    data = resp.json()
    stats = data.get("stats", {})
    dashboard_total = stats.get("totalUnits", 0)
    print(f"Dashboard totalUnits: {dashboard_total}")
else:
    print(f"❌ Dashboard failed: {resp.status_code}")
    exit(1)

# Get stock on hand
print("\n=== Stock on Hand ===")
resp = session.get(f"{BASE_URL}/stock", timeout=10)
if resp.status_code == 200:
    stock_rows = resp.json()
    stock_total = sum(row.get("qty", 0) for row in stock_rows)
    print(f"Stock rows: {len(stock_rows)}")
    print(f"Stock total: {stock_total}")
else:
    print(f"❌ Stock query failed: {resp.status_code}")
    exit(1)

# Get ledger entries
print("\n=== Ledger Entries ===")
resp = session.get(f"{BASE_URL}/ledger?limit=1000", timeout=10)
if resp.status_code == 200:
    ledger = resp.json()
    ledger_total = sum(entry.get("qty", 0) for entry in ledger)
    print(f"Ledger entries: {len(ledger)}")
    print(f"Ledger total (sum of signed qty): {ledger_total}")
    
    # Count by txnType
    by_type = {}
    for entry in ledger:
        txn_type = entry.get("txnType")
        by_type[txn_type] = by_type.get(txn_type, 0) + entry.get("qty", 0)
    
    print(f"\nLedger by txnType:")
    for txn_type, total in sorted(by_type.items()):
        print(f"  {txn_type}: {total}")
else:
    print(f"❌ Ledger query failed: {resp.status_code}")
    exit(1)

# Verify consistency
print("\n=== Consistency Check ===")
if dashboard_total == stock_total == ledger_total:
    print(f"✅ CONSISTENT: Dashboard ({dashboard_total}) = Stock ({stock_total}) = Ledger ({ledger_total})")
else:
    print(f"❌ INCONSISTENT:")
    print(f"   Dashboard: {dashboard_total}")
    print(f"   Stock: {stock_total}")
    print(f"   Ledger: {ledger_total}")

# Check receiving entries
print("\n=== Receiving Entries ===")
receiving_entries = [e for e in ledger if e.get("txnType") == "RECEIVING"]
print(f"Total RECEIVING entries: {len(receiving_entries)}")
print(f"Total RECEIVING qty: {sum(e.get('qty', 0) for e in receiving_entries)}")

# Sample recent receiving entries
print(f"\nRecent RECEIVING entries:")
for entry in receiving_entries[-5:]:
    print(f"  {entry['refNumber']}: {entry['item']['sku']} qty={entry['qty']} @ {entry['location']['code']}")
