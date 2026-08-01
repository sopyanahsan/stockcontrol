# RELEASE NOTES

Enterprise Stock Control & Warehouse Management System (WMS)

---

# Versioning

This project follows Semantic Versioning.

Current Version:

v0.9.7

Status:

Release Candidate — preparing v1.0.0

---

# v0.9.7

Release Name

Production Readiness Review (Phase 9.5D)

Status

Release Candidate

## Features

- Build review — removed invalid `dynamicRoutes` next.config key (build warning gone)
- Removed legacy `pages/` router (Pages Router `_app`/`_error`)
- Removed dead code: `app/providers.js`, `lib/constants/testIds`, root scratch scripts
- Dependency audit — removed 9 unused packages; declared missing `xlsx`
- Upgraded `next` to 15.5.22 (security patch)
- Added npm overrides: `postcss` 8.5.25, `sharp` 0.35.3 (security patches)
- Added `.env.example` with documented environment variables
- Fixed reports test suite parse error
- Synchronized README + memory documentation to v0.9.7

---

# v0.9.6

Release Name

Data Integrity & Transaction Audit (Phase 9.5C)

Status

Stable

## Features

- Audit of all inventory services (Receiving → Shipping → Stock Opname)
- Fixed putaway FIFO consumption: staging layers now consumed and destination layers inherit unit cost + FIFO age
- FIFO layer identity preserved across putaway (receivedAt, refNumber, unitCost)

---

# v0.9.5

Release Name

API Hardening (Phase 9.5B)

Status

Stable

## Features

- Strict JSON body parsing (malformed bodies → 400)
- Bounded pagination values
- Sanitized 500/Prisma error messages
- Consolidated operational RBAC checks
- Added PATCH route for stock-opname counts

---

# v0.9.4

Release Name

Stock Opname (Phase 4 — UI)

Status

Stable

## Features

Phase 9.1 — Foundation & Database

- StockOpname schema extensions
- StockOpnameLine schema extensions
- SO numbering support (SO-YYYYMM-NNNNNN)
- User relations for createdBy/approvedBy

Phase 9.2 — Service Layer

- lib/stock-opname-service.js
- All business logic centralized

Phase 9.3 — API Endpoints

- 11 REST endpoints in app/api/[[...path]]/route.js
- RBAC: ADMINISTRATOR, SUPERVISOR, STOCK_CONTROL

Phase 9.4 — User Interface

- 3 pages: list, new, detail
- 7 reusable components under components/stock-opname/
- Barcode scan workflow with location + item scan cards
- Inline count table with auto-focus and Enter-key navigation
- Variance summary card with color-coded indicators
- Status flow indicator in header
- Confirm dialogs for approve/reject/cancel

## UI Components

| Component | Description |
|-----------|-------------|
| StockOpnameStatusBadge | Status-colored badge |
| StockOpnameHeader | Detail page header with flow indicator |
| VarianceSummaryCard | KPI card grid with accuracy % |
| ScanLocationCard | Barcode scan input for locations |
| ScanItemCard | Barcode scan input for items |
| ConfirmDialog | Reusable confirmation dialog |
| EmptyState | Empty/dashed placeholder |

## Pages

| Page | Description |
|------|-------------|
| /stock-opname | List with search, status tabs, create dialog |
| /stock-opname/new | Minimal form — remarks + create |
| /stock-opname/[id] | Full workflow: scan → count → submit → approve |

## Color Coding

| State | Color |
|-------|-------|
| Matched | Green |
| Over | Blue |
| Missing | Red |
| Variance | Orange |

## Status Badges

| Status | Badge Color |
|---------|------------|
| Draft | Gray |
| In Progress | Blue |
| Submitted | Orange |
| Approved | Purple |
| Completed | Green |
| Cancelled | Red |

---

# v0.9.3

Release Name

Stock Opname (Phase 3 — API)

Status

Stable

## Features

Phase 9.1 — Foundation & Database

- StockOpname schema extensions
- StockOpnameLine schema extensions
- SO numbering support (SO-YYYYMM-NNNNNN)
- User relations for createdBy/approvedBy
- Item/Location reverse relations

Phase 9.2 — Service Layer

