# KNOWN ISSUES

This file contains existing issues that are NOT part of the active milestone.

AI assistants MUST read this file before debugging.

Do NOT repeatedly investigate these issues unless explicitly requested.

---

## Issue 1 — RESOLVED

Title

Next.js /404 prerender

Status

Resolved (v0.9.7)

Action

Closed

Reason

Fixed by app/not-found.js (App Router). Build runs clean with no /404 prerender errors.

---

## Issue 2 — RESOLVED

Title

Next.js /500 prerender

Status

Resolved (v0.9.7)

Action

Closed

Reason

Fixed by app/error.js (App Router). Build runs clean with no /500 prerender errors.

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

## Issue 7

Title

Tests run in parallel race on shared seed data

Status

Known Issue

Priority

Medium

Action

Run tests serially:

npm test -- --runInBand

Reason

Jest runs suites in parallel by default; multiple suites seed the same fixed IDs against Neon, causing unique-constraint and RESTRICT cleanup failures.

---

## Issue 8

Title

Reports acceptance tests — 22 pre-existing failures

Status

Known Issue

Priority

Medium

Action

Investigate during v1.0.0 release prep (after Phase 9.5D approval)

Reason

After fixing the suite parse error, 22 tests fail on STAGING location seeding, dashboard KPI expectations, pagination, and timing thresholds. Not introduced by Phase 9.5D (report services and test logic were not modified).

---

## Issue 9

Title

Prisma CLI dev-tooling advisory (effect)

Status

Known Issue

Priority

Low

Action

Upgrade prisma + @prisma/client together in a dedicated maintenance window

Reason

`npm audit` reports the `effect` advisory via `@prisma/config` (Prisma CLI). Runtime @prisma/client is not affected. Requires a paired CLI/client version bump.

---

## Current Development Rule

Ignore all unrelated build warnings and known prerender issues.

Only investigate bugs that are directly introduced by the current milestone.

Current Active Milestone

v1.0.0 — Release Preparation
