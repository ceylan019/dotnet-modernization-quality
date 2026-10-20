# Walkthrough: the repository in ten minutes

A script for explaining this repository in an interview, in the order a reviewer should read it. Each stop names the files to open, the point to make, and roughly how long it takes. The questions an interviewer is likely to ask follow at the end, with short, honest answers.

Drafted by Claude Code for the owner, who presents it in their own words. It describes the state on 2026-10-20: the foundation exists, nothing has run on GitHub yet, and the conversion has not happened.

## The one sentence (15 seconds)

An AI agent converts a legacy .NET app to a modern stack; this repository is the quality engineering that decides whether its output can ship. **AI migrates, QE proves it's safe.**

## 1. The README, first screen (45 seconds)

Open [README.md](../../README.md).

- The idea came from LAB200 "Introducing Kiro" at the AWS Public Sector AI Symposium in Ottawa. The slide showed AWS Transform moving a Windows .NET stack (Web Forms, SQL Server, a Windows VM) to .NET 10, Blazor, Aurora PostgreSQL and Linux containers.
- Everything here is free: Claude Code stands in for Kiro and AWS Transform, PostgreSQL in Docker for Aurora, Docker Compose for ECS, GitHub Actions for the pipeline. No AWS account, Kiro or AWS Transform was used.
- Point at the status line. It says what has run and what has not, and that matters more than the feature list.

## 2. What "safe" means (1 minute)

Open [test-strategy.md](test-strategy.md), sections 1 and 3.

- Safe is four things with evidence: the behavior matches the legacy app, no page is less accessible or less secure, every row and value of the data arrives intact within a cutover window, and the released image is the tested one.
- The approach: risk based, evidence instead of green ticks, the legacy app as the oracle (characterization, not requirements), and a blind conversion.
- Mention what is deliberately out of scope in section 2, such as authentication: the legacy app has none, so there is no risk ID for it, because the gate would then demand a test for a control that does not exist. A real migration would add it, and the strategy says what that would need.

## 3. The risk register (1 minute 30 seconds)

Open [risk-register.md](risk-register.md).

- 37 risks, each scored for likelihood and impact, each with a concrete detection and the pipeline stage that must prove it.
- Walk through one: **RISK-FEE-01**. SQL Server `ROUND` rounds halves away from zero, .NET `Math.Round` rounds halves to even. A RENO permit at 10.70 m² has a raw fee of 175.145: legacy charges 175.15, a naive port charges 175.14. A cent on every half is a systematic error on a public fee.
- The detection column names the spec and the data that cover it. The markdown is generated from [risks.json](risks.json), and a unit test fails if the two drift apart.

## 4. The legacy app and its planted hazards (1 minute)

Open [`legacy/db/03-procedures.sql`](../../legacy/db/03-procedures.sql) at `usp_CalculateFee` (the `ROUND(@raw, 2)` line), then [`legacy/src/Permits.Web/Detail.aspx`](../../legacy/src/Permits.Web/Detail.aspx) (the applicant name written with `<%= %>`).

- Say it plainly: the hazards are deliberate. The app was designed so that a straightforward conversion can break quietly, the way real migrations do. The README lists them all.
- The seed data is synthetic and aimed at them: accented, mixed case and trailing space names, names containing HTML, fees that land exactly on half a cent, dates on weekends, holidays, leap day and daylight saving changes. [`tests/seed-data/catalog.json`](../../tests/seed-data/catalog.json) lists the records per hazard, and tests pick from the catalog, never by hard-coded ID.

## 5. One test, two apps, and recorded baselines (2 minutes)

Open these in order:

1. [`tests/src/drivers/types.ts`](../../tests/src/drivers/types.ts): one interface per page, implemented for Web Forms now and for Blazor after the conversion. Values are the strings a user sees, so currency and date formatting are part of what parity compares.
2. [`tests/specs/api/fee-quote.spec.ts`](../../tests/specs/api/fee-quote.spec.ts): every active permit type × five areas × four discount combinations, plus every half cent probe from the catalog. Each case is tagged with the risks it covers.
3. [`tests/src/parity/expect-parity.ts`](../../tests/src/parity/expect-parity.ts): in record mode it writes a baseline; in compare mode a missing baseline fails, a changed request fails, and any difference not approved by the owner fails with its path.
4. [`tests/src/parity/normalize.ts`](../../tests/src/parity/normalize.ts): it changes only key order, the first line of error messages, and volatile values that have the expected format. It never trims, folds case, reformats numbers or sorts arrays.

The point: the legacy app runs only on Windows, so it is recorded once on a Windows runner, twice in a row with a diff to prove determinism, and the modern app is compared against those files everywhere else ([decision 0002](../decisions/0002-recorded-legacy-baselines.md)).

## 6. The gate that refuses empty evidence (1 minute)

Open [`tests/src/gate/traceability.ts`](../../tests/src/gate/traceability.ts) and [`tests/stryker.config.mjs`](../../tests/stryker.config.mjs).

- The gate fails a stage when a risk of that stage has no passing test, a test has no risk tag, a tag names an unknown risk, or a passing test examined nothing. Skipped tests never count, and a record mode run is refused.
- The most dangerous code in the repository is the test code that decides what counts as equal. Stryker mutates the parity engine and the gate, and the build breaks below a mutation score of 85. Unit tests pin `" Roy"` vs `"Roy"`, `"174.67"` vs `174.67` and a reordered list as differences.

## 7. The pipeline (1 minute)

Open [`.github/workflows/pipeline.yml`](../../.github/workflows/pipeline.yml), then [`.github/workflows/legacy.yml`](../../.github/workflows/legacy.yml).

