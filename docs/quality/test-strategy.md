# Test strategy

**Status:** draft for the owner's review at approval point 1. Written on 2026-10-20, before any code is converted.
**Owner and approver:** Ceylan Akyol (Quality Engineer). Drafted by Claude Code under the owner's direction.
**Companion documents:** [risk register](risk-register.md) (generated from [risks.json](risks.json)), [release plan](release-plan.md), [rollback runbook](rollback-runbook.md), [approved differences](approved-differences.md), [defect log](defect-log.md), [decision records](../decisions/).

## 1. What is changing, and what "safe" means

A small permit application system for a fictional city is moving from .NET Framework to .NET 10. An AI coding agent does the conversion without seeing anything in this folder. This strategy decides whether its output can ship.

| Layer | Before (`legacy/`) | After (`modern/`) |
|---|---|---|
| UI | ASP.NET Web Forms 4.8: four pages, postbacks, ViewState, GridView | Blazor, static server rendering, interactive only where needed |
| API | GraphQL.NET 2.4 at `POST /graphql` | Hot Chocolate at `POST /graphql`, same operations |
| Logic and data access | Class libraries, synchronous ADO.NET calling stored procedures | .NET 10 class libraries calling PostgreSQL functions |
| Database | SQL Server 2022: five tables, two functions, eight procedures | PostgreSQL: converted schema, PL/pgSQL functions, migrated data |
| Hosting | IIS on Windows (IIS Express on a GitHub Windows runner here) | Linux container (Docker Compose here, standing in for ECS or EC2) |

The release is safe when all four of these hold, with evidence:

1. **Behavior.** Everything a user or a partner system can observe matches the legacy app: values on pages, API responses and errors, the GraphQL schema, and the data an action leaves behind. The only exceptions are differences the owner approved, each with a reason.
2. **Quality floors.** No page is less accessible or less secure than its legacy counterpart, and every page clears the absolute bars: no serious or critical WCAG 2.1 AA violations, encoded output, no leaked internals, the required security headers, no console errors, Lighthouse budgets met.
3. **Data.** Every row and every value of the SQL Server database arrives in PostgreSQL intact, within a cutover window the business can live with.
4. **Release.** The image released is, by digest, the image that passed every gate, and the previous version can be put back.

## 2. Scope

### In scope

- The four pages: search and list, application form with fee preview, application detail, staff review.
- The GraphQL API: queries `permitTypes`, `feeQuote`, `dueDate`, `application`, `searchApplications`; mutations `submitApplication`, `changeStatus`; and the schema itself as a contract with partner systems.
- The business rules that live in the database: fee calculation, due dates in business days, expiry after 180 days, the status workflow, reference numbers, name search.
- The data migration from SQL Server to PostgreSQL for all five tables.
- The deployment contract: one image, port 8080, `GET /healthz`, configuration from environment variables.
- The release mechanics: promotion by digest, the GitHub Release, smoke after release, rollback.

### Out of scope, and why

- **Authentication and authorization.** The legacy app has none. Anyone who can reach it can call `changeStatus` with any `changedBy` value, and `application` and `searchApplications` return applicant email and phone numbers to any caller. Real authentication is a deliberate non-goal of this project, the data is synthetic, and both apps only ever run in short-lived local and CI environments, so nothing real is exposed. The migration preserves the behavior as it is, and the register has no risk ID for it, because the gate would then demand a test for a control that does not exist. A real migration would need, at minimum: staff role checks on the review page and on `changeStatus`; the acting user taken from the authenticated identity rather than from a `changedBy` argument the caller sets; contact fields visible to staff only; and a risk entry with tests for each of these.
- **Legacy URLs.** Bookmarks such as `Detail.aspx?ref=PRM-2026-000123` will not resolve in the modern app. Parity is about behavior, not addresses. A real migration would add redirects for links that partners or emails carry.
- **A bilingual UI.** The legacy app is English only, and so is the modern one.
- **Browsers other than Chromium.** A cross-browser matrix is an optional extra once the core is done.
- **Load beyond the reference journeys.** k6 checks three journeys at a modest fixed load. Soak, spike and capacity testing are not attempted.
- **Real infrastructure.** Compose and a PostgreSQL container stand in for ECS and Aurora. Failure modes of the real platform (networking, IAM, failover) are not tested.
- **Repairing the legacy app.** The legacy app is frozen. Its defects are recorded as they are. Where the modern app deliberately behaves better, that is an approved difference, never an edit to the legacy code or its baselines.
- **The conversion's own unit tests as evidence.** They run in the build stage and must pass, but they never count toward covering a risk: tests written by the author of the code share its blind spots.

