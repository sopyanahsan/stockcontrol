#!/usr/bin/env python3
"""
Test serial number duplicate validation
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

# Get warehouse and serial-tracked item
meta_resp = session.get(f"{BASE_URL}/meta", timeout=10)
meta = meta_resp.json()
warehouse_id = meta["warehouses"][0]["id"]

items_resp = session.get(f"{BASE_URL}/items", timeout=10)
items = items_resp.json()
serial_item = next((i for i in items if i.get("serialTracked")), None)

if not serial_item:
    print(f"❌ No serial-tracked item found")
    exit(1)

print(f"Serial item: {serial_item['sku']}")

# Check if SN-TEST-001 exists
print("\n=== Checking if SN-TEST-001 exists ===")
barcode_resp = session.get(f"{BASE_URL}/barcode?code=SN-TEST-001", timeout=10)
if barcode_resp.status_code == 200:
    result = barcode_resp.json()
    if result.get("type") == "SERIAL":
        print(f"✅ SN-TEST-001 exists: status={result['serial']['status']}")
        serial_exists = True
    else:
        print(f"⚠️  SN-TEST-001 does not exist")
        serial_exists = False
else:
    print(f"❌ Barcode lookup failed: {barcode_resp.status_code}")
    exit(1)

# Create a new receiving with serial-tracked item
print("\n=== Creating receiving with serial-tracked item ===")
resp = session.post(f"{BASE_URL}/receiving", json={
    "warehouseId": warehouse_id,
    "supplier": "Serial Validation Test",
    "lines": [
        {
            "itemId": serial_item["id"],
            "expectedQty": 2,
            "unitCost": 10
        }
    ]
}, timeout=10)

if resp.status_code != 201:
    print(f"❌ Receiving creation failed: {resp.status_code}")
    exit(1)

draft = resp.json()
draft_id = draft["id"]
line_id = draft["lines"][0]["id"]
print(f"✅ Draft created: {draft['grnNumber']}")

# Start receiving
resp = session.post(f"{BASE_URL}/receiving/{draft_id}/start", timeout=10)
if resp.status_code != 200:
    print(f"❌ Start failed: {resp.status_code}")
    exit(1)
print(f"✅ Receiving started")

# Test: Try to post with existing serial SN-TEST-001
if serial_exists:
    print("\n=== Test: Posting with existing serial SN-TEST-001 (should be 400) ===")
    resp = session.post(f"{BASE_URL}/receiving/{draft_id}/post", json={
        "lines": [
            {
                "lineId": line_id,
                "receivedQty": 2,
                "serials": ["SN-TEST-001", "SN-NEW-UNIQUE"]
            }
        ]
    }, timeout=15)
    
    if resp.status_code == 400:
        print(f"✅ Duplicate serial correctly rejected (400)")
        print(f"   Error: {resp.json().get('error', 'N/A')}")
    else:
        print(f"❌ Expected 400, got {resp.status_code}")
        print(f"   Response: {resp.text}")
        
        # This is a bug - the duplicate serial validation is not working
        print("\n🐛 BUG FOUND: Duplicate serial validation is not working!")
else:
    print("\n⚠️  Cannot test duplicate serial validation - SN-TEST-001 does not exist")
    
    # Create a new serial first
    print("\n=== Creating new serial SN-UNIQUE-001 ===")
    resp = session.post(f"{BASE_URL}/receiving/{draft_id}/post", json={
        "lines": [
            {
                "lineId": line_id,
                "receivedQty": 2,
                "serials": ["SN-UNIQUE-001", "SN-UNIQUE-002"]
            }
        ]
    }, timeout=15)
    
    if resp.status_code == 200:
        print(f"✅ Receiving posted successfully")
    else:
        print(f"❌ Post failed: {resp.status_code} - {resp.text}")
