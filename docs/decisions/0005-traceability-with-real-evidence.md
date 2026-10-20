# 0005: Traceability counts only real evidence

**Status:** accepted (2026-10-20). The gate itself is built before the conversion.

## Context

A risk register is only useful if something enforces it. The usual failure is quiet: a test that is tagged with a risk but skipped, a parity run that compared nothing because the baselines were missing, a migration check that ran on an empty table. Each of those shows green.

## Decision

- Every risk in `docs/quality/risks.json` has an ID of the form `RISK-AREA-01`, loaded and validated on every run (unique, well formed, every field present).
- Every test carries the IDs of the risks it covers as tags, for example `@RISK-FEE-01`.
- A risk is covered only when at least one passing test or passing check names it with real evidence behind it, and no test or check that names it failed.
- At each stage the traceability gate fails when it finds any of these problems:
  - `uncovered`: a risk of that stage is not covered;
  - `failing-test`: a test failed, reported once for each registered risk it is tagged with, whatever the stage of that risk;
  - `failing-check`: a check did not pass, reported once for each registered risk it names;
  - `unknown-tag`: a test tag names a risk that is not in the register, a test tag is neither a risk tag nor one of the allowed tags (such as `@smoke`), or a check names a risk ID that is not in the register;
  - `untagged`: a test has no risk tag at all;
  - `empty-evidence`: a passing test or a passing check examined nothing. Parity tests report how many cases they compared and checks report how many rows or items they examined; a count of zero is a failure, not a pass.
- Skipped tests never cover a risk and never block one.
- A run that recorded baselines (record mode) is refused outright: the gate does not evaluate it.
- The gate's own logic, and the parity normalizers it depends on, are unit tested and mutation tested with Stryker, with a break threshold of 85.
- The gate prints a matrix of every risk of the stage and the tests and checks covering it, followed by the problems. The workflow appends that output to the job summary, and the gate writes the same result to `reports/traceability.json`.

## Consequences

- Adding a risk to the register makes the gate red until a test proves it, which is the intended pressure.
- Some real concerns are deliberately not risk IDs, because no test could cover them (for example authentication, which the app does not have; see the test strategy, section 2). Those are written down as out of scope instead.
- The markdown register is generated from the JSON (`npm run risks:md`), and a unit test fails if the two drift apart.