## 3. Approach

**Risk based.** The [register](risk-register.md) lists 37 risks, each with a likelihood, an impact, how it will be detected, and the pipeline stage that must prove it. Every test carries the IDs of the risks it covers as tags (`@RISK-FEE-01`). A risk counts as covered only when a passing test or check with real evidence names it and no test or check that names it failed. The traceability gate fails a stage when a risk of that stage is not covered, when a test or check that names a risk failed, when a tag or a check names a risk that does not exist, when a test has no risk tag at all, or when a passing test or check examined nothing ([decision 0005](../decisions/0005-traceability-with-real-evidence.md)).

**Evidence, not green ticks.** A check only counts if it examined a non-empty, expected set. A parity run that compared zero cases, a migration check that saw zero rows, or a suite whose baseline file is missing is a failure, never a pass ([decision 0005](../decisions/0005-traceability-with-real-evidence.md)).

**The legacy app is the oracle.** These are characterization tests: they pin what the legacy app actually does, not what a requirements document says it should do. Where legacy behavior looks wrong (search reports `totalCount` 0 on a page past the end, for example), the baseline records it anyway. Changing it is a decision for the owner, recorded as an approved difference, never a quiet edit to a test.

**A blind conversion.** The converting agent sees the legacy source and a short work order ([brief](../conversion/brief.md)) and nothing else: not this strategy, not the register, not the tests, not the seed data. It runs once. What it gets wrong is what a real conversion tool would get wrong ([decision 0001](../decisions/0001-blind-conversion.md)).

## 4. Test levels

| Level | What it proves | Tool | Runs against | Stage |
|---|---|---|---|---|
| Framework unit tests | Seed determinism, parity normalizers and diff, gate rules, risk register | Vitest (`tests/unit/`) | Test code | build |
| Mutation testing | The tests above fail when the logic is broken | Stryker (TypeScript); Stryker.NET (modern fee and due date rules) | Test code, modern rules | build |
| Database characterization | What the legacy procedures and functions really return | Vitest with SQL Server in Docker (`tests/db/`) | Legacy database | local, Windows |
| API contract | Schema compatibility for partner clients | Playwright request context, graphql-js | Both apps | dev, qa |
| API parity | Every operation's response and errors | Playwright request context | Modern vs recorded legacy | qa |
| UI parity | Values users see, flows they follow | Playwright through `AppDriver` | Modern vs recorded legacy | qa |
| Accessibility | axe, keyboard order and focus, reflow, landmarks | @axe-core/playwright, Playwright | Both apps | qa |
| Security | Output encoding, error leakage, headers, console errors | Playwright | Both apps | qa |
| Front-end performance | Lighthouse budgets | Lighthouse CI | Modern (legacy for reference) | qa |
| Data migration | Counts, checksums, hazard records, foreign keys, duration | TypeScript with `mssql` and `pg` | SQL Server vs PostgreSQL | staging |
| Load | p95 latency and error rate on key journeys | k6 | Modern on migrated large data | staging |
| Smoke | The app starts and answers | Playwright `@smoke` | Modern | dev, prod, nightly |
| Exploratory | What the scripts did not think of | Bruno collection, charters (section 6.4) | Modern, locally | after the conversion lands |

## 5. Risk analysis

Each risk comes from something concrete in `legacy/` or in the seed data. The SQL Server and PostgreSQL behaviors quoted below were checked on 2026-10-20 against SQL Server 2022 (collation `SQL_Latin1_General_CP1_CI_AS`) and PostgreSQL 16 in throwaway containers. Scores are in the register; the three highest (score 9) are RISK-FEE-01, RISK-API-01 and RISK-DATA-02.

### 5.1 Money

`usp_CalculateFee` computes `BaseFee + RatePerSqM × AreaSqM` in `money`, halves it for non-profits or else takes 75% for seniors, then rounds with `ROUND(@raw, 2)`. HST is `ROUND(Fee × 0.13, 2)` and the total is fee plus HST.

