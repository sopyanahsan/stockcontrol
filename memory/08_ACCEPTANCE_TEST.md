# 08_ACCEPTANCE_TEST.md

# ACCEPTANCE TEST

This file records every completed acceptance test.

Only mark PASS after manual verification.

---

# Milestone 1

Receiving

✅ Create Draft

✅ Add Item

✅ Start Receiving

✅ Scan Barcode

✅ Scan Serial

✅ Post To STAGING

✅ Generate Putaway Task

✅ Stock Ledger

✅ Audit Trail

Status

PASS

---

# Milestone 2

Putaway

✅ Queue

✅ Scan Location

✅ Scan Item

✅ Validation

✅ Move To BIN

✅ Receiving Completed

✅ Stock Ledger

✅ Audit Trail

Status

PASS

---

# Milestone 3

Movement

✅ Create Movement

✅ FIFO Allocation

✅ Preview

✅ Stock Ledger

✅ Movement History

✅ Rollback

✅ Atomic Transaction

✅ Source != Destination

Status

PASS

---

# Milestone 4

Adjustment

✅ Adjustment IN

✅ Adjustment OUT

✅ FIFO Integrity

✅ Preview

✅ Rollback

Cycle Count

✅ Variance

✅ Approval

✅ Auto Adjustment

✅ Audit Trail

Status

PASS

---

# Milestone 5

Picking

✅ Create Picking Order

✅ FIFO Suggestion

✅ Assign Picker

✅ Scan Location

✅ Wrong Location

✅ Scan Item

✅ Wrong Item

✅ Scan Serial

✅ Wrong Serial

✅ Duplicate Serial

✅ Wrong Quantity

✅ Partial Picking

✅ Complete Picking

Dashboard

✅ Pending KPI

✅ In Progress KPI

✅ Completed KPI

Status

PASS

---

# Milestone 6

Packing

✅ AC-01: Create packing order from COMPLETED picking

✅ AC-02: Start packing transitions QUEUE → IN_PROGRESS

✅ AC-03: Scan wrong item is rejected

✅ AC-04: Scan serial not picked is rejected

✅ AC-05: Duplicate serial in same package is rejected

✅ AC-06: Closing empty package is rejected

✅ AC-07: Closing package with items transitions OPEN → CLOSED

✅ AC-08: Reopen closed package transitions CLOSED → OPEN

✅ AC-09: Complete packing with unpacked items is rejected

✅ AC-10: Complete packing when all items are packed

✅ AC-11: Packing does NOT write to Stock Ledger

✅ AC-12: SerialNumber status stays IN_STOCK after packing

✅ AC-13: Duplicate package numbers are rejected by DB constraint

✅ AC-14: Scanning to a closed package is rejected

Status

PASS

---

# Current Test Result

Milestone 1

PASS

Milestone 2

PASS

Milestone 3

PASS

Milestone 4

PASS

Milestone 5

PASS

Milestone 6

PASS

Overall

6 / 6 Milestones Passed

---

# Milestone 7

Shipping

✅ AC-01: Create shipment from COMPLETED packing → status QUEUE

✅ AC-02: Scan wrong package barcode is rejected

✅ AC-03: Package OPEN is rejected

✅ AC-04: Package from different warehouse is rejected

✅ AC-05: Wrong serial in package is rejected

✅ AC-06: Duplicate serial in same package is rejected

✅ AC-07: Preview shipment shows packages, FIFO allocations, and ledger preview

✅ AC-08: Confirm shipment consumes FIFO — qtyRemaining decreases

✅ AC-09: Confirm creates SHIP_OUT Stock Ledger entries

✅ AC-10: Stock Ledger sum reflects inventory reduction after shipment

✅ AC-11: Audit trail records shipment events including FIFO and Ledger

✅ AC-12: Exception during confirm rolls back all changes

✅ AC-13: Duplicate shipment for same packing order is rejected

✅ AC-14: Package already in another shipment is rejected

✅ AC-15: After COMPLETED, package remains CLOSED and immutable

✅ AC-16: Double confirm is rejected on second call

✅ AC-17: All packages VERIFIED → status READY → can confirm

✅ AC-18: Confirm rejected if shipment status is not READY

✅ AC-19: FIFO allocation mismatch rolls back all changes

✅ AC-20: After COMPLETED, no service allows editing the locked shipment

✅ AC-21: Retry FAILED shipment resets to READY

✅ AC-22: Status check prevents duplicate confirmation

Status

PASS

---

# Current Test Result

Milestone 1

PASS

Milestone 2

PASS

Milestone 3

PASS

Milestone 4

PASS

Milestone 5

PASS

Milestone 6

PASS

Milestone 7

PASS

Overall

7 / 7 Milestones Passed
