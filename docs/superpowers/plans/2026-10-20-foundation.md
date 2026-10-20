# Foundation Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything up to owner approval point 1: the legacy app proven on GitHub's Windows runners, its database and seed data, the quality documents, the TypeScript test framework with recorded legacy baselines, and the pipeline's build, dev and qa stages proven against a placeholder modern app. Stop before the conversion.

**Architecture:** `legacy/` holds the .NET Framework 4.8 app (Web Forms + GraphQL.NET + ADO.NET + SQL Server scripts). It compiles on the Mac against reference assemblies and runs only on `windows-2022` runners. `tests/` is one TypeScript package: seed generator, Playwright suites that run against either app through one interface, the parity engine, and the traceability gate. `modern/` holds only a placeholder until Plan 2. Work happens on branch `foundation` of the private repo `ceylan019/dotnet-modernization-quality`. The owner merging the `foundation` pull request is approval point 1.

**Tech Stack:** .NET Framework 4.8 (SDK-style projects + `Microsoft.NETFramework.ReferenceAssemblies`), GraphQL.NET 2.4.0, SQL Server 2022 Developer (Docker on Mac, native on Windows runner), .NET 10 SDK, Node 22, TypeScript, Playwright, @axe-core/playwright, allure-playwright, Vitest, Stryker, zod, mssql, pg, graphql (graphql-js), @faker-js/faker, k6, Bruno CLI, Lighthouse CI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-20-dotnet-migration-quality-design.md`. Plan 2 (conversion, defect hunt, staging, prod, releases, final README) is written after approval point 1.

## Global Constraints

- Never use a dash as sentence punctuation (no em dash, no en dash, no spaced hyphen joining clauses) in any text: docs, comments, test names, commit messages, README. Compound words like `read-only` are fine.
- No employer names, no content from the owner's work repositories. All content is original. Data is synthetic only.
- Free only. No AWS account, no card, no paid service.
- Git identity for this repo only: `user.name "Ceylan Akyol"`, `user.email "54545415+ceylan019@users.noreply.github.com"`. Never the global work email.
- Remote: private repo `ceylan019/dotnet-modernization-quality`. Never change its visibility. Never push to `main` after Task 0. Never merge the PR.
- No secrets committed. Local passwords live in `.env` (gitignored) with a committed `.env.example`. CI passwords come from workflow env, generated per run.
- Windows runs count double against 2,000 private minutes. Batch Windows pushes; at most 25 Windows workflow runs in total for this plan.
- `FIXED_TODAY` is `2026-10-15` everywhere tests run (legacy `appSettings` key `FixedToday`, modern env `App__FixedToday`).
- Commit after every task with a conventional message (`feat:`, `test:`, `docs:`, `ci:`, `chore:`).
- Paths below are relative to the repo root (`/Users/ceylan.akyol/IdeaProjects/kiromig`).
- Tool paths on the Mac: `export PATH="$HOME/.dotnet:$PATH"; source ~/.nvm/nvm.sh && nvm use 22` before any `dotnet`, `node` or `npm` command.

## Review Focus

1. **A parity test that compares nothing passes.** A suite with zero recorded baseline cases, or a case file missing on disk, must fail, not pass. Pinned in Task 9 (`expectParity` fails on missing baseline) and Task 10 (`empty-evidence` problem).
2. **Normalization hides a real difference.** Trimming strings, folding case, reformatting numbers or reordering arrays would hide exactly the hazards the legacy app plants. Pinned in Task 9 with tests proving `" Roy"` vs `"Roy"`, `"174.67"` vs `174.67`, and reordered arrays all produce differences, and in Stryker thresholds.
3. **Record mode run against the wrong target.** Recording baselines from anything other than the legacy app would poison every later comparison. Pinned in Task 8: `loadEnv` throws when `PARITY_MODE=record` and `TARGET` is not `legacy`.
4. **Seed is not deterministic.** If two generator runs differ, baselines drift for no reason. Pinned in Task 4 with a byte-identical double run test.
5. **Windows runner timezone and culture.** Runners use UTC and may use `en-US`. The legacy app must still compute Toronto dates and render `en-CA` currency. Pinned in Task 4 (`Clock` reads `FixedToday`, else `TimeZoneInfo` ID `Eastern Standard Time`) and Task 6 (`web.config` globalization `en-CA`; the smoke test asserts the preview shows `$175.15` and due date `2026-10-29` on the Windows runner).

---

## File Structure

```
.gitignore  .gitattributes  .env.example  .nvmrc (22)  compose.yaml  README.md
docs/
  superpowers/specs/…  superpowers/plans/…
  quality/ test-strategy.md  risks.json  risk-register.md  release-plan.md  rollback-runbook.md
           defect-log.md  approved-differences.md  walkthrough.md
  decisions/ 0001-blind-conversion.md … 0007-private-first.md
  conversion/brief.md