- **RISK-FEE-01.** T-SQL `ROUND` rounds halves away from zero: RENO at 10.70 m² gives 175.145, stored as 175.15. .NET `Math.Round` rounds halves to even by default and gives 175.14. PostgreSQL `round()` on `numeric` agrees with SQL Server, but `round()` on `float8` rounds 2.5 to 2, and any detour through `double` brings binary error. A cent on every half is a systematic overcharge or undercharge, on a public fee. The seed generator searches out areas whose raw fee lands exactly on a half cent for every permit type and discount, and areas whose HST lands on one.
- **RISK-FEE-02.** The discounts do not stack: `ELSE IF` makes non-profit win over senior, so 100 m² RENO for a senior non-profit is 192.50, not 144.38. HST is computed on the already rounded fee (25.025 rounds to 25.03), and the total adds the two rounded parts. A conversion that computes `ROUND(raw × 1.13, 2)` or applies both discounts gets different totals.

### 5.2 Dates and time

- **RISK-DATE-01.** `fn_AddBusinessDays` steps forward a day at a time and counts a day when `DATENAME(weekday, @d)` is not `Saturday` or `Sunday` and the date is not in `Holidays`. The obvious PostgreSQL rewrite, `to_char(d, 'Day')`, returns `'Sunday   '` padded to nine characters, so a comparison with `'Sunday'` never matches and weekends count as business days. `EXTRACT(DOW)` numbers Sunday 0, while `DATEPART(weekday)` depends on `DATEFIRST`. The holidays table runs 2024 to 2027, including observed days (Boxing Day 2026 on 28 December), and the start day never counts. Due dates are the city's review commitment to the applicant.
- **RISK-DATE-02.** Legacy `Clock.Today` reads `FixedToday` or converts UTC with the Windows time zone ID `Eastern Standard Time`. On Linux that ID resolves only when ICU and tzdata are in the image; slim or globalization-invariant images lack them. A conversion that uses `DateTime.Today` gets the container's clock, which is UTC: from 20:00 in Toronto during daylight time, "today" is already tomorrow. Separately, `SubmittedAt` and `LastUpdatedAt` come from `GETDATE()`, the server's local time, while `SubmittedOn` comes from `Clock.Today`.
- **RISK-DATE-03.** `fn_EffectiveStatus` reports `Expired` when a `Submitted` or `InfoRequested` application has `DATEDIFF(day, LastUpdatedAt, today) > 180`. `DATEDIFF(day)` counts midnights crossed. For a last update at 2026-04-17 23:30 and today 2026-10-15, that is 181 (expired). `EXTRACT(day FROM interval)` and `TimeSpan.Days` measure elapsed time and say 180 (not expired). The seed has records on both sides of that midnight, in both statuses.

### 5.3 Search and lookup

- **RISK-SEARCH-01.** Search uses `LIKE '%' + @SearchText + '%'` on first name, last name and reference. Under the case-insensitive collation, `tremblay` finds `Tremblay` and `HÉLÈNE` finds `Hélène`. PostgreSQL `LIKE` is case-sensitive. `ILIKE` folds case, but under the `C` collation it does not fold accented capitals (`HÉLÈNE` no longer finds `Hélène`). The seed has `MacDonald`, `macdonald`, `MACDONALD` and `McDonald` side by side.
- **RISK-SEARCH-02.** `usp_GetApplicationByReference` matches with `=` on `varchar`, and SQL Server pads before comparing, so `PRM-2026-000010 ` with a trailing space finds the application. PostgreSQL `=` on `varchar` or `text` does not. `LIKE` is different: it keeps a trailing space significant in both engines, so the search term `Tremblay ` finds only the stored name `Tremblay ` (with its space), not `Tremblay`. The seed stores names with trailing spaces, and the migration must keep them.
- **RISK-SEARCH-03.** The collation is accent-sensitive: `Tremblé` does not find `Tremblay`, and `cote` does not find `Côté`. A conversion that reaches for `unaccent()` or an accent-insensitive collation returns more rows; a migration that mangles accents returns fewer. In a bilingual region, French names that cannot be found are a service failure, not a cosmetic one.

### 5.4 Order

