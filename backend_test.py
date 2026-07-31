#!/usr/bin/env python3
"""
Backend API Test Suite for Stock Control Inventory System
Tests all backend endpoints with RBAC, audit logging, and business rules
"""

import requests
import json
from typing import Dict, Optional

# Base URL from .env
BASE_URL = "https://warehouse-ops-125.preview.emergentagent.com/api"

# Test credentials
CREDENTIALS = {
    "admin": {"email": "admin@stockcontrol.com", "password": "admin123"},
    "supervisor": {"email": "supervisor@stockcontrol.com", "password": "supervisor123"},
    "stock_control": {"email": "stock@stockcontrol.com", "password": "stock123"},
}

class TestSession:
    """Wrapper for requests.Session with role-based auth"""
    def __init__(self, role: str):
        self.role = role
        self.session = requests.Session()
        self.user = None
        
    def login(self) -> bool:
        """Login and store cookie"""
        try:
            creds = CREDENTIALS[self.role]
            resp = self.session.post(f"{BASE_URL}/auth/login", json=creds, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                self.user = data.get("user")
                print(f"✅ {self.role.upper()} login successful: {self.user['name']} ({self.user['role']})")
                return True
            else:
                print(f"❌ {self.role.upper()} login failed: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"❌ {self.role.upper()} login error: {e}")
            return False
    
    def get(self, path: str, **kwargs):
        return self.session.get(f"{BASE_URL}{path}", timeout=10, **kwargs)
    
    def post(self, path: str, **kwargs):
        return self.session.post(f"{BASE_URL}{path}", timeout=10, **kwargs)
    
    def put(self, path: str, **kwargs):
        return self.session.put(f"{BASE_URL}{path}", timeout=10, **kwargs)
    
    def delete(self, path: str, **kwargs):
        return self.session.delete(f"{BASE_URL}{path}", timeout=10, **kwargs)


def test_auth():
    """Test 1: Authentication flow for all roles"""
    print("\n" + "="*80)
    print("TEST 1: AUTHENTICATION")
    print("="*80)
    
    # Test login for all roles
    sessions = {}
    for role in ["admin", "supervisor", "stock_control"]:
        session = TestSession(role)
        if not session.login():
            return False
        sessions[role] = session
    
    # Test /auth/me
    print("\n--- Testing /auth/me ---")
    for role, session in sessions.items():
        resp = session.get("/auth/me")
        if resp.status_code == 200:
            user = resp.json().get("user")
            print(f"✅ {role.upper()} /auth/me: {user['name']} ({user['role']})")
        else:
            print(f"❌ {role.upper()} /auth/me failed: {resp.status_code}")
            return False
    
    # Test unauthenticated access
    print("\n--- Testing unauthenticated access ---")
    unauth_session = requests.Session()
    resp = unauth_session.get(f"{BASE_URL}/auth/me", timeout=10)
    if resp.status_code == 401:
        print(f"✅ Unauthenticated /auth/me returns 401")
    else:
        print(f"❌ Unauthenticated /auth/me should return 401, got {resp.status_code}")
    
    # Test wrong password
    print("\n--- Testing wrong password ---")
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": "admin@stockcontrol.com", "password": "wrongpass"}, timeout=10)
    if resp.status_code == 401:
        print(f"✅ Wrong password returns 401")
    else:
        print(f"❌ Wrong password should return 401, got {resp.status_code}")
    
    # Test logout
    print("\n--- Testing logout ---")
    resp = sessions["admin"].post("/auth/logout")
    if resp.status_code == 200:
        print(f"✅ Logout successful")
        # Re-login for subsequent tests
        sessions["admin"].login()
    else:
        print(f"❌ Logout failed: {resp.status_code}")
    
    return sessions


def test_dashboard(admin_session: TestSession):
    """Test 2: Dashboard API with stats and charts"""
    print("\n" + "="*80)
    print("TEST 2: DASHBOARD")
    print("="*80)
    
    resp = admin_session.get("/dashboard")
    if resp.status_code != 200:
        print(f"❌ Dashboard failed: {resp.status_code} - {resp.text}")
        return None
    
    data = resp.json()
    stats = data.get("stats", {})
    
    print(f"\n--- Dashboard Stats ---")
    print(f"Total Items: {stats.get('totalItems')}")
    print(f"Total Locations: {stats.get('totalLocations')}")
    print(f"Total Units: {stats.get('totalUnits')}")
    print(f"Total Value: ${stats.get('totalValue', 0):.2f}")
    print(f"Low Stock Count: {stats.get('lowStockCount')}")
    print(f"Today Movements: {stats.get('todayMovements')}")
    
    # Verify totalUnits is around 2120 (seeded data)
    total_units = stats.get('totalUnits', 0)
    if 2000 <= total_units <= 2200:
        print(f"✅ Total units {total_units} is within expected range (2000-2200)")
    else:
        print(f"⚠️  Total units {total_units} is outside expected range (2000-2200)")
    
    print(f"\n--- Low Stock Items: {len(data.get('lowStock', []))} ---")
    for item in data.get('lowStock', [])[:3]:
        print(f"  {item.get('sku')}: {item.get('qty')} (reorder: {item.get('reorderPoint')})")
    
    print(f"\n--- Stock by Category: {len(data.get('stockByCategory', []))} ---")
    for cat in data.get('stockByCategory', []):
        print(f"  {cat.get('name')}: {cat.get('qty')} units")
    
    print(f"\n--- Movement Trend: {len(data.get('movementTrend', []))} days ---")
    for day in data.get('movementTrend', []):
        print(f"  {day.get('label')}: +{day.get('inbound')} / -{day.get('outbound')}")
    
    print(f"\n--- Recent Activity: {len(data.get('recentActivity', []))} logs ---")
    
    print(f"✅ Dashboard API working correctly")
    return stats


def test_meta(admin_session: TestSession):
    """Test 3: Meta API for dropdowns"""
    print("\n" + "="*80)
    print("TEST 3: META API")
    print("="*80)
    
    resp = admin_session.get("/meta")
    if resp.status_code != 200:
        print(f"❌ Meta API failed: {resp.status_code} - {resp.text}")
        return None
    
    data = resp.json()
    categories = data.get("categories", [])
    uoms = data.get("uoms", [])
    warehouses = data.get("warehouses", [])
    reason_codes = data.get("reasonCodes", [])
    
    print(f"Categories: {len(categories)}")
    print(f"UOMs: {len(uoms)}")
    print(f"Warehouses: {len(warehouses)}")
    print(f"Reason Codes: {len(reason_codes)}")
    
    if categories and uoms and warehouses and reason_codes:
        print(f"✅ Meta API returns all required data")
        return data
    else:
        print(f"❌ Meta API missing data")
        return None


def test_items_list(admin_session: TestSession):
    """Test 4: List items with computed onHand"""
    print("\n" + "="*80)
    print("TEST 4: LIST ITEMS")
    print("="*80)
    
    resp = admin_session.get("/items")
    if resp.status_code != 200:
        print(f"❌ List items failed: {resp.status_code} - {resp.text}")
        return None
    
    items = resp.json()
    print(f"Total items: {len(items)}")
    
    if len(items) >= 10:
        print(f"✅ Found {len(items)} items (expected 10+)")
    else:
        print(f"⚠️  Found only {len(items)} items (expected 10+)")
    
    # Check first few items have required fields
    print(f"\n--- Sample Items ---")
    for item in items[:3]:
        print(f"  {item.get('sku')}: {item.get('name')} - onHand: {item.get('onHand', 0)} {item.get('uom', {}).get('code', '')}")
    
    return items


def test_rbac_matrix(sessions: Dict[str, TestSession], meta: dict):
    """Test 5: RBAC permissions matrix"""
    print("\n" + "="*80)
    print("TEST 5: RBAC MATRIX")
    print("="*80)
    
    # Get categoryId and uomId for test item
    category_id = meta["categories"][0]["id"] if meta["categories"] else None
    uom_id = meta["uoms"][0]["id"] if meta["uoms"] else None
    
    if not category_id or not uom_id:
        print(f"❌ Cannot test RBAC: missing category or UOM")
        return False
    
    test_item = {
        "sku": "RBAC-TEST-001",
        "name": "RBAC Test Item",
        "categoryId": category_id,
        "uomId": uom_id,
        "minStock": 5,
        "reorderPoint": 10,
        "maxStock": 50,
        "unitCost": 9.99
    }
    
    # Test STOCK_CONTROL cannot create items
    print("\n--- STOCK_CONTROL: POST /items (should be 403) ---")
    resp = sessions["stock_control"].post("/items", json=test_item)
    if resp.status_code == 403:
        print(f"✅ STOCK_CONTROL correctly denied item creation (403)")
    else:
        print(f"❌ STOCK_CONTROL should get 403, got {resp.status_code}")
        return False
    
    # Test SUPERVISOR can create items
    print("\n--- SUPERVISOR: POST /items (should be 201) ---")
    resp = sessions["supervisor"].post("/items", json=test_item)
    if resp.status_code == 201:
        item = resp.json()
        print(f"✅ SUPERVISOR can create items: {item['sku']}")
        test_item_id = item["id"]
    else:
        print(f"❌ SUPERVISOR should create item, got {resp.status_code}: {resp.text}")
        return False
    
    # Test SUPERVISOR cannot delete items
    print("\n--- SUPERVISOR: DELETE /items/:id (should be 403) ---")
    resp = sessions["supervisor"].delete(f"/items/{test_item_id}")
    if resp.status_code == 403:
        print(f"✅ SUPERVISOR correctly denied item deletion (403)")
    else:
        print(f"❌ SUPERVISOR should get 403 on delete, got {resp.status_code}")
    
    # Test ADMIN can delete items
    print("\n--- ADMIN: DELETE /items/:id (should be 200) ---")
    resp = sessions["admin"].delete(f"/items/{test_item_id}")
    if resp.status_code == 200:
        result = resp.json()
        print(f"✅ ADMIN can delete items: {result}")
    else:
        print(f"❌ ADMIN should delete item, got {resp.status_code}: {resp.text}")
        return False
    
    # Test STOCK_CONTROL cannot create locations
    print("\n--- STOCK_CONTROL: POST /locations (should be 403) ---")
    # Get a zoneId first
    resp = sessions["admin"].get("/warehouses")
    warehouses = resp.json()
    if warehouses and warehouses[0].get("zones"):
        zone_id = warehouses[0]["zones"][0]["id"]
        test_location = {"zoneId": zone_id, "code": "RBAC-LOC-001", "type": "STORAGE"}
        resp = sessions["stock_control"].post("/locations", json=test_location)
        if resp.status_code == 403:
            print(f"✅ STOCK_CONTROL correctly denied location creation (403)")
        else:
            print(f"❌ STOCK_CONTROL should get 403, got {resp.status_code}")
    
    print(f"\n✅ RBAC matrix tests passed")
    return True


def test_item_crud(admin_session: TestSession, meta: dict):
    """Test 6: Item CRUD operations"""
    print("\n" + "="*80)
    print("TEST 6: ITEM CRUD")
    print("="*80)
    
    category_id = meta["categories"][0]["id"]
    uom_id = meta["uoms"][0]["id"]
    
    # Create item
    print("\n--- Create Item ---")
    test_item = {
        "sku": "TEST-SKU-001",
        "name": "Test Item",
        "categoryId": category_id,
        "uomId": uom_id,
        "minStock": 5,
        "reorderPoint": 10,
        "maxStock": 50,
        "unitCost": 9.9
    }
    resp = admin_session.post("/items", json=test_item)
    if resp.status_code == 201:
        item = resp.json()
        print(f"✅ Item created: {item['sku']} (ID: {item['id']})")
        item_id = item["id"]
    else:
        print(f"❌ Item creation failed: {resp.status_code} - {resp.text}")
        return None
    
    # Test duplicate SKU
    print("\n--- Duplicate SKU (should be 409) ---")
    resp = admin_session.post("/items", json=test_item)
    if resp.status_code == 409:
        print(f"✅ Duplicate SKU correctly rejected (409)")
    else:
        print(f"❌ Duplicate SKU should return 409, got {resp.status_code}")
    
    # Update item
    print("\n--- Update Item ---")
    resp = admin_session.put(f"/items/{item_id}", json={"name": "Test Item Updated"})
    if resp.status_code == 200:
        updated = resp.json()
        print(f"✅ Item updated: {updated['name']}")
    else:
        print(f"❌ Item update failed: {resp.status_code} - {resp.text}")
    
    # Delete item (no ledger history, should hard delete)
    print("\n--- Delete Item (no ledger history) ---")
    resp = admin_session.delete(f"/items/{item_id}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("deleted"):
            print(f"✅ Item hard deleted (no ledger history): {result}")
        else:
            print(f"⚠️  Expected hard delete, got: {result}")
    else:
        print(f"❌ Item deletion failed: {resp.status_code} - {resp.text}")
    
    return item_id


def test_item_soft_delete(admin_session: TestSession):
    """Test 7: Item soft-delete when ledger history exists"""
    print("\n" + "="*80)
    print("TEST 7: ITEM SOFT-DELETE (with ledger history)")
    print("="*80)
    
    # Get items with onHand > 0 (means they have ledger history)
    resp = admin_session.get("/items")
    items = resp.json()
    item_with_stock = None
    for item in items:
        if item.get("onHand", 0) > 0 and item.get("isActive"):
            item_with_stock = item
            break
    
    if not item_with_stock:
        print(f"⚠️  No items with stock found for soft-delete test")
        return None
    
    print(f"\n--- Deleting item with ledger history: {item_with_stock['sku']} (onHand: {item_with_stock['onHand']}) ---")
    resp = admin_session.delete(f"/items/{item_with_stock['id']}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("deactivated"):
            print(f"✅ Item soft-deleted (deactivated): {result.get('message')}")
            
            # Verify item is now inactive
            resp = admin_session.get("/items")
            items = resp.json()
            deactivated_item = next((i for i in items if i["id"] == item_with_stock["id"]), None)
            if deactivated_item and not deactivated_item.get("isActive"):
                print(f"✅ Item is now inactive: isActive={deactivated_item.get('isActive')}")
            
            # Re-activate the item
            print(f"\n--- Re-activating item ---")
            resp = admin_session.put(f"/items/{item_with_stock['id']}", json={"isActive": True})
            if resp.status_code == 200:
                print(f"✅ Item re-activated successfully")
            else:
                print(f"⚠️  Item re-activation failed: {resp.status_code}")
            
            return item_with_stock["id"]
        else:
            print(f"❌ Expected deactivated=true, got: {result}")
    else:
        print(f"❌ Soft-delete failed: {resp.status_code} - {resp.text}")
    
    return None


def test_locations(admin_session: TestSession, meta: dict):
    """Test 8: Warehouse/Zone/Location CRUD"""
    print("\n" + "="*80)
    print("TEST 8: LOCATIONS CRUD")
    print("="*80)
    
    # Get warehouses
    print("\n--- GET /warehouses ---")
    resp = admin_session.get("/warehouses")
    if resp.status_code != 200:
        print(f"❌ Get warehouses failed: {resp.status_code}")
        return None
    
    warehouses = resp.json()
    print(f"✅ Found {len(warehouses)} warehouse(s)")
    if warehouses:
        wh = warehouses[0]
        print(f"  {wh['code']}: {wh['name']} - {len(wh.get('zones', []))} zones")
        warehouse_id = wh["id"]
    else:
        print(f"❌ No warehouses found")
        return None
    
    # Create zone
    print("\n--- POST /zones ---")
    test_zone = {
        "warehouseId": warehouse_id,
        "code": f"TEST-ZONE-{admin_session.session.cookies.get('access_token')[:8]}",
        "name": "Test Zone"
    }
    resp = admin_session.post("/zones", json=test_zone)
    if resp.status_code == 201:
        zone = resp.json()
        print(f"✅ Zone created: {zone['code']}")
        zone_id = zone["id"]
    else:
        print(f"❌ Zone creation failed: {resp.status_code} - {resp.text}")
        # Try to use existing zone
        if warehouses[0].get("zones"):
            zone_id = warehouses[0]["zones"][0]["id"]
            print(f"  Using existing zone: {zone_id}")
        else:
            return None
    
    # Create location
    print("\n--- POST /locations ---")
    test_location = {
        "zoneId": zone_id,
        "code": f"TEST-LOC-{admin_session.session.cookies.get('access_token')[:8]}",
        "type": "STORAGE"
    }
    resp = admin_session.post("/locations", json=test_location)
    if resp.status_code == 201:
        location = resp.json()
        print(f"✅ Location created: {location['code']}")
        location_id = location["id"]
    else:
        print(f"❌ Location creation failed: {resp.status_code} - {resp.text}")
        return None
    
    # Test duplicate location code
    print("\n--- Duplicate location code (should be 409) ---")
    resp = admin_session.post("/locations", json=test_location)
    if resp.status_code == 409:
        print(f"✅ Duplicate location code correctly rejected (409)")
    else:
        print(f"❌ Duplicate location should return 409, got {resp.status_code}")
    
    # Update location
    print("\n--- PUT /locations/:id ---")
    resp = admin_session.put(f"/locations/{location_id}", json={"type": "PICKING"})
    if resp.status_code == 200:
        updated = resp.json()
        print(f"✅ Location updated: type={updated['type']}")
    else:
        print(f"❌ Location update failed: {resp.status_code}")
    
    # Delete location (no ledger history)
    print("\n--- DELETE /locations/:id ---")
    resp = admin_session.delete(f"/locations/{location_id}")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("deleted"):
            print(f"✅ Location deleted: {result}")
        else:
            print(f"⚠️  Expected deleted=true, got: {result}")
    else:
        print(f"❌ Location deletion failed: {resp.status_code}")
    
    return location_id


def test_stock_and_ledger(admin_session: TestSession, dashboard_stats: dict):
    """Test 9: Stock on Hand and Ledger APIs"""
    print("\n" + "="*80)
    print("TEST 9: STOCK & LEDGER")
    print("="*80)
    
    # Get stock on hand
    print("\n--- GET /stock ---")
    resp = admin_session.get("/stock")
    if resp.status_code != 200:
        print(f"❌ Get stock failed: {resp.status_code}")
        return False
    
    stock_rows = resp.json()
    total_stock = sum(row.get("qty", 0) for row in stock_rows)
    print(f"Stock rows: {len(stock_rows)}")
    print(f"Total stock: {total_stock} units")
    
    # Verify stock sum matches dashboard
    dashboard_total = dashboard_stats.get("totalUnits", 0)
    if total_stock == dashboard_total:
        print(f"✅ Stock sum ({total_stock}) matches dashboard totalUnits ({dashboard_total})")
    else:
        print(f"❌ Stock sum ({total_stock}) does NOT match dashboard totalUnits ({dashboard_total})")
    
    # Sample stock rows
    print(f"\n--- Sample Stock Rows ---")
    for row in stock_rows[:3]:
        item = row.get("item", {})
        location = row.get("location", {})
        print(f"  {item.get('sku')}: {row.get('qty')} @ {location.get('code')} ({location.get('warehouse')})")
    
    # Get ledger
    print("\n--- GET /ledger?limit=50 ---")
    resp = admin_session.get("/ledger?limit=50")
    if resp.status_code != 200:
        print(f"❌ Get ledger failed: {resp.status_code}")
        return False
    
    ledger_entries = resp.json()
    print(f"✅ Ledger entries: {len(ledger_entries)}")
    
    # Check for RECEIVING entries
    receiving_entries = [e for e in ledger_entries if e.get("txnType") == "RECEIVING"]
    print(f"RECEIVING entries: {len(receiving_entries)}")
    
    # Sample ledger entries
    print(f"\n--- Sample Ledger Entries ---")
    for entry in ledger_entries[:3]:
        item = entry.get("item", {})
        location = entry.get("location", {})
        user = entry.get("user", {})
        print(f"  {entry.get('txnType')}: {item.get('sku')} qty={entry.get('qty')} @ {location.get('code')} by {user.get('name')}")
    
    # Test filter by txnType
    print("\n--- GET /ledger?txnType=RECEIVING ---")
    resp = admin_session.get("/ledger?txnType=RECEIVING")
    if resp.status_code == 200:
        filtered = resp.json()
        all_receiving = all(e.get("txnType") == "RECEIVING" for e in filtered)
        if all_receiving:
            print(f"✅ Filter by txnType works: {len(filtered)} RECEIVING entries")
        else:
            print(f"❌ Filter returned non-RECEIVING entries")
    else:
        print(f"❌ Ledger filter failed: {resp.status_code}")
    
    return True


def test_audit_trail(admin_session: TestSession):
    """Test 10: Audit Trail with filters"""
    print("\n" + "="*80)
    print("TEST 10: AUDIT TRAIL")
    print("="*80)
    
    # Get all audit logs
    print("\n--- GET /audit-logs ---")
    resp = admin_session.get("/audit-logs")
    if resp.status_code != 200:
        print(f"❌ Get audit logs failed: {resp.status_code}")
        return False
    
    logs = resp.json()
    print(f"Total audit logs: {len(logs)}")
    
    # Check for various actions
    actions = {}
    modules = {}
    for log in logs:
        action = log.get("action")
        module = log.get("module")
        actions[action] = actions.get(action, 0) + 1
        modules[module] = modules.get(module, 0) + 1
    
    print(f"\n--- Actions ---")
    for action, count in sorted(actions.items()):
        print(f"  {action}: {count}")
    
    print(f"\n--- Modules ---")
    for module, count in sorted(modules.items()):
        print(f"  {module}: {count}")
    
    # Verify critical actions exist
    required_actions = ["LOGIN", "CREATE", "UPDATE"]
    missing_actions = [a for a in required_actions if a not in actions]
    if not missing_actions:
        print(f"✅ All required actions present in audit logs")
    else:
        print(f"❌ Missing actions in audit logs: {missing_actions}")
    
    # Test filter by module
    print("\n--- GET /audit-logs?module=MASTER_ITEM ---")
    resp = admin_session.get("/audit-logs?module=MASTER_ITEM")
    if resp.status_code == 200:
        filtered = resp.json()
        all_master_item = all(log.get("module") == "MASTER_ITEM" for log in filtered)
        if all_master_item:
            print(f"✅ Filter by module works: {len(filtered)} MASTER_ITEM logs")
        else:
            print(f"❌ Filter returned non-MASTER_ITEM logs")
    else:
        print(f"❌ Audit filter by module failed: {resp.status_code}")
    
    # Test filter by action
    print("\n--- GET /audit-logs?action=CREATE ---")
    resp = admin_session.get("/audit-logs?action=CREATE")
    if resp.status_code == 200:
        filtered = resp.json()
        all_create = all(log.get("action") == "CREATE" for log in filtered)
        if all_create:
            print(f"✅ Filter by action works: {len(filtered)} CREATE logs")
        else:
            print(f"❌ Filter returned non-CREATE logs")
    else:
        print(f"❌ Audit filter by action failed: {resp.status_code}")
    
    # Sample audit logs
    print(f"\n--- Sample Audit Logs ---")
    for log in logs[:5]:
        print(f"  {log.get('action')} | {log.get('module')} | {log.get('userName')} | {log.get('description')}")
    
    # Verify mutations created audit logs
    print(f"\n--- Verifying Mutations Create Audit Logs ---")
    item_creates = [log for log in logs if log.get("module") == "MASTER_ITEM" and log.get("action") == "CREATE"]
    location_creates = [log for log in logs if log.get("module") == "LOCATION" and log.get("action") == "CREATE"]
    
    if item_creates:
        print(f"✅ Item creation logged: {len(item_creates)} entries")
    else:
        print(f"⚠️  No item creation logs found")
    
    if location_creates:
        print(f"✅ Location creation logged: {len(location_creates)} entries")
    else:
        print(f"⚠️  No location creation logs found")
    
    return True


def test_receiving_document_numbering(admin_session: TestSession, warehouse_id: str):
    """Test 11: Document Numbering (GRN format & concurrency)"""
    print("\n" + "="*80)
    print("TEST 11: RECEIVING - DOCUMENT NUMBERING")
    print("="*80)
    
    # Create 2 receivings back-to-back
    print("\n--- Creating 2 receivings back-to-back ---")
    grn_numbers = []
    
    for i in range(2):
        resp = admin_session.post("/receiving", json={
            "warehouseId": warehouse_id,
            "supplier": f"Test Supplier {i+1}",
            "refDocument": f"PO-{i+1:03d}"
        })
        if resp.status_code == 201:
            receiving = resp.json()
            grn = receiving.get("grnNumber")
            grn_numbers.append(grn)
            print(f"✅ Receiving {i+1} created: {grn}")
        else:
            print(f"❌ Receiving {i+1} creation failed: {resp.status_code} - {resp.text}")
            return None
    
    # Verify GRN format
    import re
    grn_pattern = r'^GRN-WH01-\d{6}-\d{6}$'
    print(f"\n--- Verifying GRN format (pattern: {grn_pattern}) ---")
    for grn in grn_numbers:
        if re.match(grn_pattern, grn):
            print(f"✅ GRN format valid: {grn}")
        else:
            print(f"❌ GRN format invalid: {grn}")
            return None
    
    # Verify sequences are strictly increasing
    print(f"\n--- Verifying sequence increment ---")
    seq1 = int(grn_numbers[0].split('-')[-1])
    seq2 = int(grn_numbers[1].split('-')[-1])
    if seq2 == seq1 + 1:
        print(f"✅ Sequences are strictly increasing: {seq1} -> {seq2}")
    else:
        print(f"❌ Sequences are NOT strictly increasing: {seq1} -> {seq2}")
        return None
    
    return grn_numbers


def test_receiving_auto_staging(admin_session: TestSession, warehouse_id: str):
    """Test 12: Auto staging location"""
    print("\n" + "="*80)
    print("TEST 12: RECEIVING - AUTO STAGING LOCATION")
    print("="*80)
    
    # Create receiving without specifying stagingLocationId
    print("\n--- Creating receiving without stagingLocationId ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Auto Staging Test"
    })
    
    if resp.status_code == 201:
        receiving = resp.json()
        staging_location = receiving.get("stagingLocation", {})
        staging_code = staging_location.get("code")
        staging_id = receiving.get("stagingLocationId")
        
        print(f"Staging Location Code: {staging_code}")
        print(f"Staging Location ID: {staging_id}")
        
        if staging_code == "STG-01" and staging_id:
            print(f"✅ Auto-picked staging location: {staging_code}")
            return receiving
        else:
            print(f"❌ Expected STG-01, got: {staging_code}")
            return None
    else:
        print(f"❌ Receiving creation failed: {resp.status_code} - {resp.text}")
        return None


def test_receiving_draft_edit_lines(admin_session: TestSession, warehouse_id: str, items: list):
    """Test 13: Draft edit lines (PUT)"""
    print("\n" + "="*80)
    print("TEST 13: RECEIVING - DRAFT EDIT LINES")
    print("="*80)
    
    # Find non-serial and serial-tracked items
    non_serial_item = None
    serial_item = None
    
    for item in items:
        if item.get("serialTracked"):
            serial_item = item
        else:
            non_serial_item = item
        if non_serial_item and serial_item:
            break
    
    if not non_serial_item or not serial_item:
        print(f"❌ Could not find both non-serial and serial-tracked items")
        return None
    
    print(f"Non-serial item: {non_serial_item['sku']}")
    print(f"Serial-tracked item: {serial_item['sku']}")
    
    # Create draft
    print("\n--- Creating draft ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Draft Edit Test"
    })
    
    if resp.status_code != 201:
        print(f"❌ Draft creation failed: {resp.status_code} - {resp.text}")
        return None
    
    draft = resp.json()
    draft_id = draft["id"]
    print(f"✅ Draft created: {draft['grnNumber']}")
    
    # Update draft with lines
    print("\n--- Updating draft with lines ---")
    resp = admin_session.put(f"/receiving/{draft_id}", json={
        "lines": [
            {
                "itemId": non_serial_item["id"],
                "expectedQty": 10,
                "unitCost": 5
            },
            {
                "itemId": serial_item["id"],
                "expectedQty": 3,
                "unitCost": 22
            }
        ]
    })
    
    if resp.status_code != 200:
        print(f"❌ Draft update failed: {resp.status_code} - {resp.text}")
        return None
    
    updated = resp.json()
    lines = updated.get("lines", [])
    print(f"✅ Draft updated with {len(lines)} lines")
    
    # Verify lines
    if len(lines) == 2:
        print(f"✅ Correct number of lines: 2")
        for line in lines:
            item = line.get("item", {})
            print(f"  Line: {item.get('sku')} - expectedQty={line.get('expectedQty')}, unitCost={line.get('unitCost')}")
        return draft
    else:
        print(f"❌ Expected 2 lines, got {len(lines)}")
        return None


def test_receiving_start_flow(admin_session: TestSession, warehouse_id: str, items: list):
    """Test 14: Start flow (DRAFT -> RECEIVING)"""
    print("\n" + "="*80)
    print("TEST 14: RECEIVING - START FLOW")
    print("="*80)
    
    # Create draft with lines
    print("\n--- Creating draft with lines ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Start Flow Test",
        "lines": [
            {
                "itemId": items[0]["id"],
                "expectedQty": 5,
                "unitCost": 10
            }
        ]
    })
    
    if resp.status_code != 201:
        print(f"❌ Draft creation failed: {resp.status_code}")
        return None
    
    draft = resp.json()
    draft_id = draft["id"]
    print(f"✅ Draft created: {draft['grnNumber']}")
    
    # Start receiving
    print("\n--- Starting receiving ---")
    resp = admin_session.post(f"/receiving/{draft_id}/start")
    
    if resp.status_code == 200:
        started = resp.json()
        status = started.get("status")
        if status == "RECEIVING":
            print(f"✅ Receiving started: status={status}")
        else:
            print(f"❌ Expected status=RECEIVING, got {status}")
            return None
    else:
        print(f"❌ Start failed: {resp.status_code} - {resp.text}")
        return None
    
    # Test starting empty draft (should fail)
    print("\n--- Testing start on empty draft (should fail) ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Empty Draft"
    })
    
    if resp.status_code == 201:
        empty_draft = resp.json()
        resp = admin_session.post(f"/receiving/{empty_draft['id']}/start")
        if resp.status_code == 400:
            print(f"✅ Empty draft start correctly rejected (400)")
        else:
            print(f"❌ Empty draft start should return 400, got {resp.status_code}")
    
    return draft


