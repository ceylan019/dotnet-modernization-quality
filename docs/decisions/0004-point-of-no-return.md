# 0004: The point of no return is the first write to PostgreSQL

**Status:** accepted (2026-10-20).

## Context

Rolling back an application image is easy. Rolling back a database migration is the hard part: once users write data to the new database, returning them to the old one throws that data away. A rollback plan that does not say when it stops working is not a plan.

## Decision

- During cutover the legacy SQL Server database is set read-only and otherwise left untouched.
- The **point of no return** is the moment PostgreSQL accepts its first write from a user (a new application or a status change).
- **Before** that point, rollback means sending users back to the legacy app and making its database writable again. Nothing is lost.
- **After** that point, the plan is to fix forward: contain the problem, fix it through the full pipeline, release a patch. No reverse migration from PostgreSQL to SQL Server is built.
- Every go/no-go record states which side of the line its release is on, and the [rollback runbook](../quality/rollback-runbook.md) starts by asking that question.

## Alternatives considered

- **A reverse migration.** It would need its own testing to the same standard as the forward one, for a path used only in an emergency. Building it under pressure would be riskier than the fix it replaces.
- **Dual writes to both databases.** Doubles the surface for the exact hazards this migration is about (rounding, dates, text), and would itself need parity testing.

## Consequences

- The cutover window is sized so that validation and smoke happen before the first write, while rollback is still free.
- This project has no real users, so the legacy fallback is documented and not drilled. The image rollback is drilled (`v1.0.0` back to `v1.0.0-rc.1` and forward again).