legacy/
  Permits.Legacy.sln
  db/ 01-schema.sql 02-functions.sql 03-procedures.sql 04-reference-data.sql
  src/Permits.Core/ (net48 class library: Models/, Validation/, Clock.cs, PermitService.cs, IPermitRepository.cs, BusinessRuleException.cs)
  src/Permits.Data/ (net48 class library: SqlPermitRepository.cs)
  src/Permits.Web/  (net48 library compiled into Permits.Web/bin: Site.Master, Default.aspx, Apply.aspx, Detail.aspx, Review.aspx,
                     *.aspx.cs + *.aspx.designer.cs, Global.asax(.cs), Api/GraphQLHandler.cs, Api/Schema/*.cs, web.config)
modern/
  Dockerfile  src/Permits.Placeholder/ (Program.cs, Permits.Placeholder.csproj)
tests/
  package.json  tsconfig.json  playwright.config.ts  vitest.config.ts  stryker.config.mjs  eslint.config.mjs
  approved-differences.json
  seed-data/ seed-small.sql  catalog.json          (generated, committed)
  baselines/legacy/<suite>/<caseId>.json           (recorded on Windows, committed)
  src/config/env.ts
  src/db/mssql.ts  src/db/run-sql-files.ts  src/db/reset-legacy-db.ts
  src/seed/ rng.ts  fee.ts  holidays.ts  records.ts  sql-writer.ts  generate.ts
  src/api/graphql-client.ts  src/api/operations.ts
  src/parity/ normalize.ts  diff.ts  baseline-store.ts  approved-differences.ts  expect-parity.ts
  src/gate/ risks.ts  results.ts  traceability.ts  evidence.ts  gate-cli.ts  risk-register-md.ts
  src/drivers/ types.ts  legacy/*.ts  modern/index.ts
  src/migration/ mapping.ts  sources.ts  validate.ts  validate-cli.ts
  src/fixtures.ts
  specs/ smoke/ api/ ui/ a11y/ security/
  unit/  (Vitest: framework logic)      db/ (Vitest: legacy SQL characterization against Docker SQL Server)
  perf/journeys.js   bruno/   lighthouse/lighthouserc.cjs
.github/workflows/ legacy.yml  pipeline.yml
```

---

### Task 0: Bootstrap repo, toolchain and private remote

**Files:**
- Create: `.gitignore`, `.gitattributes`, `.nvmrc`, `.env.example`, `README.md` (stub: title, one paragraph, "work in progress")

- [ ] **Step 1:** `git init -b main`, set the repo-local identity from Global Constraints, verify with `git config user.email` → `54545415+ceylan019@users.noreply.github.com`.
- [ ] **Step 2:** Install the .NET 10 SDK into `~/.dotnet` with `dotnet-install.sh --channel 10.0 --install-dir ~/.dotnet`. Verify `dotnet --version` starts with `10.`.
- [ ] **Step 3:** `nvm install 22`. Verify `node -v` starts with `v22`.
- [ ] **Step 4:** `.gitignore` covers `bin/ obj/ node_modules/ .env tests/reports/ tests/test-results/ tests/playwright-report/ tests/allure-results/ .stryker-tmp/ *.user .vs/` (so `legacy/src/Permits.Web/bin/` build output is never committed). `.gitattributes`: `* text=auto`, `*.sql text eol=crlf`, `*.aspx text eol=crlf`, `*.config text eol=crlf`.
- [ ] **Step 5:** Add stub workflows `.github/workflows/legacy.yml` (`on: workflow_dispatch` with input `mode`: `smoke` | `record`) and `.github/workflows/pipeline.yml` (`on: workflow_dispatch`), each with one job that echoes `stub`. GitHub only allows dispatching workflows that exist on the default branch; the `foundation` versions replace the stubs when dispatched with `--ref foundation`.
- [ ] **Step 6:** Commit README stub + spec + this plan + stubs on `main`. `gh repo create ceylan019/dotnet-modernization-quality --private --source . --push`. Verify `gh repo view ceylan019/dotnet-modernization-quality --json visibility` → `"PRIVATE"`.
- [ ] **Step 7:** `git switch -c foundation`. All later tasks commit here and push with `git push -u origin foundation`.

---

### Task 1: Spike on the Windows runner (gate for the whole design)

**Files:**
- Create: `legacy/Permits.Legacy.sln`, the three projects with minimal content, `legacy/db/01-schema.sql` (only `dbo.PermitTypes` for now), `legacy/db/03-procedures.sql` (only `usp_ListPermitTypes`), `legacy/db/04-reference-data.sql` (permit types), `legacy/src/Permits.Web/Default.aspx` listing permit types in a GridView, `Api/GraphQLHandler.cs` + a schema with only `permitTypes`, `web.config`
- Create: `tests/package.json`, `tests/tsconfig.json`, `tests/playwright.config.ts`, `tests/specs/smoke/spike.spec.ts`, `tests/src/db/mssql.ts`, `tests/src/db/run-sql-files.ts`, `tests/src/db/reset-legacy-db.ts`
- Create: `.github/workflows/legacy.yml`, `compose.yaml` (service `mssql` only for now)

**Interfaces:**
- Produces: project layout and build commands every later legacy task uses:
  - All three `.csproj` are SDK-style `Microsoft.NET.Sdk`, `<TargetFramework>net48</TargetFramework>`, `<LangVersion>7.3</LangVersion>`, package `Microsoft.NETFramework.ReferenceAssemblies` 1.0.3 (PrivateAssets all).
  - `Permits.Web.csproj`: `<OutputPath>bin\</OutputPath>`, `<AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>`, `<CopyLocalLockFileAssemblies>true</CopyLocalLockFileAssemblies>`, `<Reference Include="System.Web" />`, packages `GraphQL` 2.4.0 and `Newtonsoft.Json` 13.0.3. Pages use the CodeBehind model: `Inherits="Permits.Web.Default"` with hand-written `*.aspx.designer.cs` partial classes declaring controls.
  - Mac build: `dotnet build legacy/Permits.Legacy.sln -c Release` must succeed.
  - `tests/src/db/reset-legacy-db.ts` CLI: `tsx src/db/reset-legacy-db.ts --seed none|small|large`. Reads `LEGACY_DB_URL` (a `mssql` connection string, e.g. `Server=localhost,1433;Database=master;User Id=sa;Password=…;TrustServerCertificate=true`), drops and recreates database `Permits`, runs `legacy/db/*.sql` in name order splitting on lines matching `/^\s*GO\s*$/i`, then the seed file.
  - `runSqlFiles(pool: sql.ConnectionPool, files: string[]): Promise<void>` in `run-sql-files.ts`; `connectLegacy(database?: string): Promise<sql.ConnectionPool>` in `mssql.ts`.
  - The legacy database is always reachable over TCP `localhost,1433` with SQL auth `sa` (Docker on the Mac, a native install on Windows). LocalDB is ruled out because the Node `mssql` driver needs TCP.
  - `legacy.yml` job `legacy` on `windows-2022`: triggers `push` on paths `legacy/**` and `.github/workflows/legacy.yml` only (test-only changes never start a Windows run by themselves), plus `workflow_dispatch` with input `mode` (`smoke` | `record`, default `smoke`), dispatched with `gh workflow run legacy.yml --ref foundation -f mode=…`. Steps: install SQL Server with TCP 1433 and SQL auth; `npm ci` + `npx playwright install chromium`; reset DB; `dotnet build` (or `msbuild /restore` if `dotnet` cannot build net48 there); set `FixedToday` and the connection string in `legacy/src/Permits.Web/web.config` via PowerShell; start IIS Express (`C:\Program Files\IIS Express\iisexpress.exe /path:<abs>\legacy\src\Permits.Web /port:8080 /clr:v4.0`) in the background; wait for HTTP 200 on `/Default.aspx` (90 s timeout); run Playwright with `TARGET=legacy BASE_URL=http://localhost:8080`; upload `tests/playwright-report` and `tests/test-results` always.

- [ ] **Step 1: Write `spike.spec.ts`** with two tests: `legacy home page lists permit types` (GridView `#MainContent_PermitTypesGrid` has 6 data rows) and `legacy GraphQL returns permit types` (POST `/graphql` `{ permitTypes { code name } }` → status 200, `data.permitTypes.length === 6`).
- [ ] **Step 2:** Bring up `mssql` in Docker (`docker compose up -d mssql`), run `reset-legacy-db.ts --seed none`, verify `SELECT COUNT(*) FROM Permits.dbo.PermitTypes` = 7.
- [ ] **Step 3:** Build the legacy solution on the Mac. Expected: success, `legacy/src/Permits.Web/bin/Permits.Web.dll` and `GraphQL.dll` exist.
- [ ] **Step 4:** Commit, push `foundation`, watch the run with `gh run watch`. Expected: both spike tests pass on Windows.
- [ ] **Step 5: Iterate with a cap.** SQL Server install order to try: (a) `potatoqualitee/mssqlsuite` with `install: sqlengine`, `version: 2022`, `sa-password`; (b) Chocolatey `sql-server-express` then enable TCP 1433 and mixed auth via PowerShell + service restart. IIS Express fallback: enable IIS (`Install-WindowsFeature Web-Server,Web-Asp-Net45`) and create a site on port 8080. Assembly binding failures: add `bindingRedirect`s to `web.config`. **Stop rule:** if 10 Windows runs have not produced a green spike, stop the whole plan and report to the owner with the failing logs.
- [ ] **Step 6:** Record the working recipe (install method, IIS host, timings) in `docs/decisions/0006-legacy-runs-on-windows-runners.md` and commit.

---

### Task 2: Legacy database (schema, functions, procedures, reference data) with characterization tests

**Files:**
- Modify: `legacy/db/01-schema.sql`, `legacy/db/03-procedures.sql`, `legacy/db/04-reference-data.sql`
- Create: `legacy/db/02-functions.sql`, `tests/vitest.config.ts`, `tests/db/legacy-procs.test.ts`

**Interfaces:**
- Produces (exact names; later tasks and Plan 2 depend on them):
  - `dbo.PermitTypes(Code varchar(20) PK CLUSTERED, Name nvarchar(100), BaseFee money, RatePerSqM money, ReviewBusinessDays int, IsActive bit DEFAULT 1, SortHint int NULL)`
  - `dbo.Applicants(ApplicantId int IDENTITY PK, FirstName nvarchar(100), LastName nvarchar(100), Email nvarchar(200) NULL, Phone varchar(30) NULL, IsSenior bit DEFAULT 0, IsNonProfit bit DEFAULT 0, CreatedAt datetime DEFAULT GETDATE())`
  - `dbo.Applications(ApplicationId int IDENTITY PK, ReferenceNumber varchar(20) UNIQUE, ApplicantId int FK, PermitTypeCode varchar(20) FK, SiteAddress varchar(200), AreaSqM decimal(9,2), Description nvarchar(max) NULL, Status varchar(20) CHECK IN ('Submitted','UnderReview','InfoRequested','Approved','Rejected'), SubmittedOn date, SubmittedAt datetime, DueDate date, FeeAmount money, HstAmount money, TotalAmount money, LastUpdatedAt datetime)`
  - `dbo.ApplicationStatusHistory(HistoryId int IDENTITY PK, ApplicationId int FK, FromStatus varchar(20) NULL, ToStatus varchar(20), ChangedAt datetime, ChangedBy nvarchar(100), Note nvarchar(500) NULL)`
  - `dbo.Holidays(HolidayDate date PK, Name nvarchar(100))`
  - `dbo.fn_AddBusinessDays(@Start date, @Days int) RETURNS date`: WHILE loop; steps forward one day at a time; a day counts when `DATENAME(weekday, @d) NOT IN ('Saturday','Sunday')` and it is not in `dbo.Holidays`; the start day never counts.
  - `dbo.fn_EffectiveStatus(@Status varchar(20), @LastUpdatedAt datetime, @Today date) RETURNS varchar(20)`: `'Expired'` when status is `Submitted` or `InfoRequested` and `DATEDIFF(day, @LastUpdatedAt, @Today) > 180`, else `@Status`.
  - `dbo.usp_ListPermitTypes`: active types, **no ORDER BY** (deliberate).
  - `dbo.usp_CalculateFee @PermitTypeCode varchar(20), @AreaSqM decimal(9,2), @IsSenior bit, @IsNonProfit bit, @FeeAmount money OUTPUT, @HstAmount money OUTPUT, @TotalAmount money OUTPUT`: raw = BaseFee + RatePerSqM * AreaSqM; non-profit ×0.50, else senior ×0.75 (non-profit wins); Fee = `ROUND(raw, 2)`; Hst = `ROUND(Fee * 0.13, 2)`; Total = Fee + Hst. Errors via `RAISERROR(…, 16, 1)`: `Unknown or inactive permit type %s`; `Area must be between 1 and 10000 square metres`.
  - `dbo.usp_CalculateDueDate @PermitTypeCode varchar(20), @SubmittedOn date, @DueDate date OUTPUT`
  - `dbo.usp_SubmitApplication @FirstName, @LastName, @Email = NULL, @Phone = NULL, @IsSenior, @IsNonProfit, @PermitTypeCode, @SiteAddress varchar(200), @AreaSqM, @Description = NULL, @SubmittedOn date, @ReferenceNumber varchar(20) OUTPUT`: transaction with TRY/CATCH/THROW; always inserts a new applicant; inserts the application with a `NEWID()` placeholder reference, then sets `'PRM-' + CONVERT(char(4), YEAR(@SubmittedOn)) + '-' + RIGHT('000000' + CONVERT(varchar(10), @id), 6)`; status `Submitted`; `SubmittedAt = LastUpdatedAt = GETDATE()`; history row `NULL → Submitted` by `applicant`.
  - `dbo.usp_ChangeStatus @ReferenceNumber varchar(20), @NewStatus varchar(20), @ChangedBy nvarchar(100), @Note nvarchar(500) = NULL, @Today date`: allowed `Submitted→UnderReview`, `UnderReview→InfoRequested|Approved|Rejected`, `InfoRequested→UnderReview`. Errors, checked in this order: `Application %s not found`; `Application %s has expired`; `Invalid status transition from %s to %s`; `A note is required when status is %s` (for `Rejected`, `InfoRequested`). Updates status and `LastUpdatedAt = GETDATE()`, adds history.
  - `dbo.usp_SearchApplications @SearchText nvarchar(100) = NULL, @Status varchar(20) = NULL, @Today date, @PageNumber int = 1, @PageSize int = 20`: matches `LIKE '%'+@SearchText+'%'` on FirstName, LastName, ReferenceNumber (NULL or '' matches all); status filter on effective status; `ORDER BY a.SubmittedAt DESC` only (no tiebreaker, deliberate); `OFFSET/FETCH`; columns `ReferenceNumber, FirstName, LastName, PermitTypeCode, PermitTypeName, Status (effective), SubmittedOn, DueDate, TotalAmount, TotalCount = COUNT(*) OVER()`.
  - `dbo.usp_GetApplicationByReference @ReferenceNumber varchar(20), @Today date`: `WHERE ReferenceNumber = @ReferenceNumber` (trailing spaces ignored by SQL Server, deliberate); all application, applicant and permit type columns, effective status.
  - `dbo.usp_GetStatusHistory @ReferenceNumber varchar(20)`: **no ORDER BY** (deliberate).
  - Reference data: permit types inserted in this order: `RENO` Home renovation 150.00/2.35/10; `DECK` Deck or porch 95.00/1.80/5; `SIGN` Commercial sign 120.00/4.15/7; `PATIO` Sidewalk patio 210.00/3.10/15; `DEMO` Demolition 300.00/1.25/20; `EVENT` Special event 75.00/0.00/3; `FENCE` Fence 60.00/0.90/5 inactive. Holidays (Ontario, 2024 to 2027): 2024-01-01, 02-19, 03-29, 05-20, 07-01, 08-05, 09-02, 10-14, 12-25, 12-26; 2025-01-01, 02-17, 04-18, 05-19, 07-01, 08-04, 09-01, 10-13, 12-25, 12-26; 2026-01-01, 02-16, 04-03, 05-18, 07-01, 08-03, 09-07, 10-12, 12-25, 12-28 (Boxing Day observed); 2027-01-01, 02-15, 03-26, 05-24, 07-01, 08-02, 09-06, 10-11, 12-27, 12-28 (both observed).

- [ ] **Step 1: Write `tests/db/legacy-procs.test.ts`** (Vitest, runs against Docker `mssql`, resets with `--seed none` in `beforeAll`). Assertions:
  - `usp_ListPermitTypes` returns codes in order `DECK, DEMO, EVENT, PATIO, RENO, SIGN` (clustered order, FENCE excluded).
  - `usp_CalculateFee('RENO', 10.70, 0, 0)` → raw 175.145 → Fee `175.15` (away from zero; banker's would give 175.14), Hst `22.77`, Total `197.92`.
  - `usp_CalculateFee('RENO', 100.00, 1, 1)` → non-profit wins: raw 385.00 × 0.50 = 192.50 → Fee `192.50`, Hst `25.03` (25.025 rounds up), Total `217.53`.
  - `usp_CalculateFee('FENCE', 10, 0, 0)` raises `Unknown or inactive permit type FENCE`; area `0.50` raises the area message.
  - `fn_AddBusinessDays('2026-10-09', 3)` → `2026-10-15` (skips Saturday 10, Sunday 11 and Thanksgiving 12). `fn_AddBusinessDays('2026-12-24', 2)` → `2026-12-30` (skips 25, 26, 27, 28). `fn_AddBusinessDays('2024-02-29', 1)` → `2024-03-01`. `fn_AddBusinessDays('2026-10-15', 10)` → `2026-10-29`.
  - `fn_EffectiveStatus('Submitted', '2026-04-17 23:30', '2026-10-15')` → `Expired` (DATEDIFF counts 181 boundaries); `fn_EffectiveStatus('Submitted', '2026-04-18 00:00', '2026-10-15')` → `Submitted`; `('Approved', '2020-01-01', '2026-10-15')` → `Approved`.
  - `usp_SubmitApplication` then `usp_GetApplicationByReference` with the reference plus a trailing space finds the row; reference matches `/^PRM-2026-\d{6}$/`.
  - `usp_ChangeStatus` error messages for each rule above, and a valid path `Submitted→UnderReview→InfoRequested(note)→UnderReview→Approved` leaves 5 history rows.
  - `usp_SearchApplications` with `'tremblay'` matches a `Tremblay` row (case-insensitive) and with `'Tremblé'` does not match `Tremblay` (accent-sensitive).
- [ ] **Step 2:** Run `npx vitest run db/` → FAIL (objects missing).
- [ ] **Step 3:** Implement the SQL files.
- [ ] **Step 4:** Run `npx vitest run db/` → PASS.
- [ ] **Step 5:** Commit `feat: legacy SQL Server schema and procedures`.

(The fee and date values above are worked examples; the implementer recomputes each one by hand before asserting and fixes the example, never the rule, if an example is wrong.)

---

### Task 3: Seed generator and catalog

**Files:**
- Create: `tests/src/seed/rng.ts`, `fee.ts`, `holidays.ts`, `records.ts`, `sql-writer.ts`, `generate.ts`; `tests/unit/seed.test.ts`; generated `tests/seed-data/seed-small.sql`, `tests/seed-data/catalog.json`

**Interfaces:**
- Produces:
  - CLI `tsx src/seed/generate.ts --size small|large --out <dir>`; npm scripts `seed:small` (writes `tests/seed-data/`), `seed:large` (writes `tests/reports/seed-large/`, not committed).
  - Sizes: small 300 applications plus catalog records; large 50,000 applications.
  - `computeFee(type: PermitTypeRow, areaCents: number, isSenior: boolean, isNonProfit: boolean): { fee: string; hst: string; total: string }` in `fee.ts`, using integer arithmetic and half away from zero, identical to `usp_CalculateFee`.
  - `catalog.json`: `{ fixedToday: "2026-10-15", categories: Record<CategoryName, string[] /* reference numbers */>, roundingHalfAreas: { permitTypeCode: string; areaSqM: string; isSenior: boolean; isNonProfit: boolean }[], dueDateProbes: string[] /* yyyy-mm-dd */, searchTerms: string[] }`.
  - `CategoryName` = `accentedNames | mixedCaseNames | trailingSpaceNames | htmlInNames | apostropheNames | nullContact | emptyVsNullDescription | longDescription | emojiDescription | roundingHalfFee | unroundedMoney | weekendSubmission | holidayAdjacentDueDate | dstWeekSubmission | monthEnd | leapDay | expiryBoundary | submittedAtTies | varcharAddressAccents | multiStepHistory`.
  - Faker: `@faker-js/faker` with locales `fr_CA` then `en_CA`, `faker.seed(20261015)`. All dates derived from `FIXED_TODAY`, never the real clock. Explicit IDs with `SET IDENTITY_INSERT`. `nvarchar` values as `N'…'`; `SiteAddress` as plain `'…'`. Insert batches of at most 500 rows.
  - Specific records: `htmlInNames` includes last names `<b>Roy</b>` and `<script>alert('x')</script>`; `trailingSpaceNames` includes `Tremblay ` (one trailing space); `mixedCaseNames` includes `MacDonald` and `macdonald`; `expiryBoundary` includes one `Submitted` row with `LastUpdatedAt = 2026-04-17 23:30` and one with `2026-04-18 00:00`; `unroundedMoney` rows have 4 decimal money values like `88.1234`; `submittedAtTies` has 5 rows sharing one `SubmittedAt`; `leapDay` submits on `2024-02-29`; `dstWeekSubmission` around `2026-03-08` and `2026-11-01`.
  - `searchTerms` includes: `tremblay`, `TREMBLAY`, `Tremblay ` (trailing space), `Tremblé`, `macdonald`, `O'B`, `PRM-2026`, `` (empty), `zzz-no-match`.