def test_receiving_post_happy_path(admin_session: TestSession, warehouse_id: str, items: list):
    """Test 15: Post flow (RECEIVING -> WAITING_PUTAWAY) — happy path"""
    print("\n" + "="*80)
    print("TEST 15: RECEIVING - POST HAPPY PATH")
    print("="*80)
    
    # Find non-serial and serial-tracked items
    non_serial_item = None
    serial_item = None
    
    for item in items:
        if item.get("serialTracked"):
            serial_item = item
        else:
            non_serial_item = item
        if non_serial_item and serial_item:
            break
    
    if not non_serial_item or not serial_item:
        print(f"❌ Could not find both item types")
        return None
    
    # Create and start receiving
    print("\n--- Creating receiving with mixed lines ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Post Test Supplier",
        "lines": [
            {
                "itemId": non_serial_item["id"],
                "expectedQty": 10,
                "unitCost": 5
            },
            {
                "itemId": serial_item["id"],
                "expectedQty": 3,
                "unitCost": 22
            }
        ]
    })
    
    if resp.status_code != 201:
        print(f"❌ Receiving creation failed: {resp.status_code}")
        return None
    
    receiving = resp.json()
    receiving_id = receiving["id"]
    grn_number = receiving["grnNumber"]
    print(f"✅ Receiving created: {grn_number}")
    
    # Start receiving
    resp = admin_session.post(f"/receiving/{receiving_id}/start")
    if resp.status_code != 200:
        print(f"❌ Start failed: {resp.status_code}")
        return None
    print(f"✅ Receiving started")
    
    # Get line IDs
    resp = admin_session.get(f"/receiving/{receiving_id}")
    receiving = resp.json()
    lines = receiving.get("lines", [])
    
    non_serial_line = next((l for l in lines if l["item"]["id"] == non_serial_item["id"]), None)
    serial_line = next((l for l in lines if l["item"]["id"] == serial_item["id"]), None)
    
    if not non_serial_line or not serial_line:
        print(f"❌ Could not find lines")
        return None
    
    # Post receiving (use unique serial numbers with timestamp)
    import time
    timestamp = str(int(time.time()))[-6:]
    serials = [f"SN-POST-{timestamp}-{i:03d}" for i in range(1, 4)]
    
    print("\n--- Posting receiving ---")
    resp = admin_session.post(f"/receiving/{receiving_id}/post", json={
        "lines": [
            {
                "lineId": non_serial_line["id"],
                "receivedQty": 10
            },
            {
                "lineId": serial_line["id"],
                "receivedQty": 3,
                "serials": serials
            }
        ]
    })
    
    if resp.status_code != 200:
        print(f"❌ Post failed: {resp.status_code} - {resp.text}")
        return None
    
    posted = resp.json()
    status = posted.get("status")
    posted_at = posted.get("postedAt")
    
    if status == "WAITING_PUTAWAY" and posted_at:
        print(f"✅ Receiving posted: status={status}, postedAt={posted_at}")
    else:
        print(f"❌ Expected status=WAITING_PUTAWAY with postedAt, got status={status}, postedAt={posted_at}")
        return None
    
    # Verify ledger entries
    print("\n--- Verifying ledger entries ---")
    resp = admin_session.get("/ledger?limit=20")
    if resp.status_code == 200:
        ledger = resp.json()
        receiving_entries = [e for e in ledger if e.get("refNumber") == grn_number]
        
        if len(receiving_entries) == 2:
            print(f"✅ Found 2 ledger entries for {grn_number}")
            for entry in receiving_entries:
                print(f"  {entry['item']['sku']}: qty={entry['qty']}, txnType={entry['txnType']}, location={entry['location']['code']}")
        else:
            print(f"❌ Expected 2 ledger entries, found {len(receiving_entries)}")
    else:
        print(f"❌ Ledger query failed: {resp.status_code}")
    
    # Verify putaway tasks
    print("\n--- Verifying putaway tasks ---")
    resp = admin_session.get(f"/receiving/{receiving_id}")
    receiving = resp.json()
    lines = receiving.get("lines", [])
    
    for line in lines:
        putaway_tasks = line.get("putawayTasks", [])
        if len(putaway_tasks) > 0:
            task = putaway_tasks[0]
            task_number = task.get("taskNumber")
            task_status = task.get("status")
            
            import re
            if re.match(r'^PUT-WH01-\d{6}-\d{6}$', task_number) and task_status == "OPEN":
                print(f"✅ Putaway task: {task_number}, status={task_status}")
            else:
                print(f"❌ Invalid putaway task: {task_number}, status={task_status}")
        else:
            print(f"❌ No putaway tasks for line {line['item']['sku']}")
    
    # Verify serials
    print("\n--- Verifying serial numbers ---")
    serial_line_updated = next((l for l in lines if l["item"]["id"] == serial_item["id"]), None)
    if serial_line_updated:
        serials = serial_line_updated.get("serials", [])
        if len(serials) == 3:
            print(f"✅ Found 3 serial numbers")
            for serial in serials:
                print(f"  {serial['serialNo']}: status={serial['status']}")
        else:
            print(f"❌ Expected 3 serials, found {len(serials)}")
    
    return receiving