- lib/stock-opname-service.js
- All business logic centralized in service layer

Phase 9.3 — API Endpoints

- 11 REST endpoints registered in app/api/[[...path]]/route.js
- RBAC: ADMINISTRATOR, SUPERVISOR, STOCK_CONTROL

## API Endpoints

| Method | Endpoint | Service Function |
|--------|----------|-----------------|
| GET | /api/stock-opname | listStockOpnames() |
| POST | /api/stock-opname | createStockOpname() |
| GET | /api/stock-opname/:id | getStockOpname() |
| POST | /api/stock-opname/:id/start | startStockOpname() |
| POST | /api/stock-opname/:id/scan-location | scanLocation() |
| POST | /api/stock-opname/:id/scan-item | scanItem() |
| PATCH | /api/stock-opname/:id/count | updateCountedQty() |
| POST | /api/stock-opname/:id/submit | submitStockOpname() |
| POST | /api/stock-opname/:id/reject | rejectStockOpname() |
| POST | /api/stock-opname/:id/approve | approveStockOpname() |
| POST | /api/stock-opname/:id/cancel | cancelStockOpname() |
| GET | /api/stock-opname/:id/summary | getVarianceSummary() |

## Business Rules

- Stock Opname NEVER modifies inventory directly
- After APPROVED: Calls adjustment-service.js to create adjustment
- Adjustment generates: Stock Ledger + FIFO + Audit Trail
- systemQty captured at DRAFT → IN_PROGRESS transition
- systemQty becomes immutable after capture

## Status Flow

DRAFT → IN_PROGRESS → SUBMITTED → APPROVED → COMPLETED

CANCELLED is terminal.
REJECTED returns to IN_PROGRESS.

---

# v0.1.0

Release Name

Receiving Foundation

Status

Stable

## Features

- Authentication
- Role Based Access Control (RBAC)
- Dashboard
- Master Item
- Warehouse Location
- Goods Receiving
- Barcode Scan
- Serial Number Scan
- STAGING Location
- FIFO Layer Creation
- Stock Ledger
- Audit Trail
- Document Number Generator

## Business Rules

- Inventory cannot be edited directly.
- Receiving creates FIFO Layers.
- Every transaction creates Stock Ledger.
- Every transaction creates Audit Trail.

---

# v0.2.0

Release Name

Putaway Engine

Status

Stable

## Features

- Putaway Queue
- Putaway Task
- Scan Location
- Scan Item
- Putaway Validation
- STAGING → BIN Transfer
- Auto Complete Receiving
- Warehouse Location Validation

## Improvements

- Better Barcode Validation
- Improved Audit Trail
- Better FIFO Traceability

---

# v0.3.0

Release Name

Internal Stock Movement

Status

Stable

## Features

- Internal Stock Movement
- FIFO Suggestion
- Stock Card
- Movement History
- Movement Preview
- Atomic Transactions
- Rollback Protection

## Improvements

- Stock Validation Service
- FIFO Service
- Better Movement Audit
- Source / Destination Validation

---

# v0.4.0

Release Name

Inventory Accuracy

Status

Stable

## Features

Stock Adjustment

- Adjustment IN
- Adjustment OUT
- Reason Codes
- Preview
- Rollback

Cycle Count

- Count Session
- Variance
- Approval Workflow
- Auto Adjustment
- Blind Count

## Improvements

- Weighted Average Cost
- Better FIFO Consumption
- Better Ledger Accuracy
- Improved Validation

---

# v0.5.0

Release Name

Picking Module

Status

Stable

## Features

- Picking Order
- Picking Line
- Picking Task
- FIFO Suggestion
- Barcode Validation
- Serial Validation
- Partial Picking
- Picking Dashboard KPI
- Picking Queue

## Improvements

- Wrong Location Validation
- Wrong Item Validation
- Wrong Serial Validation
- Duplicate Serial Validation
- Partial Picking Support

## Acceptance

11 Scenario

PASS

---

# v0.6.0

Release Name

Packing Module

Status

Stable

## Features

- Packing Queue
- Packing Order
- Package Management
- Package Items
- Package Weight
- Package Dimensions
- Volume Calculation
- Package Close
- Package Reopen
- Barcode Packing Workflow
- Serial Verification
- Packing Dashboard KPI

