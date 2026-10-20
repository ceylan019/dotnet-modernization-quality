# Release plan

**Status:** draft for the owner's review at approval point 1. The staging and prod stages it describes are built after the conversion, in the second half of the project.
**Decision owner:** Ceylan Akyol. Every go/no-go decision and every prod approval is theirs.

## 1. What gets released

- **One container image** of the modern app, built once in the build stage and identified by its digest from then on. Releasing means tagging that exact digest with a version, pushing it to GitHub Container Registry, and creating a GitHub Release that carries the release notes and the go/no-go record.
- **The data migration script,** which moves the SQL Server database to PostgreSQL. It ships in the same commit as the image and is rehearsed for real in staging on 50,000 applications.

There are no running production servers in this project (a deliberate non-goal). "Production" is the versioned, released image plus its evidence. The cutover steps in section 6 are written as a real cutover would run them; staging executes the data part of them for real, and the rest is documented, not performed.

## 2. Sequence

1. **`v1.0.0-rc.1`:** the first trip through prod, from the commit on which qa and staging passed after the conversion's defects were fixed. Owner approval point 3.
2. **`v1.0.0`:** the release itself, with its own go/no-go record. Owner approval point 3 again.
3. **Rollback drill:** roll prod back from `v1.0.0` to `v1.0.0-rc.1` by re-promoting the earlier digest, run smoke, roll forward again. Labeled as a drill everywhere ([runbook](rollback-runbook.md#5-rollback-drill)).
4. **Post-release report:** what each stage caught, every defect with its run and fix, the drill result, what escaped (if anything), and what to change next time.

Versions follow semantic versioning. A fix after `v1.0.0` ships as a patch version through the full pipeline; nothing skips a gate.

## 3. Environments

| Environment | Question it answers | Data | Introspection | Promotion into it |
|---|---|---|---|---|
| dev | Does the image start and speak the contract? | Small seed (407 applications) | On | Automatic after build |
| qa | Does it behave like the legacy app? | Small seed | On | Automatic after dev |
| staging | Does the data survive the move, fast enough? | Large seed (50,000 applications) migrated from SQL Server by the migration script | Off | Automatic after qa |
| prod | Is this exactly what we tested, and does it run with production configuration? | Production configuration, no fixed date | Off | Owner approval on the GitHub Environment |

Each environment exists only for the length of its pipeline stage. Configuration differs only through environment files and GitHub Environment secrets; nothing secret is committed. Staging uses production-like configuration (introspection off) so that prod holds no first-time settings beyond its connection string.

## 4. Promotion rule

The image is built once and promoted by digest ([decision 0003](../decisions/0003-build-once-promote-by-digest.md)). The prod job compares the digest it is about to tag with the digest that qa and staging tested, and refuses to tag or release on any mismatch. A rebuild, even of the same commit, is a new artifact and starts again at build.

## 5. Go/no-go criteria

The owner decides GO only when every one of these holds for the same digest, and records the decision with a copy of the [go/no-go template](go-no-go-template.md):

1. The qa exit criteria of the [test strategy](test-strategy.md#exit-from-qa) are met: no unapproved parity differences, no unapproved breaking schema change, accessibility, security and Lighthouse checks green, mutation score at or above 85, every qa risk covered with non-empty evidence.
2. The staging exit criteria are met: migration validation green, migration plus validation within the window, k6 thresholds met, every staging risk covered.
3. No open S1 or S2 defect. Every accepted S3 is listed as a known issue in the release notes.
4. Every approved difference applied in the qa run is in `tests/approved-differences.json` with the owner's approval and a reason.
5. The rollback target (previous version and its digest) is written down, and the [rollback runbook](rollback-runbook.md) has been reviewed for this release.
6. The record states which side of the point of no return the release is on ([decision 0004](../decisions/0004-point-of-no-return.md)).

**Automatic NO-GO:** any criterion unmet, evidence produced on a different digest, or evidence older than the last commit that changed the app.

## 6. Cutover

This is the sequence a real cutover from the legacy app would follow. Staging rehearses steps 3 to 6 on every run.

| Step | Action | Check before moving on |
|---|---|---|
| 1 | One day before: confirm the go decision for the cutover, the window, and that partner systems and staff have been told | Window agreed; notice sent |
| 2 | Stop writes to the legacy app: `ALTER DATABASE Permits SET READ_ONLY`. Pages still read; submissions and status changes fail | A test submission is refused |
| 3 | Take a copy-only full backup of SQL Server | Backup restores on a scratch instance |
| 4 | Run the migration script into an empty PostgreSQL database | Script exits cleanly; duration recorded |
| 5 | Run the migration validation: counts, column checksums and aggregates, hazard records, foreign keys, constraints | All green |
| 6 | Start the modern image against the migrated database and run smoke, with users still on the legacy app | Smoke green |
| 7 | Owner decides to switch | Decision recorded |
| 8 | Point traffic at the modern app | Smoke green through the public address |
| 9 | **Point of no return:** PostgreSQL accepts its first user write. Before this, rollback means returning users to the legacy app. After it, the plan is to fix forward | Time recorded |
| 10 | Watch smoke and errors closely for the first two hours | No S1 |
| 11 | Keep the legacy database read-only for 30 days for reference, then retire it | Retirement approved by the owner |

**Sizing the window.** The planned window is twice the migration plus validation time recorded in the latest staging rehearsal, plus 30 minutes for smoke, the decision and the switch. With the proposed gate of 10 minutes for migration plus validation, the window is at most 50 minutes. The rehearsal uses 50,000 applications; a real cutover would re-measure on a copy of production data.

## 7. Release notes

Each GitHub Release carries:

- version, image digest and commit;
- what changed since the previous release;
- the approved differences in effect, each with its reason;
- known issues (accepted S3 defects);
- links to the qa and staging runs that produced the evidence, the traceability matrix and the test report;
- the go/no-go record.

## 8. After the release

- Smoke runs against the released image straight after release (RISK-REL-02), including a check that introspection is refused (RISK-REL-03).
- A nightly workflow pulls the released image, runs smoke and opens or updates a GitHub issue on failure. This stands in for production monitoring.
- The rollback drill runs after `v1.0.0` (RISK-REL-04).
- The post-release report is written once the drill is done.

## 9. Current state and prerequisites

As of 2026-10-20 the repository is local only. The owner creates it on GitHub as a private repository, reviews it, and then makes it public ([decision 0007](../decisions/0007-private-first-then-public.md)). Several release mechanics depend on that switch:

- required reviewers on GitHub Environments (the prod approval) are not available on a free private repository, so the staging and prod stages run only after the repository is public;
- GitHub Pages for the test report likewise waits for the public switch;
- private package storage on the free plan is 500 MB, so images are pushed to the registry only at release time, not on every build. Between stages the image travels as a workflow artifact, still checked by digest.
