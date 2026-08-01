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