- **RISK-ORDER-01.** `usp_ListPermitTypes` and `usp_GetStatusHistory` have no `ORDER BY`. SQL Server returns clustered key order: permit types `DECK, DEMO, EVENT, PATIO, RENO, SIGN`, and history by `HistoryId`. PostgreSQL returns rows in physical order, which follows insert order (the reference data inserts `RENO` first) and changes when an update moves a row. The permit type dropdown and the audit trail on the detail page both depend on it. A migration that copies rows in key order can make this pass by luck, which is why triage also reads the converted functions for an explicit `ORDER BY`.
- **RISK-ORDER-02.** Search sorts by `SubmittedAt DESC` and nothing else. Five seed applications share `2026-09-14 10:00:00`, so their order inside a page, and which page they land on, is undefined in both engines. `totalCount` comes from `COUNT(*) OVER()`, which has no rows to count on a page past the end, so legacy reports 0 there; a conversion that counts separately reports the real total. Before any order is used as a baseline, the Windows recording runs twice and the two results are diffed.

### 5.5 Workflow and reference numbers

- **RISK-WF-01.** `usp_ChangeStatus` allows `Submitted` to `UnderReview`, `UnderReview` to `InfoRequested`, `Approved` or `Rejected`, and `InfoRequested` back to `UnderReview`, and checks in a fixed order: not found, expired, invalid transition, note required (for `Rejected` and `InfoRequested`). Errors are `RAISERROR(..., 16, 1)`, which reaches C# as `SqlException` number 50000 and becomes a `BusinessRuleException` with the message. PL/pgSQL `RAISE EXCEPTION` arrives as SQLSTATE `P0001` and needs its own mapping, or every business error turns into a generic failure. The note check trims spaces only, while `string.IsNullOrWhiteSpace` also treats tabs and line breaks as blank.
- **RISK-REF-01.** The reference is `PRM-` plus the submission year plus the identity padded by `RIGHT('000000' + id, 6)`. The seed inserts explicit IDs, and SQL Server moves the identity past them. A PostgreSQL identity or sequence does not move when rows are inserted with explicit values, so unless the migration resets it, the first new submission collides with an existing ID. Beyond 999,999 the two engines also diverge (T-SQL keeps the last six digits, `lpad` the first six); that is out of reach of this data and recorded in section 13.

### 5.6 GraphQL contract

- **RISK-API-01.** Partner systems were written against the GraphQL.NET 2.4 schema. Hot Chocolate brings its own conventions: enum values in upper snake case, non-null types inferred from C# nullability, its own `Date`, `DateTime` and `Decimal` scalars, its own type names. A renamed enum value, a removed field or an argument that becomes required breaks a client while every page of the new app still works. The contract test compares the two introspected schemas with graphql-js `findBreakingChanges`.
- **RISK-API-02.** Legacy answers HTTP 200 with an `errors` array for any executed operation, with `ExposeExceptions = true` putting exception text in the message, and HTTP 400 with the plain text `Invalid request` for a body that is not JSON. Hot Chocolate masks unhandled exceptions as `Unexpected Execution Error` unless told otherwise, and follows the GraphQL over HTTP rules for status codes. Partners that read messages or status codes break.
- **RISK-API-03.** SQL Server returns `money` with four decimal places and dates as `DateTime`. The two libraries differ in whether a `Date` carries a time, whether a date-time carries an offset, and whether decimals are written as numbers or strings. `175.15` and `"175.15"` are different values to a client; the parity diff reports a type change for exactly that reason.

### 5.7 Pages