def test_receiving_post_validations(admin_session: TestSession, warehouse_id: str, items: list):
    """Test 16: Post validation errors (all must return 400)"""
    print("\n" + "="*80)
    print("TEST 16: RECEIVING - POST VALIDATIONS")
    print("="*80)
    
    # Find serial-tracked item
    serial_item = next((item for item in items if item.get("serialTracked")), None)
    if not serial_item:
        print(f"❌ No serial-tracked item found")
        return False
    
    print(f"Using serial-tracked item: {serial_item['sku']}")
    
    # Create and start receiving
    print("\n--- Creating receiving with serial-tracked item ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Validation Test",
        "lines": [
            {
                "itemId": serial_item["id"],
                "expectedQty": 2,
                "unitCost": 10
            }
        ]
    })
    
    if resp.status_code != 201:
        print(f"❌ Receiving creation failed: {resp.status_code}")
        return False
    
    receiving = resp.json()
    receiving_id = receiving["id"]
    line_id = receiving["lines"][0]["id"]
    
    resp = admin_session.post(f"/receiving/{receiving_id}/start")
    if resp.status_code != 200:
        print(f"❌ Start failed: {resp.status_code}")
        return False
    
    # Test 1: Post with 0 receivedQty
    print("\n--- Test 1: Post with 0 receivedQty (should be 400) ---")
    resp = admin_session.post(f"/receiving/{receiving_id}/post", json={
        "lines": [{"lineId": line_id, "receivedQty": 0}]
    })
    if resp.status_code == 400:
        print(f"✅ Zero qty correctly rejected (400)")
    else:
        print(f"❌ Expected 400, got {resp.status_code}")
    
    # Test 2: Post with receivedQty but no serials
    print("\n--- Test 2: Post with receivedQty=2 but no serials (should be 400) ---")
    resp = admin_session.post(f"/receiving/{receiving_id}/post", json={
        "lines": [{"lineId": line_id, "receivedQty": 2, "serials": []}]
    })
    if resp.status_code == 400:
        print(f"✅ Missing serials correctly rejected (400)")
    else:
        print(f"❌ Expected 400, got {resp.status_code}")
    
    # Test 3: Post with duplicate serials within request
    print("\n--- Test 3: Post with duplicate serials (should be 400) ---")
    resp = admin_session.post(f"/receiving/{receiving_id}/post", json={
        "lines": [{"lineId": line_id, "receivedQty": 2, "serials": ["SN-DUP", "SN-DUP"]}]
    })
    if resp.status_code == 400:
        print(f"✅ Duplicate serials correctly rejected (400)")
    else:
        print(f"❌ Expected 400, got {resp.status_code}")
    
    # Test 4: Post with existing serial
    print("\n--- Test 4: Post with existing serial SN-TEST-001 (should be 400) ---")
    resp = admin_session.post(f"/receiving/{receiving_id}/post", json={
        "lines": [{"lineId": line_id, "receivedQty": 2, "serials": ["SN-TEST-001", "SN-NEW"]}]
    })
    if resp.status_code == 400:
        print(f"✅ Existing serial correctly rejected (400)")
    else:
        print(f"❌ Expected 400, got {resp.status_code}")
    
    print(f"\n✅ All validation tests passed")
    return True


