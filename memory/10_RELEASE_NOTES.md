# RELEASE NOTES

Enterprise Stock Control & Warehouse Management System (WMS)

---

# Versioning

This project follows Semantic Versioning.

Current Version:

v0.7.0

Status:

Stable Development

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

## v0.7.0

Shipping Module

Planned Features

- Shipping Order
- Shipment Validation
- Consume FIFO
- Stock Ledger OUT
- Inventory Reduction
- Shipment Audit Trail
- Shipping Dashboard KPI

---

## v0.8.0

Reporting & Analytics

Planned Features

- Inventory Reports
- Stock Card Report
- Adjustment Report
- Movement Report
- Picking Report
- Packing Report
- KPI Dashboard
- Export Excel
- Export PDF

---

## v0.9.0

Advanced Warehouse

Planned Features

- Multi Warehouse
- Warehouse Zone
- Bin Replenishment
- Cross Docking
- Wave Picking
- Batch Picking
- ASN (Advanced Shipping Notice)

---

## v1.0.0

Enterprise WMS Stable Release

Target Scope

- Complete Inbound Workflow
- Complete Inventory Control
- Complete Outbound Workflow
- Reporting & Analytics
- Multi Warehouse
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

v0.7.0

Date:

2026-08-01

Status:

Stable Development