- [ ] **Step 1: Write `tests/unit/seed.test.ts`:** two runs of the small generator produce byte-identical SQL; every `CategoryName` has at least one reference; `computeFee` matches the Task 2 worked examples; every `roundingHalfAreas` entry produces a raw fee whose third decimal is exactly 5.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Integration check: `reset-legacy-db.ts --seed small` loads without error; `SELECT COUNT(*) FROM dbo.Applications` ≥ 300.
- [ ] **Step 6:** Commit generated files and code: `feat: deterministic synthetic seed data with migration hazards`.

---

### Task 4: Legacy business logic and data access (C#)

**Files:**
- Create in `legacy/src/Permits.Core/`: `Models/ApplicationStatus.cs` (`Submitted, UnderReview, InfoRequested, Approved, Rejected, Expired`), `Models/PermitType.cs`, `Models/FeeQuote.cs`, `Models/Applicant.cs`, `Models/Application.cs`, `Models/ApplicationSummary.cs`, `Models/StatusChange.cs`, `Models/SearchResult.cs`, `Models/SubmitApplicationRequest.cs`, `Validation/ApplicationValidator.cs`, `BusinessRuleException.cs`, `Clock.cs`, `IPermitRepository.cs`, `PermitService.cs`
- Create in `legacy/src/Permits.Data/`: `SqlPermitRepository.cs`