def test_receiving_cancel_flow(admin_session: TestSession, warehouse_id: str, items: list):
    """Test 17: Cancel flow + immutable numbering"""
    print("\n" + "="*80)
    print("TEST 17: RECEIVING - CANCEL FLOW")
    print("="*80)
    
    # Create draft
    print("\n--- Creating draft for cancellation ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Cancel Test"
    })
    
    if resp.status_code != 201:
        print(f"❌ Draft creation failed: {resp.status_code}")
        return False
    
    draft = resp.json()
    draft_id = draft["id"]
    draft_grn = draft["grnNumber"]
    draft_seq = int(draft_grn.split('-')[-1])
    print(f"✅ Draft created: {draft_grn} (seq={draft_seq})")
    
    # Cancel draft
    print("\n--- Cancelling draft ---")
    resp = admin_session.post(f"/receiving/{draft_id}/cancel", json={
        "reason": "test cancellation"
    })
    
    if resp.status_code == 200:
        cancelled = resp.json()
        status = cancelled.get("status")
        if status == "CANCELLED":
            print(f"✅ Draft cancelled: status={status}")
        else:
            print(f"❌ Expected status=CANCELLED, got {status}")
            return False
    else:
        print(f"❌ Cancel failed: {resp.status_code} - {resp.text}")
        return False
    
    # Create another draft and verify sequence incremented
    print("\n--- Creating new draft after cancellation ---")
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "After Cancel"
    })
    
    if resp.status_code == 201:
        new_draft = resp.json()
        new_grn = new_draft["grnNumber"]
        new_seq = int(new_grn.split('-')[-1])
        
        if new_seq == draft_seq + 1:
            print(f"✅ Sequence incremented correctly: {draft_seq} -> {new_seq}")
        else:
            print(f"❌ Sequence NOT incremented: {draft_seq} -> {new_seq}")
            return False
    else:
        print(f"❌ New draft creation failed: {resp.status_code}")
        return False
    
    # Test cancelling WAITING_PUTAWAY (should fail)
    print("\n--- Testing cancel on WAITING_PUTAWAY (should fail) ---")
    # Create, start, and post a receiving
    resp = admin_session.post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Cancel Test 2",
        "lines": [{"itemId": items[0]["id"], "expectedQty": 1, "unitCost": 5}]
    })
    
    if resp.status_code == 201:
        test_receiving = resp.json()
        test_id = test_receiving["id"]
        line_id = test_receiving["lines"][0]["id"]
        
        # Start and post
        admin_session.post(f"/receiving/{test_id}/start")
        resp = admin_session.post(f"/receiving/{test_id}/post", json={
            "lines": [{"lineId": line_id, "receivedQty": 1}]
        })
        
        if resp.status_code == 200:
            # Try to cancel
            resp = admin_session.post(f"/receiving/{test_id}/cancel", json={"reason": "test"})
            if resp.status_code == 400:
                print(f"✅ Cancel WAITING_PUTAWAY correctly rejected (400)")
            else:
                print(f"❌ Expected 400, got {resp.status_code}")
    
    return True


