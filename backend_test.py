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
        
        # Test 2: Dashboard
        dashboard_stats = test_dashboard(admin)
        if not dashboard_stats:
            print("\n❌ DASHBOARD TEST FAILED")
        
        # Test 3: Meta
        meta = test_meta(admin)
        if not meta:
            print("\n❌ META TEST FAILED")
            return False
        
        # Test 4: List Items
        items = test_items_list(admin)
        if not items:
            print("\n❌ LIST ITEMS TEST FAILED")
        
        # Test 5: RBAC Matrix
        rbac_ok = test_rbac_matrix(sessions, meta)
        if not rbac_ok:
            print("\n❌ RBAC TESTS FAILED")
        
        # Test 6: Item CRUD
        test_item_crud(admin, meta)
        
        # Test 7: Item Soft-Delete
        test_item_soft_delete(admin)
        
        # Test 8: Locations
        test_locations(admin, meta)
        
        # Test 9: Stock & Ledger
        if dashboard_stats:
            test_stock_and_ledger(admin, dashboard_stats)
        
        # Test 10: Audit Trail
        test_audit_trail(admin)
        
        print("\n" + "="*80)
        print("✅ ALL BACKEND TESTS COMPLETED")
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