**Interfaces:**
- Produces (used by Tasks 5 and 6):
  - `public static class Clock { public static DateTime Today { get; } }`: `ConfigurationManager.AppSettings["FixedToday"]` when non-empty (parsed `yyyy-MM-dd`, invariant), else `TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time")).Date`.
  - `public class PermitService` with ctor `(IPermitRepository repo)` and methods: `IList<PermitType> GetPermitTypes()`, `FeeQuote QuoteFee(string permitTypeCode, decimal areaSqM, bool isSenior, bool isNonProfit)`, `DateTime CalculateDueDate(string permitTypeCode, DateTime submittedOn)`, `string Submit(SubmitApplicationRequest request)` (validates, uses `Clock.Today` as `SubmittedOn`, returns reference), `Application GetByReference(string referenceNumber)` (null when missing, **no Trim**), `SearchResult Search(string searchText, ApplicationStatus? status, int page, int pageSize)`, `Application ChangeStatus(string referenceNumber, ApplicationStatus newStatus, string changedBy, string note)`.
  - `SqlException` with `Number == 50000` is rethrown as `BusinessRuleException(message)`; validation failures throw `BusinessRuleException("Validation failed: " + string.Join("; ", errors))`.
  - Validation rules: first and last name required, max 100; email optional, must match `^[^@\s]+@[^@\s]+\.[^@\s]+$`; area 1 to 10000; site address required, max 200; permit type required.
  - `SqlPermitRepository` reads connection string `PermitsDb` from `ConfigurationManager.ConnectionStrings`, uses `System.Data.SqlClient` with `CommandType.StoredProcedure` only.
  - Status mapping DB string ↔ enum by name (`"UnderReview"` ↔ `UnderReview`).

- [ ] **Step 1:** Implement the files. Legacy authenticity: no unit test project (typical of the era), synchronous ADO.NET, `DataReader` mapping by column name.
- [ ] **Step 2:** `dotnet build legacy/Permits.Legacy.sln -c Release` → succeeds with zero errors.
- [ ] **Step 3:** Commit `feat: legacy business logic and data access`.

---

### Task 5: Legacy GraphQL API

**Files:**
- Create in `legacy/src/Permits.Web/Api/`: `GraphQLHandler.cs`, `Schema/PermitsSchema.cs`, `Schema/PermitsQuery.cs`, `Schema/PermitsMutation.cs`, `Schema/Types/*.cs`
- Modify: `legacy/src/Permits.Web/web.config` (handler registration)
- Create: `tests/src/api/graphql-client.ts`, `tests/src/api/operations.ts`, `tests/specs/smoke/legacy-api.spec.ts`

