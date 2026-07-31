#!/usr/bin/env python3
"""
Simple test to isolate receiving issues
"""

import requests
import json

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

# Get warehouse and items
meta_resp = session.get(f"{BASE_URL}/meta", timeout=10)
meta = meta_resp.json()
warehouse_id = meta["warehouses"][0]["id"]

items_resp = session.get(f"{BASE_URL}/items", timeout=10)
items = items_resp.json()
non_serial_item = next((i for i in items if not i.get("serialTracked")), None)
serial_item = next((i for i in items if i.get("serialTracked")), None)

print(f"Warehouse ID: {warehouse_id}")
print(f"Non-serial item: {non_serial_item['sku']}")
print(f"Serial item: {serial_item['sku']}")

# Test 1: Create draft
print("\n=== Test 1: Create draft ===")
resp = session.post(f"{BASE_URL}/receiving", json={
    "warehouseId": warehouse_id,
    "supplier": "Simple Test"
}, timeout=10)

if resp.status_code == 201:
    draft = resp.json()
    draft_id = draft["id"]
    print(f"✅ Draft created: {draft['grnNumber']}")
else:
    print(f"❌ Draft creation failed: {resp.status_code} - {resp.text}")
    exit(1)

# Test 2: Update draft with lines (this is where timeout happens)
print("\n=== Test 2: Update draft with lines ===")
resp = session.put(f"{BASE_URL}/receiving/{draft_id}", json={
    "lines": [
        {
            "itemId": non_serial_item["id"],
            "expectedQty": 10,
            "unitCost": 5
        }
    ]
}, timeout=15)

if resp.status_code == 200:
    updated = resp.json()
    print(f"✅ Draft updated with {len(updated['lines'])} lines")
else:
    print(f"❌ Draft update failed: {resp.status_code} - {resp.text}")
    exit(1)

# Test 3: Start receiving
print("\n=== Test 3: Start receiving ===")
resp = session.post(f"{BASE_URL}/receiving/{draft_id}/start", timeout=10)

if resp.status_code == 200:
    started = resp.json()
    print(f"✅ Receiving started: {started['status']}")
else:
    print(f"❌ Start failed: {resp.status_code} - {resp.text}")
    exit(1)

# Test 4: Post receiving
print("\n=== Test 4: Post receiving ===")
line_id = started["lines"][0]["id"]
resp = session.post(f"{BASE_URL}/receiving/{draft_id}/post", json={
    "lines": [
        {
            "lineId": line_id,
            "receivedQty": 10
        }
    ]
}, timeout=15)

if resp.status_code == 200:
    posted = resp.json()
    print(f"✅ Receiving posted: {posted['status']}")
    
    # Check ledger
    ledger_resp = session.get(f"{BASE_URL}/ledger?limit=5", timeout=10)
    ledger = ledger_resp.json()
    print(f"✅ Latest ledger entries: {len(ledger)}")
    for entry in ledger[:2]:
        print(f"  {entry['txnType']}: {entry['item']['sku']} qty={entry['qty']} @ {entry['location']['code']}")
else:
    print(f"❌ Post failed: {resp.status_code} - {resp.text}")
    exit(1)

print("\n✅ All simple tests passed")