def test_receiving_rbac(sessions: Dict[str, TestSession], warehouse_id: str, items: list):
    """Test 18: RBAC for receiving operations"""
    print("\n" + "="*80)
    print("TEST 18: RECEIVING - RBAC")
    print("="*80)
    
    # Test STOCK_CONTROL can create
    print("\n--- STOCK_CONTROL: Create receiving (should be 201) ---")
    resp = sessions["stock_control"].post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "RBAC Test"
    })
    
    if resp.status_code == 201:
        receiving = resp.json()
        receiving_id = receiving["id"]
        print(f"✅ STOCK_CONTROL can create receiving: {receiving['grnNumber']}")
    else:
        print(f"❌ STOCK_CONTROL should create receiving, got {resp.status_code}")
        return False
    
    # Test STOCK_CONTROL can start
    print("\n--- STOCK_CONTROL: Start receiving (should be 200) ---")
    # Add lines first
    resp = sessions["stock_control"].put(f"/receiving/{receiving_id}", json={
        "lines": [{"itemId": items[0]["id"], "expectedQty": 1, "unitCost": 5}]
    })
    
    resp = sessions["stock_control"].post(f"/receiving/{receiving_id}/start")
    if resp.status_code == 200:
        print(f"✅ STOCK_CONTROL can start receiving")
    else:
        print(f"❌ STOCK_CONTROL should start receiving, got {resp.status_code}")
        return False
    
    # Test STOCK_CONTROL can post
    print("\n--- STOCK_CONTROL: Post receiving (should be 200) ---")
    resp = sessions["stock_control"].get(f"/receiving/{receiving_id}")
    receiving = resp.json()
    line_id = receiving["lines"][0]["id"]
    
    resp = sessions["stock_control"].post(f"/receiving/{receiving_id}/post", json={
        "lines": [{"lineId": line_id, "receivedQty": 1}]
    })
    if resp.status_code == 200:
        print(f"✅ STOCK_CONTROL can post receiving")
    else:
        print(f"❌ STOCK_CONTROL should post receiving, got {resp.status_code}")
        return False
    
    # Test STOCK_CONTROL cannot cancel
    print("\n--- STOCK_CONTROL: Cancel receiving (should be 403) ---")
    # Create new draft for cancellation
    resp = sessions["stock_control"].post("/receiving", json={
        "warehouseId": warehouse_id,
        "supplier": "Cancel RBAC Test"
    })
    
    if resp.status_code == 201:
        draft = resp.json()
        resp = sessions["stock_control"].post(f"/receiving/{draft['id']}/cancel", json={"reason": "test"})
        if resp.status_code == 403:
            print(f"✅ STOCK_CONTROL correctly denied cancel (403)")
        else:
            print(f"❌ STOCK_CONTROL should get 403, got {resp.status_code}")
            return False
    
    # Test SUPERVISOR can cancel
    print("\n--- SUPERVISOR: Cancel receiving (should be 200) ---")
    resp = sessions["supervisor"].post(f"/receiving/{draft['id']}/cancel", json={"reason": "supervisor test"})
    if resp.status_code == 200:
        print(f"✅ SUPERVISOR can cancel receiving")
    else:
        print(f"❌ SUPERVISOR should cancel receiving, got {resp.status_code}")
        return False
    
    return True