**Interfaces:**
- Produces the API contract both apps share (field and argument names exact; enum value spelling is whatever GraphQL.NET 2.4 `EnumerationGraphType<ApplicationStatus>` emits, and that becomes the baseline):
  - `Query`: `permitTypes: [PermitType]`; `feeQuote(permitTypeCode: String!, areaSqM: Decimal!, isSenior: Boolean!, isNonProfit: Boolean!): FeeQuote`; `dueDate(permitTypeCode: String!, submittedOn: Date!): Date`; `application(referenceNumber: String!): Application`; `searchApplications(searchText: String, status: ApplicationStatus, page: Int, pageSize: Int): ApplicationSearchResult`.
  - `Mutation`: `submitApplication(input: ApplicationInput!): SubmitApplicationResult`; `changeStatus(referenceNumber: String!, newStatus: ApplicationStatus!, changedBy: String!, note: String): Application`.
  - Types: `PermitType { code name baseFee ratePerSqM reviewBusinessDays }`, `FeeQuote { feeAmount hstAmount totalAmount }`, `Applicant { firstName lastName email phone isSenior isNonProfit }`, `StatusChange { fromStatus toStatus changedAt changedBy note }`, `Application { referenceNumber applicant permitType siteAddress areaSqM description status submittedOn submittedAt dueDate feeAmount hstAmount totalAmount lastUpdatedAt history }`, `ApplicationSummary { referenceNumber firstName lastName permitTypeCode permitTypeName status submittedOn dueDate totalAmount }`, `ApplicationSearchResult { totalCount page pageSize items }`, `ApplicationInput { firstName lastName email phone isSenior isNonProfit permitTypeCode siteAddress areaSqM description }`, `SubmitApplicationResult { referenceNumber feeAmount totalAmount dueDate }`.
  - Endpoint `POST /graphql`, JSON `{ query, variables, operationName }`; HTTP 200 for executed operations even with errors; malformed JSON body → 400 plain text `Invalid request`. `ExposeExceptions = true` (legacy behavior: stack traces in error messages). Defaults `page = 1`, `pageSize = 20`.
  - TS: `class GraphQLClient { constructor(request: APIRequestContext, url: string); send(query: string, variables?: Record<string, unknown>): Promise<{ status: number; body: unknown; raw: string }> }`. `operations.ts` exports one named document string per operation: `PERMIT_TYPES`, `FEE_QUOTE`, `DUE_DATE`, `APPLICATION`, `SEARCH`, `SUBMIT`, `CHANGE_STATUS`, `INTROSPECTION` (selecting every field above).

- [ ] **Step 1: Write `legacy-api.spec.ts`** (`@smoke`): each document in `operations.ts` executes against legacy with status 200 and no `errors`, using catalog references; malformed body returns 400.
- [ ] **Step 2:** Implement; Mac build passes.
- [ ] **Step 3:** Push; Windows run green (counts toward the 25 run cap).
- [ ] **Step 4:** Commit `feat: legacy GraphQL API`.

---

### Task 6: Legacy Web Forms UI

**Files:**
- Create in `legacy/src/Permits.Web/`: `Site.Master` (+ `.cs`, `.designer.cs`), `Default.aspx`, `Apply.aspx`, `Detail.aspx`, `Review.aspx` (each with `.aspx.cs` and `.aspx.designer.cs`), `Global.asax` (+ `.cs`), `Content/site.css`
- Modify: `web.config` (`<globalization culture="en-CA" uiCulture="en-CA" />`, `<customErrors mode="RemoteOnly" />`, `<pages controlRenderingCompatibilityVersion="4.0" clientIDMode="Predictable" />`, appSetting `FixedToday`)
- Create: `tests/specs/smoke/legacy-ui.spec.ts`

**Interfaces:**
- Produces the control IDs the legacy driver (Task 11) targets (rendered with the `MainContent_` prefix):
  - `Default.aspx` (search): `SearchText`, `StatusFilter` (first item `All statuses`, then display names), `SearchButton`, `ResultCount` (`{n} applications found`), `ResultsGrid` with columns Reference (link to `Detail.aspx?ref=`), Applicant (`Last, First`), Permit type, Status, Submitted (`yyyy-MM-dd`), Due (`yyyy-MM-dd`), Total (`{0:C}`); GridView paging 20 per page with postback pager.
  - `Apply.aspx`: `FirstName`, `LastName`, `Email`, `Phone` (its label is plain text without `AssociatedControlID`, a realistic legacy gap), `IsSenior`, `IsNonProfit`, `PermitType` (from `usp_ListPermitTypes`, unsorted), `SiteAddress`, `AreaSqM`, `Description`, `PreviewButton`, `FeePanel` with `FeeAmount`, `HstAmount`, `TotalAmount`, `DueDate`, `SubmitButton`, `ConfirmationPanel` with `ReferenceNumber`, `ValidationSummary`. Validators: required names, address, area; `RangeValidator` area 1 to 10000; email regex.
  - `Detail.aspx?ref=`: labels `Reference`, `ApplicantName` (rendered through `<%= %>` without encoding: deliberate legacy flaw), `Email`, `Phone`, `PermitTypeName`, `SiteAddress`, `Area`, `Description`, `Status`, `SubmittedOn`, `DueDate`, `Fee`, `Hst`, `Total`; `HistoryRepeater` rows; `NotFoundPanel`. Also accepts legacy `?id=` (`int.Parse`, so `?id=abc` throws and shows the detailed ASP.NET error page to local requests: deliberate).
  - `Review.aspx?ref=`: `CurrentStatus`, `NewStatus`, `ChangedBy`, `Note`, `ChangeButton`, `ErrorMessage` (red `#ff0000` text), `SuccessMessage`.
  - Status display names: `Submitted`, `Under review`, `Info requested`, `Approved`, `Rejected`, `Expired`.

- [ ] **Step 1: Write `legacy-ui.spec.ts`** (`@smoke`): each page loads with HTTP 200; a search for `tremblay` shows at least one row; preview on Apply for `RENO` / `10.70` shows `$175.15`, `$22.77`, `$197.92` and due date `2026-10-29`; submitting returns a reference matching `/^PRM-2026-\d{6}$/`; an invalid transition on Review shows `Invalid status transition from Approved to UnderReview` for an approved catalog record.
- [ ] **Step 2:** Implement; Mac build passes.
- [ ] **Step 3:** Push; Windows run green.
- [ ] **Step 4:** Commit `feat: legacy Web Forms UI`.

---

### Task 7: Quality documents, risk register and conversion brief

**Files:**
- Create: `docs/quality/test-strategy.md`, `docs/quality/risks.json`, `docs/quality/risk-register.md` (generated), `docs/quality/release-plan.md`, `docs/quality/rollback-runbook.md`, `docs/quality/defect-log.md` (template, no entries), `docs/quality/go-no-go-template.md`, `docs/quality/approved-differences.md` (explains the process; data lives in `tests/approved-differences.json`, initially `[]`), `docs/decisions/0001-blind-conversion.md`, `0002-recorded-legacy-baselines.md`, `0003-build-once-promote-by-digest.md`, `0004-point-of-no-return.md`, `0005-traceability-with-real-evidence.md`, `0007-private-first-then-public.md`, `docs/conversion/brief.md`
- Create: `tests/src/gate/risks.ts`, `tests/src/gate/risk-register-md.ts`, `tests/unit/risks.test.ts`

**Interfaces:**
- Produces `docs/quality/risks.json`: array of `{ id, title, area, likelihood: 1|2|3, impact: 1|2|3, detection, stage: "qa"|"staging"|"prod", status: "open" }`. IDs (exact):
  - qa: `RISK-FEE-01` rounding of halves; `RISK-FEE-02` discount precedence and HST; `RISK-DATE-01` business days and holidays; `RISK-DATE-02` Toronto "today" and time zone IDs; `RISK-DATE-03` expiry day boundary; `RISK-SEARCH-01` case-insensitive search; `RISK-SEARCH-02` trailing spaces in exact lookup; `RISK-SEARCH-03` accent handling; `RISK-ORDER-01` implicit result order; `RISK-ORDER-02` paging and ties; `RISK-WF-01` status transitions and business errors; `RISK-REF-01` reference number format; `RISK-API-01` schema breaking changes; `RISK-API-02` error shape and messages; `RISK-API-03` scalar serialization; `RISK-UI-01` page behavior; `RISK-UI-02` culture formatting; `RISK-UI-03` validation messages; `RISK-A11Y-01` axe WCAG 2.1 AA; `RISK-A11Y-02` keyboard and focus; `RISK-A11Y-03` reflow at 375px; `RISK-A11Y-04` landmarks and link names; `RISK-SEC-01` output encoding; `RISK-SEC-02` error detail leakage; `RISK-SEC-03` security headers; `RISK-HEALTH-01` console errors; `RISK-PERF-02` Lighthouse budgets; `RISK-TEST-01` test logic strength (mutation score).
  - staging: `RISK-DATA-01` row counts; `RISK-DATA-02` value fidelity (money precision, unicode, varchar code page, null vs empty); `RISK-DATA-03` referential integrity; `RISK-DATA-04` migration duration vs cutover window; `RISK-PERF-01` load performance.
  - prod: `RISK-REL-01` released artifact is the tested artifact; `RISK-REL-02` post-release smoke; `RISK-REL-03` introspection disabled in prod; `RISK-REL-04` rollback works.
