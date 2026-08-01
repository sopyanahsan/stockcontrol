# Enterprise Stock Control & Warehouse Management System (WMS)

> **Version:** v0.8.0
> **Status:** Active Development
> **Current Milestone:** Milestone 9 — Awaiting Definition

---

# Overview

Enterprise Stock Control & Warehouse Management System (WMS) is a modern warehouse management application designed to ensure inventory accuracy, warehouse traceability, and end-to-end stock visibility.

This project is **NOT** an ERP.

Its primary focus is warehouse operations, inventory management, and complete stock traceability using Stock Ledger and FIFO principles.

---

# Project Objectives

- Improve Inventory Accuracy
- Warehouse Process Automation
- FIFO Inventory Management
- Barcode-Based Operations
- Serial Number Tracking
- Complete Audit Trail
- Real-Time Stock Visibility
- End-to-End Traceability

---

# Business Workflow

```
Supplier
    │
    ▼
Receiving
    │
    ▼
STAGING
    │
    ▼
Putaway
    │
    ▼
Warehouse Bin
    │
    ▼
Movement
    │
    ▼
Adjustment / Cycle Count
    │
    ▼
Picking
    │
    ▼
Packing
    │
    ▼
Shipping
    │
    ▼
Customer
```

Every inventory transaction is recorded in the **Stock Ledger** and protected by **Audit Trail**.

---

# Completed Milestones

| Milestone | Module | Status |
|------------|--------|--------|
| M1 | Core Foundation | ✅ Complete |
| M2 | Putaway | ✅ Complete |
| M3 | Stock Movement | ✅ Complete |
| M4 | Stock Adjustment & Cycle Count | ✅ Complete |
| M5 | Picking | ✅ Complete |
| M6 | Packing | ✅ Complete |
| M7 | Shipping | ✅ Complete |
| M8 | Reports & Analytics | ✅ Complete |
| M9 | Multi Warehouse | ⏳ Planned |
| M10 | Production Hardening | ⏳ Planned |

---

# Core Modules

## Security

- Authentication
- Role-Based Access Control (RBAC)

---

## Master Data

- Master Item
- Warehouse Location

---

## Warehouse Operations

### Inbound

- Receiving
- Putaway

### Internal

- Stock Movement
- Stock Adjustment
- Cycle Count

### Outbound

- Picking
- Packing
- Shipping

---

## Inventory Engine

- Stock Ledger
- FIFO Engine
- Barcode Service
- Audit Trail
- Document Number Generator

---

# Technology Stack

## Frontend

- Next.js 15 (App Router)
- React 18
- Tailwind CSS
- Radix UI
- React Hook Form
- TanStack React Query
- Recharts
- Framer Motion

---

## Backend

- Next.js API Routes
- Service Layer Architecture
- REST API

---

## Database

- Neon PostgreSQL

---

## ORM

- Prisma ORM

---

# Project Structure

```
app/
components/
lib/
memory/
prisma/
scripts/
tests/

README.md
CLAUDE.md
package.json
```

---

# Core Services

```
receiving-service.js
putaway-service.js
movement-service.js
adjustment-service.js
cycle-count-service.js
picking-service.js
packing-service.js
shipping-service.js

fifo-service.js
stock-validation.js
barcode-service.js
audit.js
doc-numbering.js

# Reports Services

dashboard-report.js
inventory-report.js
operations-report.js
audit-report.js
export-service.js
```

These services contain all business logic.

UI should never duplicate business rules.

---

# Architecture Principles

The project follows these architectural principles:

- Stock Ledger is the Single Source of Truth.
- Inventory MUST NEVER be updated directly.
- FIFO allocation is mandatory.
- Every inventory transaction generates Stock Ledger entries.
- Every business transaction generates an Audit Trail.
- Barcode-first warehouse workflow.
- Feature-based modular architecture.
- Service Layer pattern.
- Atomic database transactions using Prisma.
- End-to-End inventory traceability.

---

# Local Development

## 1. Install Dependencies

```bash
npm install
```

---

## 2. Environment Variables

Create:

```
.env
```

Example:

```env
DATABASE_URL="postgresql://..."

JWT_SECRET="your-secret"

NODE_ENV="development"
```

---

## 3. Generate Prisma Client

```bash
npx prisma generate
```

---

## 4. Sync Database

```bash
npx prisma db push
```

---

## 5. Run Development Server

```bash
npx next dev
```

Open:

```
http://localhost:3000
```

---

# Development Rules

Always reuse existing services.

Never duplicate business logic.

Never bypass:

- Stock Ledger
- FIFO Engine
- Audit Trail

Never update inventory directly.

All inventory changes must occur through existing services.

---

# Reports

Reports are READ ONLY.

Reports must never:

- modify inventory
- modify stock ledger
- modify FIFO
- modify audit logs

Reports consume existing business data only.

---

# Testing

Acceptance tests are located in:

```
tests/
```

Current completed modules include:

- Receiving
- Putaway
- Movement
- Adjustment
- Cycle Count
- Picking
- Packing
- Shipping
- Reports & Analytics (61 tests)

---

# Memory Documentation

Project knowledge is stored in:

```
memory/
```

| File | Purpose |
|------|---------|
| 00_PROJECT_OVERVIEW.md | High-level project overview |
| 01_ARCHITECTURE.md | System architecture |
| 02_BUSINESS_RULES.md | Warehouse business rules |
| 03_DATABASE_RULES.md | Database standards |
| 04_CODING_RULES.md | Coding conventions |
| 05_PROJECT_STATUS.md | Current project status |
| 06_NEXT_TASK.md | Upcoming milestones |
| 07_DO_NOT_CHANGE.md | Protected architecture |
| 08_ACCEPTANCE_TEST.md | Acceptance test history |
| 09_KNOWN_ISSUES.md | Known issues |
| 10_RELEASE_NOTES.md | Release history |

---

# Documentation Priority

Every AI assistant or developer joining this project should read documents in the following order:

1. README.md
2. CLAUDE.md
3. memory/00_PROJECT_OVERVIEW.md
4. memory/01_ARCHITECTURE.md
5. memory/02_BUSINESS_RULES.md
6. memory/03_DATABASE_RULES.md
7. memory/04_CODING_RULES.md
8. memory/05_PROJECT_STATUS.md
9. memory/06_NEXT_TASK.md
10. memory/07_DO_NOT_CHANGE.md
11. memory/08_ACCEPTANCE_TEST.md
12. memory/09_KNOWN_ISSUES.md
13. memory/10_RELEASE_NOTES.md

---

# License

Private Project.

Copyright © 2026.

All rights reserved.