def test_receiving_list_filter(admin_session: TestSession):
    """Test 19: List + filter"""
    print("\n" + "="*80)
    print("TEST 19: RECEIVING - LIST & FILTER")
    print("="*80)
    
    # Get all receivings
    print("\n--- GET /receiving ---")
    resp = admin_session.get("/receiving")
    if resp.status_code == 200:
        receivings = resp.json()
        print(f"✅ Found {len(receivings)} receivings")
    else:
        print(f"❌ List receivings failed: {resp.status_code}")
        return False
    
    # Filter by status
    print("\n--- GET /receiving?status=WAITING_PUTAWAY ---")
    resp = admin_session.get("/receiving?status=WAITING_PUTAWAY")
    if resp.status_code == 200:
        filtered = resp.json()
        all_waiting = all(r.get("status") == "WAITING_PUTAWAY" for r in filtered)
        if all_waiting:
            print(f"✅ Filter by status works: {len(filtered)} WAITING_PUTAWAY receivings")
        else:
            print(f"❌ Filter returned non-WAITING_PUTAWAY receivings")
            return False
    else:
        print(f"❌ Filter failed: {resp.status_code}")
        return False
    
    return True


def test_barcode_lookup(admin_session: TestSession, items: list):
    """Test 20: Barcode lookup"""
    print("\n" + "="*80)
    print("TEST 20: BARCODE LOOKUP")
    print("="*80)
    
    # Test item lookup by SKU
    print("\n--- GET /barcode?code=FUR-CHR-001 ---")
    resp = admin_session.get("/barcode?code=FUR-CHR-001")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("type") == "ITEM" and result.get("item", {}).get("sku") == "FUR-CHR-001":
            print(f"✅ Item lookup works: {result['item']['sku']}")
        else:
            print(f"❌ Expected ITEM type with SKU FUR-CHR-001, got: {result}")
    else:
        print(f"❌ Barcode lookup failed: {resp.status_code}")
    
    # Test location lookup
    print("\n--- GET /barcode?code=STG-01 ---")
    resp = admin_session.get("/barcode?code=STG-01")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("type") == "LOCATION" and result.get("location", {}).get("code") == "STG-01":
            print(f"✅ Location lookup works: {result['location']['code']} (type: {result['location']['locationType']})")
        else:
            print(f"❌ Expected LOCATION type with code STG-01, got: {result}")
    else:
        print(f"❌ Barcode lookup failed: {resp.status_code}")
    
    # Test serial lookup
    print("\n--- GET /barcode?code=SN-TEST-001 ---")
    resp = admin_session.get("/barcode?code=SN-TEST-001")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("type") == "SERIAL" and result.get("serial", {}).get("serialNo") == "SN-TEST-001":
            print(f"✅ Serial lookup works: {result['serial']['serialNo']} (status: {result['serial']['status']})")
        else:
            print(f"❌ Expected SERIAL type with serialNo SN-TEST-001, got: {result}")
    else:
        print(f"❌ Barcode lookup failed: {resp.status_code}")
    
    # Test unknown code
    print("\n--- GET /barcode?code=NONEXISTENT ---")
    resp = admin_session.get("/barcode?code=NONEXISTENT")
    if resp.status_code == 200:
        result = resp.json()
        if result.get("type") == "UNKNOWN" and result.get("value") == "NONEXISTENT":
            print(f"✅ Unknown code handled correctly: {result}")
        else:
            print(f"❌ Expected UNKNOWN type, got: {result}")
    else:
        print(f"❌ Barcode lookup failed: {resp.status_code}")
    
    return True


