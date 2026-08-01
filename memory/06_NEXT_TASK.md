# NEXT TASK

---

## Current: v1.0.0 Release Preparation

Milestone 9 (Stock Opname + Production Hardening, Phases 9.1–9.5D) is COMPLETE.
Phase 9.5D (Production Readiness Review) is delivered. Build verified.
Wait for approval before starting the next phase.

### Phase 9.5D Completed Tasks

- Removed invalid `dynamicRoutes` key from next.config.js (build warning eliminated)
- Removed legacy `pages/` router (Pages Router `_app`/`_error`)
- Removed dead `app/providers.js` duplicate, `lib/constants/testIds`, root scratch scripts
- Removed 9 unused dependencies (mongodb, swr, axios, dayjs, framer-motion, uuid, lodash, embla-carousel-react, @types/lodash)
- Declared missing `xlsx` dependency (Excel export)
- Upgraded `next` to 15.5.22; patched `postcss` (8.5.25) and `sharp` (0.35.3) via npm overrides
- Added `.env.example` documenting DATABASE_URL, JWT_SECRET, NODE_ENV, CORS_ORIGINS
- Fixed reports test suite parse error (`jest` from `@jest/globals`)
- Synced README + memory docs to v0.9.7

### Remaining for v1.0.0 (after approval)

- Upgrade Prisma CLI (dev-tooling only: `effect` advisory in `@prisma/config`)
- Investigate 22 pre-existing reports acceptance test failures (STAGING seeding, dashboard KPI expectations, pagination, timing)
- Optional: remove unused shadcn/ui components and their now-unused Radix deps
- Optional: re-run tests serially with `npm test -- --runInBand` (parallel runs race on shared seed IDs)

### Milestone 10 / v1.0.0 Tasks (deferred)

- Background job processing
- Concurrency & stress testing
- Monitoring & logging
- Security hardening
- CI/CD pipeline
- Production deployment
