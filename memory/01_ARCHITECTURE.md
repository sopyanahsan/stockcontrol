# Architecture Rules

Inventory can NEVER be edited directly.

All stock changes must create:

Stock Transaction

↓

Stock Ledger

↓

Current Stock

Current Stock is derived from Stock Ledger.

Every inventory transaction creates:

- Audit Trail
- User Activity
- Timestamp

Modules

Dashboard

Master Item

Warehouse Location

Receiving

Putaway

Stock Movement

Adjustment

Reports