- `loadRisks(file = '../docs/quality/risks.json'): Risk[]` validates with zod: unique IDs matching `/^RISK-[A-Z0-9]+-\d{2}$/`.
- `renderRiskRegister(risks: Risk[]): string` → the markdown table in `risk-register.md` (columns: ID, Risk, Likelihood, Impact, Score = L×I, Detection, Stage, Status). npm script `risks:md` writes it.
- `docs/conversion/brief.md`: target stack (.NET 10, Blazor static server rendering with interactivity only where needed, Hot Chocolate GraphQL at `POST /graphql` keeping the same operations, PostgreSQL with stored procedures converted to PL/pgSQL functions, data migration script SQL Server → PostgreSQL), and the deployment contract: `modern/Dockerfile`, listens on 8080, `GET /healthz` returns 200, connection string from env `ConnectionStrings__PermitsDb`, fixed date from env `App__FixedToday`. It names nothing about tests, risks or seed data.

- [ ] **Step 1: Write `tests/unit/risks.test.ts`:** `loadRisks()` returns 37 risks with unique IDs; `renderRiskRegister` output equals the committed `risk-register.md` (keeps them in sync).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write the documents and code. The test strategy covers scope, test levels, the one-test-two-apps approach, record and compare modes, environments and gates (spec 7.5), entry and exit criteria, defect triage, and the owner's three approval points. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `docs: test strategy, risk register, release plan and decisions`.

---

### Task 8: Test framework core

**Files:**
- Create: `tests/src/config/env.ts`, `tests/src/fixtures.ts`, `tests/eslint.config.mjs`, `tests/unit/env.test.ts`
- Modify: `tests/playwright.config.ts`, `tests/package.json`

**Interfaces:**
- Produces:
  - `type Target = 'legacy' | 'modern'`; `type Stage = 'local' | 'dev' | 'qa' | 'staging' | 'prod'`; `interface TestEnv { stage: Stage; target: Target; baseUrl: string; graphqlUrl: string; fixedToday: string; parityMode: 'compare' | 'record'; legacyDbUrl?: string; modernDbUrl?: string }`; `loadEnv(source: NodeJS.ProcessEnv = process.env): TestEnv` from `TEST_STAGE` (default `local`), `TARGET` (required), `BASE_URL` (required), `FIXED_TODAY` (default `2026-10-15`), `PARITY_MODE` (default `compare`), `LEGACY_DB_URL`, `MODERN_DB_URL`. `graphqlUrl = baseUrl + '/graphql'`.
  - Playwright fixtures: `env: TestEnv`, `gql: GraphQLClient`, `app: AppDriver` (Task 11), `consoleErrors: string[]`.
  - Playwright config: `testDir: 'specs'`, reporters `list`, `html` (`playwright-report`), `json` (`reports/playwright.json`), `allure-playwright` (`allure-results`); `retries: 0` (flakiness must be visible); `use.baseURL` from env; `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`; projects `chromium`.
  - Tag convention: tags in the test details object (`{ tag: ['@parity', '@RISK-FEE-01'] }`). Allowed non-risk tags: `@smoke @regression @api @parity @ui @a11y @security @data @perf`.
  - npm scripts: `typecheck`, `lint`, `test:unit` (Vitest `unit/`), `test:db` (Vitest `db/`), `test:e2e`, `test:smoke` (`--grep @smoke`), `test:parity`, `test:mutation`, `gate`, `seed:small`, `seed:large`, `db:legacy:reset`, `risks:md`.

- [ ] **Step 1: Write `unit/env.test.ts`:** missing `TARGET` throws; `PARITY_MODE=record` with `TARGET=modern` throws `Baselines can only be recorded from the legacy app`; defaults applied; `graphqlUrl` derived.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS, plus `npm run typecheck` and `npm run lint` clean.
- [ ] **Step 5:** Commit `test: framework configuration and fixtures`.

---

### Task 9: Parity engine

**Files:**
- Create: `tests/src/parity/normalize.ts`, `diff.ts`, `baseline-store.ts`, `approved-differences.ts`, `expect-parity.ts`; `tests/unit/normalize.test.ts`, `diff.test.ts`, `approved-differences.test.ts`, `baseline-store.test.ts`; `tests/stryker.config.mjs`

**Interfaces:**
- Produces:
  - `type Json = null | boolean | number | string | Json[] | { [k: string]: Json }`.
  - `type VolatileKind = 'referenceNumber' | 'timestamp'`; `normalizeResponse(res: { status: number; body: unknown }, volatile: Record<string, VolatileKind> = {}): Json` → `{ status, data, errors }` where each error becomes `{ message: <first line of message>, path }` (locations, extensions and stack text dropped); values at volatile paths (dot paths with `[*]` for array items) become `"<referenceNumber>"` / `"<timestamp>"` only if they match `/^PRM-\d{4}-\d{6}$/` or parse as ISO 8601 date-time, else `"<invalid referenceNumber: VALUE>"` / `"<invalid timestamp: VALUE>"`; object keys sorted; nothing else changes (no trimming, no case folding, no number reformatting, array order kept).
  - `normalizeValues(values: Record<string, string>): Json` for UI cases: keys sorted, values untouched.
  - `interface Difference { path: string; kind: 'changed' | 'missing' | 'added' | 'type'; expected?: Json; actual?: Json }`; `diffJson(expected: Json, actual: Json, path = '$'): Difference[]` (arrays by index; `1` vs `"1"` is `type`).
  - Baselines: one file per case at `tests/baselines/legacy/<suite>/<caseId>.json` containing `{ suite, caseId, risks: string[], request: Json, normalized: Json, recordedAt: <ISO> }`. `writeBaselineCase(c: BaselineCase): void`; `readBaselineCase(suite: string, caseId: string): BaselineCase | undefined`. Case IDs are kebab case, stable and readable (`fee-reno-10.70-senior`).
  - `interface ApprovedDifference { id: string; suite: string; caseId: string /* or "*" */; path: string /* "*" segment wildcard allowed */; reason: string; approvedBy: string; approvedOn: string; defect?: string }`; `loadApprovedDifferences(file = 'approved-differences.json'): ApprovedDifference[]` (zod; `approvedBy` must be non-empty); `filterApproved(diffs, suite, caseId, approved): { remaining: Difference[]; applied: string[] }`.
  - `expectParity(testInfo: TestInfo, args: { suite: string; caseId: string; risks: string[]; request: Json; actual: Json }): void`: in record mode writes the case; in compare mode a missing baseline fails with `No legacy baseline for <suite>/<caseId>`, then diffs, filters approved differences, and fails listing remaining differences. Each call pushes annotation `{ type: 'evidence', description: 'parity=1' }` and `{ type: 'approved-difference', description: id }` per applied approval.
  - Stryker: mutate `src/parity/**/*.ts` and `src/gate/**/*.ts`, Vitest runner, `ignoreStatic: false`, thresholds `{ high: 90, low: 85, break: 85 }`, JSON report to `reports/mutation/mutation.json`.

- [ ] **Step 1: Write unit tests:** `normalizeResponse` keeps `" Roy"` distinct from `"Roy"`; keeps `"174.67"` (string) distinct from `174.67` (number) through `diffJson` (`type`); reordered arrays produce `changed` differences; a stack trace after the first line is dropped; an invalid reference number becomes `<invalid referenceNumber: X>`; `filterApproved` only removes exact suite/case/path matches and wildcard segments; `expectParity` in compare mode with no baseline file throws.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** `npm run test:mutation` → score ≥ 85 and the report shows killed mutants (not zero tests run). Add tests until it passes.
- [ ] **Step 6:** Commit `test: parity engine with mutation tested normalizers`.

---

### Task 10: Traceability gate