- build, dev, qa on Linux. The image is built once, and dev and qa check its digest before testing ([decision 0003](../decisions/0003-build-once-promote-by-digest.md)). Promotion is strict: qa runs only after dev is green.
- Today `modern/` holds a placeholder that answers `/healthz` and returns 501 everywhere else, so dev is red by design and qa is skipped. That red is the starting line the conversion has to turn green.
- The Windows workflow builds the legacy app, installs SQL Server natively, starts IIS Express, and runs either smoke or the two-pass recording ([decision 0006](../decisions/0006-legacy-runs-on-windows-runners.md)). It is written and lint clean, and unproven until its first run.

## 8. The conversion and the release (1 minute)

Open [`docs/conversion/brief.md`](../conversion/brief.md), [decision 0001](../decisions/0001-blind-conversion.md), then [release-plan.md](release-plan.md) and [decision 0004](../decisions/0004-point-of-no-return.md).

- The brief is the whole of what the conversion agent sees, besides `legacy/`: the target stack and the deployment contract, nothing about tests, risks or data. It runs once, and its output is committed as is, one commit per layer.
- The release plan: four environments, go/no-go criteria, a cutover sequence, and the **point of no return**, the first user write to PostgreSQL. Before it, rollback means sending users back to the untouched legacy database. After it, the plan is to fix forward. Every go/no-go record states which side of that line it is on.

## 9. Close: what is proven and what is not (15 seconds)

Open [test-strategy.md, section 13](test-strategy.md#13-known-limits).

- Proven on a Mac: the framework, the database scripts, the API suites against a local preview, the migration validator on scratch tables.
- Not proven yet: anything on Windows or GitHub, the official baselines, the conversion and every release step. The known limits are written down so nobody mistakes them for coverage.

## Questions you are likely to get

**Why a blind conversion?**
A modernization tool knows nothing about your quality plan. If the converting agent could read the tests, the seed catalog or the risk register, it would steer around the hazards and the tests would prove nothing. It also runs only once: re-running it under new instructions after seeing the result would be choosing which story to tell ([decision 0001](../decisions/0001-blind-conversion.md)).

**Why recorded baselines instead of running both apps side by side?**
The legacy app runs only on .NET Framework, so only on a Windows runner, and Windows minutes count double on the free plan. Running both apps for every comparison would tie every pipeline run and every local check to a Windows machine. The legacy app is frozen, so a recording stays valid, and committed baselines are reviewable like code: any change to them is an owner approval ([decision 0002](../decisions/0002-recorded-legacy-baselines.md)).

**What does the traceability gate refuse?**
A risk of the stage with no passing test, a test with no risk tag, a tag that names a risk not in the register, and a passing test or check that examined nothing (zero parity cases, zero migrated rows). Skipped tests never cover a risk, and it refuses to evaluate a record mode run at all ([decision 0005](../decisions/0005-traceability-with-real-evidence.md)).

**What is the Mono preview, and what is it not?**
A Docker image that serves the built Web Forms app on Mono, so the drivers and API suites could be exercised on a Mac before any Windows run. It is not .NET Framework: culture data, error pages, `SqlClient` behavior and Web Forms rendering differ (for example, Mono repeats a database error message on a second line, and it needs a small module to strip extra client ID segments). Nothing it produces is ever a baseline or evidence. Official results come only from the Windows runner.

**What is not proven yet?**
No workflow has run on GitHub, because the repository is still local. The Windows recipe for the legacy app is written but unproven. There are no official baselines. The UI, accessibility and security suites are not written yet. The conversion, staging, prod, the releases and the rollback drill all come later. The status section of the README keeps this list current.

**You built the legacy app and the tests. Didn't you plant the bugs?**
The hazards are planted, openly, and the README lists them. The defects are not: a defect is only what a test catches in the converted code, during a real run, with a link to that run. The guards are the blind, single conversion and a defect log that records only real catches. If the conversion handles every hazard correctly, the write-up will say so rather than invent failures. The strategy names this as a known limit (section 13).

**Why mutation test the test code?**
Because the parity normalizer is where a migration test suite most easily lies. One that trims strings, folds case or sorts arrays would hide exactly the hazards above and turn every parity test green. Mutation testing shows that the unit tests fail when that logic is broken.

**How do you handle flaky tests?**
Retries are off, so flakiness is visible. An intermittent failure is a defect in the test or the app and is logged as one. Quarantining a test needs the owner's approval and leaves its risks uncovered, so the gate stays red until something else covers them.

**What happens when the modern app should differ from legacy?**
The legacy app writes names unencoded and leaks exception details. The modern app must not copy that. Each such case becomes an approved difference: a narrow entry with the exact path, a reason and the owner's approval, applied only where it was observed ([approved differences](approved-differences.md)).

**How long would the cutover take?**
The plan sizes the window from the staging rehearsal: twice the measured migration plus validation time on 50,000 applications, plus 30 minutes for smoke, the decision and the switch. The proposed gate is 10 minutes for migration plus validation, so at most 50 minutes. The rehearsal has not run yet.

**What would a real migration need beyond this?**
Authentication and authorization (the legacy app has none), redirects for old URLs, a cutover rehearsal on a copy of production data, cross-browser coverage, and the failure modes of real infrastructure. The strategy lists these as out of scope or known limits rather than pretending to cover them.

**Who did what?**
The owner, a Quality Engineer, set the goals, made the key decisions, reviews the documents and approves at three points: the quality plan before the conversion, every baseline change and accepted difference, and each release. Claude Code wrote the code and the first drafts of the documents under the owner's direction. A separate Claude Code session does the conversion.
