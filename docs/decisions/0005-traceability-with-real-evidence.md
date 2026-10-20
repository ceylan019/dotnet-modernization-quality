# 0005: Traceability counts only real evidence

**Status:** accepted (2026-10-20). The gate itself is built before the conversion.

## Context

A risk register is only useful if something enforces it. The usual failure is quiet: a test that is tagged with a risk but skipped, a parity run that compared nothing because the baselines were missing, a migration check that ran on an empty table. Each of those shows green.

## Decision

- Every risk in `docs/quality/risks.json` has an ID of the form `RISK-AREA-01`, loaded and validated on every run (unique, well formed, every field present).
- Every test carries the IDs of the risks it covers as tags, for example `@RISK-FEE-01`.
- At each stage the traceability gate fails when:
  - a risk of that stage has no passing test or passing check;
  - a tag names a risk that is not in the register;
  - a test has no risk tag at all;
  - a passing test or check examined nothing. Parity tests report how many cases they compared and checks report how many rows or items they examined; a count of zero is a failure, not a pass.
- Skipped tests never cover a risk.
- The gate's own logic, and the parity normalizers it depends on, are unit tested and mutation tested with Stryker, with a break threshold of 85.
- The gate writes a matrix of every risk and the tests covering it to the job summary and to `reports/traceability.json`.

## Consequences

- Adding a risk to the register makes the gate red until a test proves it, which is the intended pressure.
- Some real concerns are deliberately not risk IDs, because no test could cover them (for example authentication, which the app does not have; see the test strategy, section 2). Those are written down as out of scope instead.
- The markdown register is generated from the JSON (`npm run risks:md`), and a unit test fails if the two drift apart.