**Files:**
- Create: `tests/src/gate/results.ts`, `evidence.ts`, `traceability.ts`, `gate-cli.ts`; `tests/unit/traceability.test.ts`, `tests/unit/results.test.ts`

**Interfaces:**
- Consumes: `loadRisks` (Task 7), annotation conventions (Task 9).
- Produces:
  - `interface TestResult { title: string; file: string; status: 'passed' | 'failed' | 'skipped'; tags: string[]; evidence: { name: string; examined: number }[] }`; `readPlaywrightResults(jsonFile: string): TestResult[]` (normalizes tags to the `@` form; evidence annotations `name=count` summed per test).
  - `interface CheckEvidence { name: string; risks: string[]; passed: boolean; examined: number; detail: string }` stored as JSON files in `reports/evidence/`; `writeCheckEvidence(e: CheckEvidence): void`; `readCheckEvidence(dir: string): CheckEvidence[]`.
  - `type GateProblem = { kind: 'uncovered'; riskId: string } | { kind: 'unknown-tag'; tag: string; test: string } | { kind: 'untagged'; test: string } | { kind: 'empty-evidence'; test: string; evidence: string }`.
  - `evaluateGate(risks: Risk[], results: TestResult[], checks: CheckEvidence[], stage: 'qa' | 'staging' | 'prod'): { rows: { riskId: string; title: string; covered: boolean; coveredBy: string[] }[]; problems: GateProblem[] }`. Rules: only risks of `stage` must be covered; covered means at least one passed test tagged with the ID whose evidence entries all have `examined > 0`, or a passed check with `examined > 0`; a passed test with an evidence entry of 0 yields `empty-evidence`; a risk tag not in `risks.json` yields `unknown-tag`; a test with no risk tag yields `untagged`; skipped tests never cover.
  - CLI: `tsx src/gate/gate-cli.ts --stage qa --playwright reports/playwright.json --evidence reports/evidence` prints a markdown matrix, appends it to `$GITHUB_STEP_SUMMARY` when set, writes `reports/traceability.json`, exits 1 when `problems.length > 0`.

- [ ] **Step 1: Write unit tests** for each rule, including: a risk covered only by a skipped test is `uncovered`; a passing parity test with `parity=0` evidence is `empty-evidence` and does not cover; staging risks are ignored at `qa`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** `npm run test:mutation` still ≥ 85.
- [ ] **Step 6:** Commit `test: traceability gate that refuses empty evidence`.

---

### Task 11: Drivers and product test suites

**Files:**
- Create: `tests/src/drivers/types.ts`, `tests/src/drivers/legacy/{search,apply,detail,review,index}.ts`, `tests/src/drivers/modern/index.ts`
- Create specs: `tests/specs/api/contract.spec.ts`, `fee-quote.spec.ts`, `due-date.spec.ts`, `search.spec.ts`, `application.spec.ts`, `permit-types.spec.ts`, `workflow.spec.ts`; `tests/specs/ui/search.spec.ts`, `apply.spec.ts`, `detail.spec.ts`, `review.spec.ts`; `tests/specs/a11y/axe.spec.ts`, `keyboard.spec.ts`, `reflow.spec.ts`, `landmarks.spec.ts`; `tests/specs/security/encoding.spec.ts`, `errors.spec.ts`, `headers.spec.ts`, `console.spec.ts`; `tests/specs/smoke/smoke.spec.ts`
- Remove: `tests/specs/smoke/spike.spec.ts` (superseded)

**Interfaces:**
- Produces:
  - `interface AppDriver { search: SearchPage; apply: ApplyPage; detail: DetailPage; review: ReviewPage; pages: { name: string; path: string }[]; errorProbes: string[] }` with `SearchPage { open(); search(text: string, status?: string); rows(): Promise<SearchRow[]>; countText(): Promise<string>; statusOptions(): Promise<string[]>; goToPage(n: number) }`, `SearchRow { reference; applicant; permitType; status; submitted; due; total }` (all strings as displayed), `ApplyPage { open(); permitTypeOptions(): Promise<string[]>; fill(f: ApplyForm); preview(): Promise<{ fee: string; hst: string; total: string; dueDate: string }>; submit(): Promise<string>; validationMessages(): Promise<string[]> }`, `DetailPage { open(ref: string); values(): Promise<Record<string, string>>; history(): Promise<Record<string, string>[]>; isNotFound(): Promise<boolean> }`, `ReviewPage { open(ref: string); change(newStatus: string, changedBy: string, note?: string): Promise<{ error?: string; success?: string }> }`.
  - `createModernDriver(page)` throws `Error('Modern UI driver is written after the conversion (Plan 2)')`.
  - Suite rules:
    - Every product test carries at least one risk tag; every parity assertion goes through `expectParity`.
    - Database state after an action is observed through the API (`application` with `history`) right after each mutation. Direct table comparison happens in the staging migration check (Task 13, Plan 2). *Claude's call:* the modern table names are unknown until the conversion.
    - API parity cases: fee quotes for every active type × areas `1.00, 10.70, 99.99, 250.00, 10000.00` × discounts `none, senior, nonprofit, both`, plus every `roundingHalfAreas` entry; due dates for every `dueDateProbes` date × every active type; searches for every `searchTerms` term × status filters `none, SUBMITTED, EXPIRED` (spelled as recorded) × pages 1 and 2; `application` for every catalog reference plus each `trailingSpaceNames` reference with a trailing space and `PRM-2099-999999` (not found); `permitTypes` once; workflow: submit 3 new applications, valid path, each invalid rule, change on an expired record. Volatile: `referenceNumber` of new submissions, `submittedAt`, `lastUpdatedAt`, `history[*].changedAt`.
    - `contract.spec.ts` (`@RISK-API-01`): record mode writes the introspection result as baseline case `schema/introspection`; compare mode builds both schemas with `buildClientSchema` and fails on any `findBreakingChanges` entry not approved (approved path `schema:<type>.<field>`).
    - UI parity: values shown for searches `tremblay`, `MacDonald`, `PRM-2026`; detail values for 10 catalog references (one per category where visible); apply preview for 5 fee cases; validation messages for an empty submit and area `0`; review error text for one invalid transition.
    - Accessibility and security tests record legacy findings into baselines in record mode (`a11y/<page>`, `security/headers`, `security/errors`, `security/encoding`) and skip their modern gates there (`test.skip(env.parityMode === 'record', 'gate applies to the modern app')`). In compare mode the gates are: zero `serious` or `critical` axe violations and per-page counts not above legacy; Apply tab order reaches every field in visual order with a visible focus indicator; `document.documentElement.scrollWidth <= 375` at 375px; exactly one `main` landmark and unique accessible names per distinct link target; HTML names render as literal text (no `<b>` element, no dialog); responses to `errorProbes` and a malformed GraphQL query contain none of `Stack Trace`, `   at `, `System.`, `Exception`; headers include `x-content-type-options: nosniff`, a `content-security-policy`, `referrer-policy`, and exclude `x-aspnet-version`, `x-powered-by`; no console errors on any page.
    - `smoke.spec.ts` (`@smoke @RISK-REL-02`): home page 200; `permitTypes` non-empty; `GET /healthz` 200 when `TARGET=modern`.

- [ ] **Step 1:** Write the driver types, the legacy driver and the specs.
- [ ] **Step 2:** `npm run typecheck` and `npm run lint` clean.
- [ ] **Step 3:** Push and run `legacy.yml` with `mode=smoke` → smoke passes on Windows. Fix legacy driver selectors from the uploaded traces when needed.
- [ ] **Step 4:** Commit `test: product suites and legacy driver`.

---

### Task 12: Record legacy baselines on Windows (plus legacy Lighthouse and k6 reference)

**Files:**
- Create: `tests/perf/journeys.js`, `tests/lighthouse/lighthouserc.cjs`, `tests/src/gate/k6-evidence.ts`, `tests/src/gate/lighthouse-evidence.ts`, `tests/bruno/` collection (`bruno.json`, one request per operation in `operations.ts`, environments `legacy` and `local`)
- Modify: `.github/workflows/legacy.yml` (record mode steps), `tests/baselines/legacy/**` (committed results)