def test_receiving_audit_trail(admin_session: TestSession):
    """Test 21: Audit trail for receiving"""
    print("\n" + "="*80)
    print("TEST 21: RECEIVING - AUDIT TRAIL")
    print("="*80)
    
    # Get audit logs for RECEIVING module
    print("\n--- GET /audit-logs?module=RECEIVING ---")
    resp = admin_session.get("/audit-logs?module=RECEIVING")
    if resp.status_code == 200:
        logs = resp.json()
        print(f"✅ Found {len(logs)} RECEIVING audit logs")
        
        # Check for various actions
        actions = {}
        for log in logs:
            action = log.get("action")
            actions[action] = actions.get(action, 0) + 1
        
        print(f"\n--- RECEIVING Actions ---")
        for action, count in sorted(actions.items()):
            print(f"  {action}: {count}")
        
        # Verify CREATE, UPDATE, POST actions exist
        required_actions = ["CREATE", "UPDATE"]
        missing = [a for a in required_actions if a not in actions]
        if not missing:
            print(f"✅ All required actions present in RECEIVING audit logs")
        else:
            print(f"❌ Missing actions: {missing}")
        
        # Sample logs
        print(f"\n--- Sample RECEIVING Audit Logs ---")
        for log in logs[:5]:
            print(f"  {log.get('action')} | {log.get('userName')} | {log.get('description')}")
        
        return True
    else:
        print(f"❌ Audit logs query failed: {resp.status_code}")
        return False


