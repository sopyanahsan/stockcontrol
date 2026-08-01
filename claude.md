# CLAUDE.md

# STOCKCONTROL WMS

## Project Overview

This project is a Warehouse Management System (WMS) focused on Stock Control for a retail furniture warehouse similar to Dekoruma.

This is NOT an ERP.

Primary goals:

- Inventory Accuracy
- Stock Traceability
- Auditability
- FIFO Compliance
- Zero Direct Stock Editing

---

# Tech Stack

Frontend

- Next.js 15 App Router
- React 19
- Tailwind CSS
- shadcn/ui

Backend

- Next.js Route Handlers

Database

- Neon PostgreSQL

ORM

- Prisma

Deployment

- Vercel

---

# Current Status

Milestone 1
✅ Complete

Implemented:

- Authentication
- RBAC
- Dashboard
- Master Item
- Warehouse Location
- Audit Trail
- Barcode Service
- Document Number Generator
- Receiving
- Stock Ledger
- FIFO Layer
- Serial Number Validation

Current Milestone

➡️ Milestone 2

Putaway

Do NOT modify completed Milestone 1 unless fixing bugs.

---

# Project Structure

app/

api/

audit-trail/

items/

locations/

login/

receiving/

stock/

components/

ui/

app-shell.jsx

barcode-input.jsx

data-table.jsx

hooks/

lib/

auth.js

audit.js

barcode-service.js

doc-numbering.js

prisma.js

receiving-service.js

stock.js

prisma/

schema.prisma

scripts/

seed.js

---

# Business Workflow

Supplier

↓

Receiving

↓

STAGING

↓

Putaway

↓

AVAILABLE BIN

↓

Stock Movement

↓

Adjustment

↓

Reports

Never skip any step.

---

# Core Business Rules

Inventory can NEVER be edited directly.

Every stock change MUST:

Create Stock Transaction

↓

Create Stock Ledger

↓

Update Current Stock

Current Stock must always be derived from Stock Ledger.

---

# Receiving Rules

Receiving always posts into

STAGING

Automatically.

Receiving creates

- Stock Ledger
- FIFO Layer
- Audit Trail
- Putaway Task

Receiving never places stock directly into warehouse bins.

---

# Putaway Rules

Putaway consumes stock from

STAGING

↓

Warehouse Bin

Every Putaway must:

- Create Stock Ledger
- Create Audit Trail
- Update Putaway Task
- Preserve Serial Numbers

No Picking before Putaway.

---

# FIFO Rules

FIFO is automatic.

Always consume the oldest stock layer.

Users cannot manually choose FIFO layers unless Supervisor.

---

# Adjustment Rules

Adjustment NEVER edits stock directly.

Adjustment creates Stock Ledger entries.

Adjustment requires:

- Reason Code
- Remarks
- Approval

---

# Serial Number Rules

Items have

serialTracked

If true:

Quantity

=

Number of Serials

Duplicate serials are prohibited.

Serials remain attached throughout:

Receiving

↓

Putaway

↓

Movement

↓

Adjustment

---

# Barcode Rules

Current MVP

Keyboard Input

USB Scanner

Paste

Future

Camera Scanner

Do not couple barcode logic to UI.

Reuse BarcodeInput.

---

# Document Number Rules

Centralized numbering service.

Examples

GRN-WH01-202607-000001

PUT-WH01-202607-000001

MOV-WH01-202607-000001

ADJ-WH01-202607-000001

Never manually generate document numbers.

Never reuse cancelled numbers.

---

# Coding Standards

Always reuse existing services.

Never duplicate business logic.

Keep feature-based architecture.

Prefer service layer over fat route handlers.

Never rename existing APIs.

Never break backward compatibility.

Never change Prisma schema without migration.

---

# UI Standards

Enterprise Dashboard

Minimal

Flat

No heavy animations

No Glassmorphism

No Landing Page style

Use:

shadcn/ui

Tailwind CSS

Responsive

Keyboard friendly

---

# Current Milestone

Milestone 2

Build:

Putaway Queue

↓

Open Task

↓

Scan Location

↓

Scan Item

↓

Validate

↓

Move Stock

↓

Generate Ledger

↓

Audit Trail

↓

Mark Complete

Stop after Milestone 2 and wait for review.

---

# DO NOT CHANGE

❌ Never edit stock directly.

❌ Never bypass Stock Ledger.

❌ Never remove Audit Trail.

❌ Never bypass RBAC.

❌ Never replace Prisma.

❌ Never replace Next.js App Router.

❌ Never rename existing modules.

❌ Never break Receiving.

❌ Never change Document Number Generator.

---

# Definition of Done

Every feature is complete only if:

✅ UI finished

✅ API finished

✅ Prisma integrated

✅ Audit Trail created

✅ Stock Ledger created

✅ RBAC respected

✅ Error handling added

✅ Validation added

✅ Loading state added

✅ Empty state added

✅ Tested

No feature is considered complete otherwise.