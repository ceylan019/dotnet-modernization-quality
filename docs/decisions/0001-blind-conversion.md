# 0001: The conversion runs blind, once

**Status:** accepted (2026-10-20), subject to the owner's approval of the quality plan.

## Context

The conversion from .NET Framework to .NET 10 is done by an AI coding agent standing in for a commercial modernization tool. Those tools work from the source code and a target description; they know nothing about the quality plan that will judge their output. The legacy app was built on purpose with realistic migration hazards, and the seed data, its catalog, the tests and the risk register all point straight at them. An agent that could read any of that would steer around the hazards, and the tests would prove nothing about a real conversion.

A second temptation is to run the conversion, look at the result, adjust the instructions and run it again until the story looks good. That would be fishing.

## Decision

- The conversion runs in a separate agent session whose workspace contains only `legacy/` and `docs/conversion/brief.md`.
- It does not see `tests/` (seed data, catalog, baselines, test code), `docs/quality/`, the decision records, or the design document.
- The brief names the target stack and the deployment contract the pipeline needs, and nothing about tests, risks or data.
- The agent may write its own requirements, design and task documents, build its output, start the app, and run its own checks, as a modernization tool validates its builds.
- It runs **once**. Its output is committed as is, with one commit per layer (schema and functions, data access, business logic, API, UI, data migration), on one pull request.
- Fixes land afterwards as separate commits on the same pull request, each referencing a defect ID.

## Alternatives considered

- **Convert by hand with full knowledge.** Produces a clean result and an empty defect log, and tells a reviewer nothing about how a quality layer catches a tool's mistakes.
- **Let the agent see the tests.** It would teach to the test.
- **Allow reruns.** Every rerun after seeing a result is a choice of which story to tell.

## Consequences

- The defects in the log are whatever the conversion really got wrong. Some planted hazards may be handled correctly; that is a result too.
- If the conversion is so clean that no test fails, the owner and builder discuss how to present that honestly. Failures are never invented.
- If the conversion does not build at all, that is recorded as is, and the owner decides what happens next.
- The conversion's own unit tests run in the build stage but never count as evidence for a risk.
