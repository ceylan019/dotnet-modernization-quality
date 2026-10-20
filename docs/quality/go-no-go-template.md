# Go/no-go record: `<version>`

> Template. Copy it to `docs/releases/<version>-go-no-go.md` for each release, fill every field, and attach the filled record to the GitHub Release. A field that cannot be filled with evidence is a NO-GO, not a blank.

## Release

| Field | Value |
|---|---|
| Version | `v1.0.0-rc.1` or `v1.0.0` |
| Image digest | `sha256:...` |
| Commit | `<sha>` |
| Previous version and digest (rollback target) | `<version>`, `sha256:...` |
| Date of decision | `yyyy-mm-dd` |
| Decision owner | Ceylan Akyol |

## Evidence

Every row must come from runs on the digest above. Evidence from another digest does not count.

| Criterion | Required | Result | Evidence |
|---|---|---|---|
| qa stage | Green on this digest | | run link |
| Parity, API and UI | 0 unapproved differences | | report link |
| GraphQL contract | 0 unapproved breaking changes | | report link |
| Accessibility | 0 serious or critical violations; no page worse than legacy; keyboard, reflow, landmarks green | | report link |
| Security and console | Encoding, error leakage, headers, console checks green | | report link |
| Lighthouse | Performance 0.80, accessibility 0.95, best practices 0.90 | | report link |
| Mutation score | 85 or more (parity and gate code) | | report link |
| Traceability, qa | 0 uncovered qa risks, 0 empty evidence | | matrix link |
| staging stage | Green on this digest | | run link |
| Migration validation | Counts, checksums, hazard records and foreign keys all equal | | report link |
| Migration duration | Migration plus validation within 10 minutes; window sized at | | report link |
| Load (k6) | p95 under 500 ms; failed requests under 1% | | report link |
| Traceability, staging | 0 uncovered staging risks | | matrix link |
| Open defects | 0 S1, 0 S2; every S3 listed below | | [defect log](../quality/defect-log.md) |

## Approved differences in effect

| ID | Suite and case | What differs | Reason | Approved by, on |
|---|---|---|---|---|
| | | | | |

## Known issues

Accepted S3 and S4 defects shipping in this release, each with its defect ID.

-

## Point of no return

State which side of the line this release is on, and why. For an image-only release with no data cutover, say so.

-

## Rollback readiness

- Procedure that applies (A, B or C in the [runbook](../quality/rollback-runbook.md)):
- Schema difference from the rollback target: none / describe
- Drill status (for `v1.0.0`): scheduled / done, with link

## Decision

- [ ] **GO**
- [ ] **NO-GO**

Conditions or reasons:

-

Signed: Ceylan Akyol, `yyyy-mm-dd`. Prod approval on the GitHub Environment: run link.
