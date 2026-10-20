# Rollback runbook

**Status:** draft for the owner's review. Workflow names and inputs are fixed when the prod stage is built, after the conversion; the steps and decisions here do not change with them.
**Who decides:** the owner declares every rollback and every fix forward. The builder executes and records.

## 1. When to use this runbook

Start here when, after a release:

- smoke fails against the released image and the cause cannot be corrected in configuration within 15 minutes;
- an S1 defect is found (wrong money or dates on records, data loss or corruption, a security exposure, the app does not start);
- the nightly monitor fails twice in a row for the same reason.

A digest mismatch at release time is not a rollback: the prod job refuses to release, so nothing has shipped.

## 2. First question: which side of the point of no return?

The **point of no return** is the moment PostgreSQL accepts its first write from a user: a new application or a status change ([decision 0004](../decisions/0004-point-of-no-return.md)).

- **Before it,** SQL Server still holds every record, untouched and read-only. Sending users back to the legacy app loses nothing.
- **After it,** some data exists only in PostgreSQL. Sending users back would lose it, and no reverse migration exists. The plan is to fix forward.

How to tell, on the migrated database: any application with an ID above the highest ID the migration copied, or any status history entry dated after the migration finished, means the line has been crossed. The highest migrated ID and the migration end time are in the migration validation report of the cutover run. The go/no-go record of each release also states which side it is on.

| Situation | Procedure |
|---|---|
| A new image misbehaves, the database schema is unchanged since the previous release | A: re-promote the previous image |
| Cutover in progress, no user write has reached PostgreSQL | B: back to the legacy app |
| Past the point of no return, or the previous image cannot run on the current schema | C: fix forward |

## 3. Procedures

### A. Re-promote the previous image

The database is left alone. Only the image changes.

1. Open an issue titled `Rollback: <from version> to <to version>` with the reason and the time.
2. Take the previous version's digest from its GitHub Release notes. Do not rebuild from source: a rebuild is a different artifact that no gate has seen.
3. Check that the database schema has not changed between the two versions (no difference in the converted schema scripts between the two tags). If it has, stop and use C.
4. Run the prod job in re-promote mode for the previous version. It verifies the digest against the earlier release record before it tags anything.
5. Run smoke against the re-promoted image, including the introspection refusal check.
6. Record in the issue: versions, digest, times of each step, smoke result, run links. Close the issue only when smoke is green and the defect that caused the rollback is logged.

### B. Back to the legacy app (before the point of no return)

Documented, not drilled: the project has no real traffic, and the legacy app runs only on a Windows runner.

1. Put the modern app behind a maintenance page so no write can reach PostgreSQL.
2. Confirm that no user write reached PostgreSQL (section 2). If one did, stop: the line is crossed, use C.
3. Make the legacy database writable again: `ALTER DATABASE Permits SET READ_WRITE`.
4. Point traffic back at the legacy app.
5. Run the legacy smoke suite against it.
6. Leave the PostgreSQL database untouched for diagnosis. Do not drop it.
7. Record what happened in an issue, and log the defect that caused the rollback.

### C. Fix forward

1. Contain: put a maintenance banner on the affected page, or turn the affected operation off, if that stops the harm.
2. Log the defect as S1 with the failing evidence.
3. Fix on a branch. The fix goes through every stage of the pipeline with the same gates; an emergency does not remove a gate.
4. If data is wrong, correct it with a reviewed SQL script run in a transaction, then rerun the migration validation checks for the affected tables.
5. Release as a patch version (for example `v1.0.1`) with its own go/no-go record.

## 4. Verification after any rollback

- The digest running is the digest in the release record of the version rolled back to.
- Smoke is green, and introspection is refused.
- The rollback issue holds the timeline, and the defect log holds the cause.

## 5. Rollback drill

Runs once, after `v1.0.0` is released. Every artifact of it says **DRILL**: the issue title, the run name, the notes.

1. **Preconditions.** `v1.0.0` released and smoke green. The digest of `v1.0.0-rc.1` read from its release notes. No schema difference between the two tags; if there is one, procedure A cannot be used, and that is itself a finding to record.
2. **Roll back.** Re-promote `v1.0.0-rc.1` by digest (procedure A, steps 2 to 5). Record the time taken.
3. **Roll forward.** Re-promote `v1.0.0` by digest the same way. Record the time taken.
4. **Pass criteria.** Both digests match their release records, both smoke runs are green, and both durations are recorded.
5. **Record.** The result goes into the post-release report and as an addendum to the `v1.0.0` go/no-go record.