- **RISK-UI-01.** Web Forms flows rest on postbacks and ViewState: the fee preview without submitting, the confirmation panel after submit, the GridView pager, links from results to the detail page. Blazor static rendering replaces each with forms, links and one interactive island, and any of them can lose state or a step.
- **RISK-UI-02.** Legacy formats money with `{0:C}` under `en-CA` (`$175.15`) and dates as `yyyy-MM-dd`. A container runs with the invariant culture unless configured (`¤175.15`), and four-place stored amounts such as `88.1234` must still show as `$88.12`.
- **RISK-UI-03.** Users see the messages of ASP.NET validators and `ApplicationValidator` (`Area must be between 1 and 10000 square metres`). Blazor `DataAnnotations` defaults read differently.
- **RISK-A11Y-01 to 04.** Legacy has known gaps: the Phone label has no association with its field, and error text is pure red `#ff0000` on white, about 4.0:1, below the 4.5:1 AA minimum. Those set the floor; the modern app must clear the absolute bar on every page, tab through the form in visual order with visible focus, reflow at 375 px without sideways scrolling (the results grid is the likely offender), and expose one `main` landmark and unambiguous link names.
- **RISK-SEC-01.** The legacy detail page writes the applicant name through `<%= %>` without encoding, and the seed holds `<b>Roy</b>`, `<script>alert('x')</script>` and `"><img src=x>` as last names. Razor encodes by default; a conversion that reproduces the raw output faithfully with `MarkupString` builds stored cross-site scripting against staff. Likelihood is low, impact high.
- **RISK-SEC-02.** `ExposeExceptions = true` sends stack traces in GraphQL errors, and `Detail.aspx?id=abc` hits `int.Parse` and shows the detailed ASP.NET error page to local requests. The modern app must show neither.
- **RISK-SEC-03 and RISK-HEALTH-01.** ASP.NET Core sends no `Content-Security-Policy`, `X-Content-Type-Options` or `Referrer-Policy` unless the app adds them, and legacy IIS advertises `X-AspNet-Version` and `X-Powered-By`. The two risks pull against each other: a strict CSP can break Blazor's interactive island, which then fails in the console while the page looks fine.
- **RISK-PERF-02.** Lighthouse budgets on the search and application pages (performance 0.80, accessibility 0.95, best practices 0.90). Blazor's framework script is the likely cost.

### 5.8 Data migration and load

- **RISK-DATA-01.** Five tables must arrive complete. A migration that pages with `OFFSET` over a non-unique order, or skips a failed batch, loses or duplicates rows without an error.
- **RISK-DATA-02.** The richest risk in the project. Money with four decimal places (the seed has `88.1234`) becomes `$88.12` if mapped to PostgreSQL `money`. `nvarchar` text carries accents, emoji and other scripts. `SiteAddress` is `varchar`, stored in code page 1252: decoded wrongly it becomes `Ã©`, and SQL Server has already replaced characters outside that code page on the way in (`Łódź` is stored as `Lódz`). `NULL`, `''` and `'   '` descriptions are three different values that CSV based tools collapse. Trailing spaces in names must survive. `datetime` has a precision of 1/300 second. Seed timestamps such as `2026-03-08 02:30` do not exist in Toronto (clocks jumped from 02:00 to 03:00), and converting them to `timestamptz` as Toronto time silently moves them to 03:30.
- **RISK-DATA-03.** Foreign keys, the unique reference number and the status check must exist and hold. Constraints created `NOT VALID`, or identity sequences left at 1, pass the load and fail on the first real write.
- **RISK-DATA-04.** The legacy app is read-only from the start of the migration until the go decision, so migration plus validation time is downtime. The rehearsal on 50,000 applications sizes the window; the proposed gate is 10 minutes.
- **RISK-PERF-01.** Search applies `fn_EffectiveStatus` to every row, inside the status filter too, and `LIKE '%term%'` cannot use an index. SQL Server 2022 can inline a scalar function like this; PostgreSQL calls a PL/pgSQL function once per row. Proposed thresholds: p95 under 500 ms and under 1% failed requests at 5 virtual users for 30 seconds.

### 5.9 Release

- **RISK-REL-01 to 04.** The released image must be the tested one (digest check), must work with production configuration (smoke right after release and nightly), must refuse introspection in prod while dev and qa keep it for the contract test, and must be replaceable by the previous version (rollback drill). See the [release plan](release-plan.md) and the [rollback runbook](rollback-runbook.md).

### 5.10 Test tooling

- **RISK-TEST-01.** The most dangerous code in the repo is the parity normalizer: one that trims, folds case, reformats numbers or sorts arrays hides exactly the hazards above and turns every parity test green. The normalizer changes nothing except key order, the first line of error messages, and volatile values (new reference numbers and timestamps), and even those are replaced only when they have the expected format. Stryker mutates the parity, gate, API case and UI check code with a break threshold of 85, and unit tests pin `" Roy"` vs `"Roy"`, `"174.67"` vs `174.67` and reordered arrays as differences.

## 6. How the tests are built

### 6.1 One test, two apps

