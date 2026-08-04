# 📦 WMS Enterprise

> Modern Enterprise Warehouse Management System built with Next.js, Prisma, PostgreSQL (Neon), React Query and Cloudinary.

![Version](https://img.shields.io/badge/version-v1.5.0-blue)
![Status](https://img.shields.io/badge/status-Stable-success)
![License](https://img.shields.io/badge/license-MIT-green)

---

# Overview

WMS Enterprise is a modern Warehouse Management System designed to manage the complete warehouse lifecycle:

Inbound

Purchase Order
→ Receiving
→ Putaway

Outbound

Sales Order
→ Picking
→ Packing
→ Shipping

Inventory

Stock Ledger

FIFO

Stock On Hand

Warehouse Location

Analytics

Audit Trail

---

# Features

## Master Data

- Warehouse
- Zone
- Warehouse Location
- Supplier
- Item
- Category
- UOM
- User
- Roles

---

## Warehouse Location

- CRUD
- Archive / Restore
- Barcode
- QR Code
- Print Label
- Occupancy
- Capacity Monitoring
- Validation Engine
- Dependency Engine

---

## Receiving

- Draft
- Receiving Workflow
- Variance Resolution
- Outstanding
- Batch / Lot
- Header Attachment
- Line Evidence
- Camera Capture
- Image Gallery
- Thumbnail Preview

---

## Putaway

- Putaway Document
- Putaway Tasks
- Smart Location
- Barcode Scan
- Item Scan
- Auto Inventory Posting

---

## Picking

- FIFO Allocation
- Picking Order
- Picking Tasks
- Barcode Validation
- Location Validation
- Item Validation

---

## Packing

- Package Management
- Package Allocation
- Packing Completion

---

## Shipping

- Shipment Queue
- Shipment Confirmation
- Stock OUT Posting
- FIFO Consumption

---

## Inventory

- Stock Ledger
- FIFO Layer
- Stock Adjustment
- Cycle Count
- Stock Opname
- Stock Transfer

---

## Analytics

- Warehouse Analytics
- Inventory Analytics
- Trend Analytics

---

# Enterprise Workflow

```text
Purchase Order
        │
        ▼
Receiving
        │
        ▼
Waiting Putaway
        │
        ▼
Putaway
        │
        ▼
Inventory
        │
        ▼
Sales Order
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
Stock OUT
```

---

# Tech Stack

## Frontend

- Next.js 15
- React 19
- TailwindCSS
- TanStack Query
- React Hook Form
- Zod

## Backend

- Next.js Route Handlers
- Prisma ORM
- PostgreSQL (Neon)

## Storage

- Cloudinary

## Authentication

- JWT
- Role Based Access Control

---

# Architecture

```
app/
components/
lib/
prisma/
public/

Receiving
Putaway
Picking
Packing
Shipping

Validation Engines

Location Engine
Occupancy Engine
Identification Engine
Label Engine
Attachment Engine
Evidence Engine
```

---

# Validation Engines

- Warehouse Validation
- Zone Validation
- Location Validation
- Capacity Validation
- Barcode Validation
- Evidence Validation
- Attachment Validation

---

# Warehouse Location

Supports

- Barcode
- QR Code
- Label Printing
- Occupancy
- Remaining Capacity
- Utilization
- Smart Recommendation

---

# Attachment

Document Attachment

- Purchase Order
- Invoice
- Delivery Order
- Other

Evidence

- Upload Image
- Camera
- Preview
- Gallery
- Thumbnail

---

# Storage

Cloudinary

Images

Evidence

Attachments

Automatic Thumbnail

---

# Inventory Engine

Stock Ledger Driven

Inventory is never stored directly.

Stock On Hand

=

SUM(Stock Ledger)

FIFO Layer

=

Automatic

---

# Lifecycle Synchronization

Receiving

↓

Putaway

↓

Inventory

↓

Picking

↓

Packing

↓

Shipping

↓

Stock Ledger OUT

---

# Current Version

## v1.5.0

### Added

- Warehouse Location Management
- Occupancy Engine
- Barcode Engine
- QR Engine
- Label Service
- Enterprise Receiving
- Enterprise Putaway
- Enterprise Picking
- Enterprise Packing
- Enterprise Shipping

### Improved

- Validation Engine
- Attachment Engine
- Evidence Engine
- Lifecycle Synchronization
- Transaction Safety

### Fixed

- Evidence Upload
- Header vs Line Attachment
- Camera Upload
- Barcode
- QR
- Print Label
- Putaway Scanner
- Picking Validation
- Packing Workflow
- Shipping Lifecycle

---

# Roadmap

## v1.6

- Dashboard Improvements
- Inventory KPI
- Wave Picking
- Replenishment
- Return Management
- ASN
- Cross Docking

---

# Build

```bash
npm install

npx prisma generate

npm run dev
```

---

# Production

```bash
npm run build

npm start
```

---

# License

MIT

---

# Author

Muhammad Sopyan Maulana Ahsan

WMS Enterprise
2026