## Workflow

Picking Completed

↓

Packing Queue

↓

Create Package

↓

Select Active Package

↓

Scan Item

↓

Scan Serial

↓

Quantity

↓

Confirm

↓

Close Package

↓

Packing Completed

## Validation

- Package Required
- Wrong Item
- Wrong Serial
- Duplicate Serial
- Duplicate Package Number
- Closed Package Protection
- Remaining Quantity Validation

## Business Rules

- Packing does NOT modify inventory.
- Packing does NOT create Stock Ledger.
- Packing does NOT consume FIFO.
- Packing only groups picked inventory into packages.
- Serial numbers must come from Picking.

## Acceptance

42 / 42 Tests

PASS

---

# v0.7.0

Release Name

Shipping Module

Status

Stable

## Features

- Shipment Order (QUEUE → IN_PROGRESS → READY → COMPLETED)
- Shipment Package Verification
- Serial validation at verifyPackage
- Shipment Preview with FIFO impact and ledger preview
- ConfirmShipment with atomic transaction
- SHIP_OUT Stock Ledger entries
- FIFO Consumption via PackageAllocation chain (Picking execution recorded by Packing)
- Package Lock (CONFIRMED) — immutable after COMPLETED
- Retry FAILED shipment
- Cancel QUEUE/IN_PROGRESS shipments
- Shipping KPI dashboard
- Shipping Audit Trail

## New Model

- `PackageAllocation` — junction table linking `PackageItem` → `PickingTask` → `FifoLayer`. Shipping consumes Picking's FIFO reservation without re-allocating.

## Workflow

Packing Completed

↓

Create Shipment (QUEUE)

↓

Start Shipment (IN_PROGRESS)

↓

Scan Package

↓

Verify Package (optional: verify serials)

↓

All Packages Verified → READY

↓

Confirm Shipment (COMPLETED)

↓

FIFO Consumed | SHIP_OUT Ledger | Packages Locked

## Validation

- Wrong Package Barcode
- Package OPEN
- Package Different Warehouse
- Wrong Serial
- Duplicate Serial
- FIFO Allocation Mismatch
- Shipment Not READY
- Package Already Shipped

## Business Rules

- Shipping is the only module that REDUCES inventory.
- Shipping consumes Picking's FIFO reservation — never re-allocates.
- PackageAllocation is immutable once packing is complete.
- Packages are locked (CONFIRMED) after shipment COMPLETED.
- No service may edit a COMPLETED shipment.

## Acceptance

22 / 22 Tests

PASS

---

# Current Project Progress

Foundation

✅ Completed

Inbound

✅ Completed

Inventory Control

✅ Completed

Outbound

✅ Shipping Completed

Analytics

⬜ Not Started

Advanced Warehouse

⬜ Not Started

---

# Completed Modules

✅ Authentication

✅ RBAC

✅ Dashboard

✅ Master Item

✅ Warehouse Location

✅ Receiving

✅ Putaway

✅ Stock Movement

✅ FIFO Engine

✅ Stock Adjustment

✅ Cycle Count

✅ Picking

✅ Packing

✅ Barcode Service

✅ Audit Trail

✅ Stock Ledger

✅ Document Number Generator

---

# Upcoming Releases

## v1.0.0

Enterprise WMS Stable Release

Target Scope

- Complete Inbound Workflow
- Complete Inventory Control
- Complete Outbound Workflow
- Reporting & Analytics
- Stock Opname
- Stable API
- Production Ready
- Documentation Complete

---

# Release Philosophy

This project follows an Enterprise WMS architecture.

Core Principles

- Inventory is NEVER edited directly.
- Stock Ledger is the Single Source of Truth.
- FIFO is mandatory.
- Every transaction generates an Audit Trail.
- Business logic belongs in the Service Layer.
- API Routes remain thin.
- Prisma Transactions guarantee atomic operations.
- Barcode workflows must follow warehouse best practices.
- Reuse existing services whenever possible.
- Maintain backward compatibility between releases.

---

Last Updated

Version:

v0.9.7

Date:

2026-08-01

Status:

Release Candidate