Each page has a driver interface (`SearchPage`, `ApplyPage`, `DetailPage`, `ReviewPage`) with one implementation for Web Forms and one for Blazor. Tests are written once against the interface and run against either app, chosen by `TARGET=legacy|modern`. The drivers return what a user sees, as displayed strings, so parity means the same behavior, not the same HTML. The modern driver is written after the conversion, against whatever markup it produced; the tests do not change.

API tests need no driver: both apps serve the same operations at `POST /graphql`. Database state after an action is observed through the API (`application` with its `history`) straight after each mutation. Direct table comparison happens in the staging migration check, because the modern table names are unknown until the conversion.

### 6.2 Record and compare

- **Record** runs only against the legacy app, only on the Windows runner, through a manually started workflow. The test configuration refuses `PARITY_MODE=record` with any other target. Each case writes one normalized JSON file to `tests/baselines/legacy/<suite>/<caseId>.json`, with the risks it covers and the request that produced it.
- **Compare** runs against the modern app on Linux runners and on the Mac, so daily work never waits for Windows. A case with no baseline file fails with `No legacy baseline for <suite>/<caseId>`. Differences are filtered through the [approved differences](approved-differences.md) list and anything left fails the test with every remaining path listed.
- **Determinism.** Each recording runs twice and the two outputs are diffed; only `recordedAt` may differ. Anything else is nondeterminism to fix before the baselines are committed.
- **Review.** Baselines are committed and reviewed like code. Any change to them is owner approval point 2 ([decision 0002](../decisions/0002-recorded-legacy-baselines.md)).
- **The Mono preview** (`legacy-preview` in Compose) lets the legacy app run on a Mac for debugging the drivers. Mono is not .NET Framework, so nothing it produces is ever a baseline or a piece of evidence.

### 6.3 Test data

- **Synthetic only**, generated by `tests/src/seed/` with Faker seeded at `20261015` (French Canadian names first, then English Canadian). Two runs produce byte-identical SQL; a unit test proves it.
- **Two sizes.** Small: 407 applications (300 random plus the hazard records), loaded for every functional run. Large: 50,000 applications, generated on demand for the staging rehearsal and load test.
- **A catalog of hazards.** `tests/seed-data/catalog.json` lists the reference numbers of each hazard category (accented, mixed case, trailing space and markup names; null contacts; null, empty and blank descriptions; half cent fees; four-place money; weekend, holiday, daylight saving, month end and leap day submissions; expiry boundary records; tied timestamps; accented `varchar` addresses; long status histories) plus the fee probes, due date probes and search terms. Tests pick records from the catalog, never by hard-coded ID.
- **A fixed today.** `FIXED_TODAY` is `2026-10-15` wherever tests run: `FixedToday` in the legacy `web.config`, `App__FixedToday` for the modern container.
- **Resets.** The database is rebuilt from scripts and the small seed before a suite runs; tests that mutate data create their own applications.
- **Hidden from the conversion.** The seed, its generator and the catalog would point straight at the hazards, so the converting agent never sees them.

### 6.4 Exploratory testing

Once the conversion lands, the owner runs four time-boxed sessions of 45 minutes on the modern app, locally:

1. The application form with keyboard only and VoiceOver, to find what axe cannot see.
2. Search and lookup with names and references pasted from an email (trailing spaces, non-breaking spaces, accents typed and pasted), to find matching gaps.
3. The API through the Bruno collection with values a partner would really send (dates with a time part, decimals as strings, nulls), to find input coercion differences.
4. The review page in two tabs on the same application, to see how concurrent changes behave in both apps.

A finding becomes a defect only once a test reproduces it, and that test joins the suite with its risk tag.

## 7. Environments and gates

Each environment exists only for the duration of its pipeline stage. The image is built once and promoted by digest ([decision 0003](../decisions/0003-build-once-promote-by-digest.md)).