**Interfaces:**
- Produces:
  - `legacy.yml` with `mode=record`: reset DB with `--seed small`, run `PARITY_MODE=record` for `specs/api specs/ui specs/a11y specs/security`, run Lighthouse CI on `/Default.aspx` and `/Apply.aspx` (scores saved to `baselines/legacy/lighthouse/summary.json`), run k6 `journeys.js` for 30 s with 5 virtual users (summary saved to `baselines/legacy/perf/summary.json`, reference only), upload `tests/baselines/legacy` as artifact `legacy-baselines`.
  - `journeys.js`: k6 script with scenarios search, fee quote, application by reference; thresholds `http_req_duration: ['p(95)<500']`, `http_req_failed: ['rate<0.01']`; `BASE_URL` from env.
  - `k6-evidence.ts` and `lighthouse-evidence.ts` turn summaries into `CheckEvidence` for `RISK-PERF-01` and `RISK-PERF-02`.
  - Lighthouse budgets for the modern app (asserted in Plan 2, configured now): performance ≥ 0.80, accessibility ≥ 0.95, best-practices ≥ 0.90.

- [ ] **Step 1:** Trigger `gh workflow run legacy.yml --ref foundation -f mode=record` (the stub from Task 0 makes dispatch possible).
- [ ] **Step 2:** Download the artifact into `tests/baselines/legacy/`. Verify: every suite folder exists, there are at least 400 case files, `schema/introspection.json` exists, and no case contains `<invalid`.
- [ ] **Step 3:** Run the record twice and diff the two artifacts: only `recordedAt` may differ. Anything else is nondeterminism to fix before committing (Review Focus 4).
- [ ] **Step 4:** Commit `test: recorded legacy baselines` (this commit is reviewed by the owner as part of approval point 2).

---

### Task 13: Data migration validation module

**Files:**
- Create: `tests/src/migration/mapping.ts`, `sources.ts`, `validate.ts`, `validate-cli.ts`; `tests/unit/migration-validate.test.ts`; `tests/db/migration-validate.test.ts`

**Interfaces:**
- Produces:
  - `interface ColumnMap { source: string; target: string; kind: 'text' | 'varchar' | 'money' | 'decimal' | 'int' | 'bool' | 'date' | 'datetime' }`; `interface TableMap { source: string; target: string; key: string[]; columns: ColumnMap[] }`; `loadMapping(file: string): TableMap[]` (zod). The real mapping file is written in Plan 2 once the converted schema exists.
  - `interface SqlSide { dialect: 'mssql' | 'postgres'; query<T>(sql: string): Promise<T[]> }`; `mssqlSide(url: string): Promise<SqlSide>`; `postgresSide(url: string): Promise<SqlSide>`.
  - `validateMigration(src: SqlSide, dst: SqlSide, mapping: TableMap[], probeKeys: Record<string, (string | number)[][]>): Promise<MigrationReport>`; `MigrationReport { tables: { table: string; sourceRows: number; targetRows: number; columns: { column: string; check: string; source: string; target: string; ok: boolean }[]; probes: { key: string; differences: Difference[] }[] }[]; ok: boolean; examinedRows: number; durationMs: number }`. Per column: non-null count; for `money`/`decimal`/`int` exact sum as a string with scale 4; for `date`/`datetime` min and max as ISO strings; for text kinds sum of character lengths plus a SHA-256 over values ordered by key, computed in Node from fetched values so both dialects hash identically.
  - CLI writes `CheckEvidence` for `RISK-DATA-01`, `RISK-DATA-02`, `RISK-DATA-03` (FK orphan counts) and `RISK-DATA-04` (duration).

- [ ] **Step 1: Write tests:** unit tests of the comparison logic with in-memory `SqlSide` fakes (a changed money value, a dropped row, a trailing space change, `''` vs `NULL` each produce a failure); an integration test copying `Permits` to `PermitsCopy` on Docker SQL Server and validating `ok === true`, then altering one value and expecting `ok === false`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `test: data migration validation`.

---

### Task 14: Placeholder modern app, compose and the pipeline (build, dev, qa)

**Files:**
- Create: `modern/Dockerfile`, `modern/src/Permits.Placeholder/Permits.Placeholder.csproj` (`net10.0`), `Program.cs`, `.github/workflows/pipeline.yml`
- Modify: `compose.yaml` (add `postgres` 17 and `app`)

**Interfaces:**
- Produces:
  - Placeholder: `GET /healthz` → 200 `ok`; every other path → 501 `{"error":"not converted yet"}`. Listens on 8080.
  - `compose.yaml` services: `mssql` (profile `legacy-db`, `mcr.microsoft.com/mssql/server:2022-latest`, `platform: linux/amd64`, `MSSQL_PID=Developer`, healthcheck with `/opt/mssql-tools18/bin/sqlcmd -C`), `postgres` (`postgres:17`, db `permits`, healthcheck `pg_isready`), `app` (image `${APP_IMAGE:-permits-modern:local}`, port 8080, env `ConnectionStrings__PermitsDb`, `App__FixedToday=2026-10-15`, depends on healthy `postgres`).
  - `pipeline.yml` on `pull_request` and `workflow_dispatch`, jobs on `ubuntu-latest`:
    - `build`: setup .NET 10 and Node 22; `dotnet build`/`test` the modern solution; `npm ci`, `typecheck`, `lint`, `test:unit`, `test:mutation` (Stryker evidence for `RISK-TEST-01`); `docker build` → `docker save` → artifact `image` (retention 1 day); output `digest` (the image ID).
    - `dev` (needs build): load image, verify the loaded image ID equals `build.outputs.digest`, `docker compose up -d app postgres`, run `@smoke` and `contract.spec.ts` against `TARGET=modern`.
    - `qa` (needs dev): same image check, full `specs/` in compare mode, then `npm run gate -- --stage qa`. Upload Playwright report, Allure results and `reports/traceability.json`. Publish Allure to Pages only when `github.event.repository.private == false`.
    - No `environment:` keys while the repo is private (free private repos lack environments). Staging and prod jobs come in Plan 2.
  - Before the conversion, `dev` and `qa` are expected to fail against the placeholder. Proving the pipeline means: build is green; dev and qa run to completion; the qa gate output lists `uncovered` risks and parity failures name `No legacy baseline` or real differences, never a crash of the tooling.

- [ ] **Step 1:** Build and run the placeholder locally with compose; `curl localhost:8080/healthz` → `ok`.
- [ ] **Step 2:** Push; open the draft PR (Task 15 fills its description) so `pull_request` triggers. Watch: build green; dev and qa fail only in the expected way; the gate summary renders in the job summary.
- [ ] **Step 3:** Commit `ci: build, dev and qa stages with placeholder app`.

---

### Task 15: README draft, walkthrough and the approval pull request

**Files:**
- Modify: `README.md`
- Create: `docs/quality/walkthrough.md`

**Interfaces:**
- README sections: the story (LAB200 inspiration, free tools only, no AWS account, Kiro or AWS Transform used), before/after table mirroring the slide with free stand-ins, "AI migrates, QE proves it's safe", status (foundation done, conversion pending approval), how to run locally on a Mac, who did what (Claude Code wrote the code and first drafts under the owner's direction; the owner reviews and approves), links to the quality docs.
- Walkthrough: a 10 minute interview narrative through the repo in the order a reviewer should read it.

- [ ] **Step 1:** Write both files, check the no-dash rule with `grep -nE "—|–| - " README.md docs/quality/*.md docs/decisions/*.md` (only list markers may match).
- [ ] **Step 2:** Push; set the PR title `Foundation: legacy app, quality plan and test framework (approval point 1)`, body: what to review (risk register, test strategy, recorded baselines), what the red dev/qa checks mean, and the explicit instruction that merging it is the owner's approval point 1 and that the conversion starts only after the merge. Mark it ready for review.
- [ ] **Step 3:** Commit `docs: README and walkthrough`.
