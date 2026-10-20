# 0002: Parity compares against recorded legacy baselines

**Status:** accepted (2026-10-20). No baseline has been recorded yet: recording needs the Windows runner, which needs the GitHub repository ([0007](0007-private-first-then-public.md)).

## Context

Parity means the modern app behaves like the legacy app. The obvious design runs both apps side by side and compares live responses. But the legacy app runs only on .NET Framework, which means only on a GitHub Windows runner ([0006](0006-legacy-runs-on-windows-runners.md)), and Windows minutes count double against the free allowance of a private repository. The modern app runs on Linux and on the Mac. Running both for every comparison would tie every pipeline run and every local check to a Windows machine.

## Decision

- A manually started workflow on the Windows runner runs the parity suites against the legacy app in **record** mode and writes one normalized JSON file per case to `tests/baselines/legacy/<suite>/<caseId>.json`, with the request and the risks the case covers.
- Recording happens only against the legacy app. The test configuration refuses `PARITY_MODE=record` with any other target, so a modern response can never become a baseline.
- Each recording runs twice and the two outputs are diffed. Only `recordedAt` may differ; anything else is nondeterminism and is fixed before committing.
- Baselines are committed and reviewed like code. Any change to them is owner approval point 2.
- Every other run uses **compare** mode against the committed files, on Linux and on the Mac. A missing baseline fails the test.
- The local Mono preview of the legacy app is a debugging aid. Nothing it produces is ever committed as a baseline.

## Consequences

- Day to day work and every pipeline stage after build run without Windows.
- Baselines are a frozen picture. The legacy app is frozen too, so they stay valid; if the legacy app ever changed, the baselines would be re-recorded through the same workflow and reviewed again.
- The normalization applied before recording becomes part of the contract. It is deliberately minimal (key order, first line of error messages, volatile values with a format check) and is unit tested and mutation tested, because a forgiving normalizer would hide real differences.
- A baseline can be wrong (for example an order that legacy does not keep stable). That is a baseline defect, fixed by re-recording, never by editing the file by hand.