| Stage | Runs on | What happens | Gate to move on |
|---|---|---|---|
| build | Linux | Compile, unit tests, lint, mutation tests, build the image once | All green; mutation score at or above the break threshold |
| dev | Linux | Start the image with PostgreSQL and the small seed through Compose; smoke and API contract tests | All green |
| qa | Linux | Full API and UI regression, parity against the committed legacy baselines, accessibility, security, Lighthouse, traceability gate | Zero unapproved parity differences, no unapproved breaking schema change, accessibility and Lighthouse budgets met, every qa risk covered by a passing test with non-empty evidence |
| staging | Linux | Load SQL Server with the large seed, run the migration, validate it, then smoke and k6 against the migrated data | Migration validation green, migration time recorded and within the window, performance thresholds met, every staging risk covered |
| prod | Linux | Waits for the owner's approval, verifies the digest, tags the version, creates the GitHub Release with the go/no-go record, runs smoke against the released image | Owner approves, digest matches, smoke green |
| post-release monitor | Linux, nightly | Pulls the released image, runs smoke, opens or updates an issue on failure | Not a gate |
| legacy baseline | Windows, manual | Builds and runs the legacy app with SQL Server, records parity, accessibility, Lighthouse and load reference results, proposes them as a pull request | Owner reviews and merges (approval point 2) |

Configuration differs between environments only through environment files and GitHub Environment secrets. GraphQL introspection is on in dev and qa (the contract test needs it) and off in prod. No secret is committed.

## 8. Entry and exit criteria

### Entry to the conversion (approval point 1)

- This strategy and the risk register are approved by the owner.
- The legacy app builds and passes smoke on the Windows runner.
- Baselines are recorded on Windows, recorded twice with no difference other than `recordedAt`, committed and reviewed.
- The build, dev and qa stages run end to end against a placeholder app, failing only in the expected way (uncovered risks, missing modern behavior), never with a crash of the tooling.
- The [conversion brief](../conversion/brief.md) is final, and the conversion workspace contains only `legacy/` and the brief.

### Exit from qa

- Every API and UI regression test passes.
- Zero unapproved parity differences across API and UI suites.
- No unapproved breaking change in the GraphQL schema.
- Zero serious or critical axe violations, no page worse than legacy, keyboard, reflow and landmark checks green.
- Security checks and console checks green on every page.
- Lighthouse budgets met on the main pages.
- Mutation score at or above 85 for the parity, gate, API case and UI check code.
- Every qa risk covered by a passing test with non-empty evidence.
- No open S1 or S2 defect.

### Exit from staging

- Row counts equal for all five tables; per column checksums and aggregates equal; every catalog hazard record identical field by field.
- Zero orphan rows on every foreign key; constraints present.
- Migration plus validation within 10 minutes for 50,000 applications (proposed, to be confirmed at approval point 1).
- k6: p95 under 500 ms and failed requests under 1%.
- Every staging risk covered.

### Exit from prod (release done)

- The owner's go decision is recorded in a [go/no-go record](go-no-go-template.md).
- The digest matches the tested digest; the version tag and GitHub Release exist.
- Smoke is green against the released image, and introspection is refused.
- The rollback target (previous version and its digest) is written down.

### Suspension and resumption

Testing stops, and no result is trusted, when the tooling itself fails: the gate crashes, a whole suite has no baselines, an environment does not start. The tooling is fixed first, then the whole stage reruns; a partial rerun never satisfies a gate. If the conversion does not build at all, that is recorded as a defect and the owner decides what happens next.

**Flakiness.** Retries are off, so flakiness is visible. A test that fails intermittently is a defect in the test or the app and is logged as one. It is never retried into green. Every failing run of it is a `failing-test` problem for each of its risks, and those risks stay uncovered for that run even when other tests of theirs pass. Quarantining a test (skipping it) needs the owner's approval. A skipped test neither covers nor blocks a risk, so its risks stay uncovered, and the gate red, unless another test covers them.

## 9. Defect management

Every failing gate run on the conversion pull request is triaged before more fixes land. Each defect goes into the [defect log](defect-log.md) with what broke, the test that caught it, the stage that caught it, the root cause, a link to the failing run and the fix commit.

**Classification.** Every failure is exactly one of:

- **Product defect:** the modern app is wrong. Fixed in `modern/` in its own commit referencing the defect ID.
- **Test defect:** the test is wrong, shown by the legacy baseline or the legacy code, not by the modern app's output. A fix to a normalizer, the diff or the gate reruns mutation testing before it counts.
- **Baseline defect:** a recorded baseline is wrong (for example nondeterministic). Re-recorded on Windows, owner approval point 2.
- **Environment defect:** the pipeline or a container, not the app.
- **Accepted difference:** the modern app is deliberately different. Proposed with a reason, approved by the owner, recorded in `tests/approved-differences.json`.

