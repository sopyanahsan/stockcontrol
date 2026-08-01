# 09_KNOWN_ISSUES.md

# KNOWN ISSUES

This file contains existing issues that are NOT part of the active milestone.

AI assistants MUST read this file before debugging.

Do NOT repeatedly investigate these issues unless explicitly requested.

---

## Issue 1

Title

Next.js /404 prerender

Status

Known Issue

Priority

Low

Action

Ignore

Reason

Pre-existing project issue.

Not introduced by current milestones.

---

## Issue 2

Title

Next.js /500 prerender

Status

Known Issue

Priority

Low

Action

Ignore

Reason

Related to prerendering.

Not caused by Receiving, Putaway, Movement, Adjustment, Cycle Count or Picking.

Do not spend development time debugging this issue.

---

## Issue 3

Title

Windows NODE_OPTIONS

Status

Known Issue

Priority

Low

Action

Use:

npm run dev:no-reload

or

npx next dev

Reason

NODE_OPTIONS syntax inside package.json is Linux style.

---

## Issue 4

Title

AI Infinite Debug Loop

Status

Known Issue

Priority

High

Symptoms

AI repeatedly rebuilds the project trying to solve unrelated /404 or /500 prerender issues.

Required Action

Stop immediately.

Treat those errors as out of scope.

Continue implementing the current milestone.

---

## Issue 5

Title

Architecture Rewrite

Status

Forbidden

AI MUST NOT

- Rewrite architecture
- Replace Service Layer
- Replace Prisma
- Replace Next.js App Router
- Replace Stock Ledger logic
- Replace FIFO Engine
- Replace Audit Trail
- Replace Barcode Service

Always extend existing modules.

---

## Issue 6

Title

Duplicate Business Logic

Status

Forbidden

Before creating:

- Service
- API
- Component

AI MUST search the existing project first.

Reuse existing implementations whenever possible.

---

## Current Development Rule

Ignore all unrelated build warnings and known prerender issues.

Only investigate bugs that are directly introduced by the current milestone.

Current Active Milestone

Milestone 6 — Packing