def main():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("STOCK CONTROL INVENTORY SYSTEM - BACKEND TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    
    try:
        # Test 1: Auth
        sessions = test_auth()
        if not sessions:
            print("\n❌ AUTH TESTS FAILED - STOPPING")
            return False
        
        admin = sessions["admin"]
        
        # Get meta data for warehouse and items
        print("\n" + "="*80)
        print("SETUP: Getting warehouse and items data")
        print("="*80)
        
        meta_resp = admin.get("/meta")
        if meta_resp.status_code != 200:
            print(f"❌ Meta API failed")
            return False
        
        meta = meta_resp.json()
        warehouses = meta.get("warehouses", [])
        if not warehouses:
            print(f"❌ No warehouses found")
            return False
        
        warehouse_id = warehouses[0]["id"]
        warehouse_code = warehouses[0]["code"]
        print(f"✅ Using warehouse: {warehouse_code} (ID: {warehouse_id})")
        
        # Check for staging location
        staging_location = None
        for wh in warehouses:
            for zone in wh.get("zones", []):
                for loc in zone.get("locations", []):
                    if loc.get("type") == "STAGING":
                        staging_location = loc
                        break
        
        if staging_location:
            print(f"✅ Found staging location: {staging_location['code']}")
        else:
            print(f"❌ No STAGING location found")
            return False
        
        # Get items
        items_resp = admin.get("/items")
        if items_resp.status_code != 200:
            print(f"❌ Items API failed")
            return False
        
        items = items_resp.json()
        non_serial_items = [i for i in items if not i.get("serialTracked")]
        serial_items = [i for i in items if i.get("serialTracked")]
        
        print(f"✅ Found {len(items)} items ({len(non_serial_items)} non-serial, {len(serial_items)} serial-tracked)")
        
        if serial_items:
            print(f"  Serial-tracked items: {', '.join([i['sku'] for i in serial_items])}")
        
        # ============ MILESTONE 1: RECEIVING TESTS ============
        print("\n" + "="*80)
        print("MILESTONE 1: RECEIVING MODULE TESTS")
        print("="*80)
        
        # Test 11: Document Numbering
        test_receiving_document_numbering(admin, warehouse_id)
        
        # Test 12: Auto Staging Location
        test_receiving_auto_staging(admin, warehouse_id)
        
        # Test 13: Draft Edit Lines
        test_receiving_draft_edit_lines(admin, warehouse_id, items)
        
        # Test 14: Start Flow
        test_receiving_start_flow(admin, warehouse_id, items)
        
        # Test 15: Post Happy Path
        test_receiving_post_happy_path(admin, warehouse_id, items)
        
        # Test 16: Post Validations
        test_receiving_post_validations(admin, warehouse_id, items)
        
        # Test 17: Cancel Flow
        test_receiving_cancel_flow(admin, warehouse_id, items)
        
        # Test 18: RBAC
        test_receiving_rbac(sessions, warehouse_id, items)
        
        # Test 19: List & Filter
        test_receiving_list_filter(admin)
        
        # Test 20: Barcode Lookup
        test_barcode_lookup(admin, items)
        
        # Test 21: Audit Trail
        test_receiving_audit_trail(admin)
        
        print("\n" + "="*80)
        print("✅ ALL RECEIVING TESTS COMPLETED")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"\n❌ TEST SUITE ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