**Severity.**

| Severity | Meaning | Release |
|---|---|---|
| S1 critical | Wrong money or dates on records, data lost or corrupted, a security exposure, or the app does not start | Blocks |
| S2 major | A partner integration breaks, or a core flow fails for some inputs | Blocks |
| S3 minor | Wrong behavior with a workaround, wording or format differences | Owner may accept, listed as a known issue |
| S4 cosmetic | No effect on outcome | Does not block |

Priority follows the score of the risk the failing test covers.

**Never.** A red run is never made green by loosening a normalizer, adding a retry, editing a baseline by hand or removing a risk tag. Defects are never invented or staged: every entry in the log was caught by a test during this project.

## 10. Approval points

The owner approves at three points, and the builder stops and waits at each one.

1. **Before the conversion:** this strategy and the risk register, the recorded baselines and the dry run of the pipeline. Approved by merging the foundation pull request.
2. **Any change to recorded baselines, and any approved difference:** each one reviewed with its reason and, where relevant, its defect ID.
3. **Each release:** the go/no-go decision and the prod approval on the GitHub Environment, for `v1.0.0-rc.1` and for `v1.0.0`.

## 11. Roles

- **Owner (Ceylan Akyol, Quality Engineer):** owns this strategy and the register, approves at the three points, makes every go/no-go decision.
- **Builder (Claude Code, directed by the owner):** writes the legacy app, the test framework, the pipeline and first drafts of these documents; triages defects; proposes approved differences. Never approves anything.
- **Conversion agent (a separate Claude Code session):** converts the legacy app once from the brief, standing in for a commercial modernization tool. Sees nothing in this folder.

## 12. Reporting and evidence

- Playwright HTML report, traces and screenshots for every run, kept as run artifacts.
- Allure report with history on GitHub Pages, once the repository is public.
- The traceability matrix in each job summary and in `reports/traceability.json`: every risk, covered or not, and by which tests.
- The defect log, the approved differences list and its approvals.
- A go/no-go record attached to each GitHub Release, and a post-release report after `v1.0.0`.

## 13. Known limits

These are the residual risks this strategy accepts, written down so nobody mistakes them for coverage.

- **The real clock is weakly covered.** Parity pins `FIXED_TODAY`. The clock check for RISK-DATE-02 starts the modern image with `TZ=Pacific/Kiritimati` (UTC+14) and no fixed date: it catches a clock that uses the container's local time at most hours of the day, but a clock that uses UTC only during the Toronto evening. The converted clock code is therefore also read during triage.
- **Order can pass by luck.** A matching order in parity does not prove an `ORDER BY` exists (RISK-ORDER-01). Triage reads the converted functions.
- **Some hazards are out of reach of the data, and are documented instead of tested.** Rounding the discounted fee to four places before the final `ROUND` never changes a result with the current rate table (checked for every area from 1.00 to 10,000.00 m²). Reference numbers past 999,999 are unreachable with 50,000 rows. `DATENAME` depends on the session language (under French it returns `samedi`, so weekends would count as business days); the runner's login is `us_english`.
- **One browser.** Chromium only, unless the optional matrix is added.
- **Performance numbers are not comparable across platforms.** Legacy numbers come from a Windows runner and are reference only; only the modern thresholds gate.
- **50,000 applications is a rehearsal size,** not a production estimate. The migration time scales the window, not a capacity plan.
- **Automated accessibility checks cover part of WCAG.** The keyboard and screen reader charter covers some of the rest; no formal audit is done.
- **The builder knows where the traps are.** The same builder designed the legacy hazards and the tests that catch them. The guard against a staged result is the blind, single conversion, a defect log that records only what tests really caught, and an honest write-up if the conversion turns out clean.

## 14. Current state

As of 2026-10-20 the repository exists only on the owner's machine. The owner creates the GitHub repository as private, reviews it, and then makes it public ([decision 0007](../decisions/0007-private-first-then-public.md)). Until then, no Windows run has happened: the legacy recipe in [decision 0006](../decisions/0006-legacy-runs-on-windows-runners.md) is unproven, no baseline is recorded, and the pipeline stages have only been checked locally. Required reviewers on GitHub Environments and GitHub Pages need a public repository, so the staging, prod and report publishing steps come after the switch.
