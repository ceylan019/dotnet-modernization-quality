# Kiromig: a .NET modernization told from the quality side

Design document. Date: 2026-10-20. Status: draft, pending owner review.

## 1. Intent

The owner (Ceylan) is a Quality Engineer whose strengths are test strategy, risk management, and running the release process. They attended LAB200 "Introducing Kiro" at the AWS Public Sector AI Symposium in Ottawa (2026). The slides showed AWS Transform doing a full-stack Windows modernization:

| Layer | Before | After |
|---|---|---|
| Application | .NET Framework 3.5+, Web Forms UI, business logic layer, data access layer | Cross-platform .NET 10, Blazor UI, modernized business logic and data access |
| Database | SQL Server, schema and stored procedures | Aurora PostgreSQL, converted schema and stored procedures, migrated data |
| Deployment | Virtual machine running Windows Server | Amazon ECS or EC2 Linux |

This project re-creates that migration as a public GitHub portfolio piece, told from the quality side. The message to a hiring manager is: **"AI migrates, QE proves it's safe."** Code conversion is the part that's easy to automate. The repo shows everything around it that decides whether a migration can ship: a strategy and risk register written before any code moves, tests that pin down how the old system really behaves, proof that the new system matches it, and a gated release through four environments.

The story follows the owner's real experience. In a past migration, problems (endpoints wired wrong, broken captions) were caught in the QA environment, so the production release was uneventful. The repo shows the same pattern, with real evidence.

## 2. Goals

1. A small but realistic legacy app (the "before") with business rules worth protecting.
2. A conversion to the "after" stack done by an AI coding agent standing in for AWS Transform, kept visible in the git history.
3. A quality layer: test strategy, risk register, characterization tests, old vs new parity tests, API contract tests, accessibility comparison, data migration validation, and performance checks.
4. A pipeline with four environments (dev, qa, staging, prod), real gates between them, and a human approval before prod.
5. Public evidence a reviewer can click through: a published test report, a defect log showing what the tests caught, and a release record with its go/no-go decision.

## 3. Non-goals

- Showing deep .NET development skill. The apps are the thing under test, not the showcase.
- Real cloud deployment. "Production" is a versioned release of container images, not running servers.
- Production-grade app features such as real authentication, scale, or a bilingual UI.
- Reproducing AWS Transform or Kiro exactly. Claude Code plays both roles.

## 4. Anti-goals (failure even if everything works)

- The repo reads like a generic CRUD tutorial with some unit tests on top.
- Anything taken from the owner's employer or work projects: code, structure, names, data, config. All content is original.
- Any step that needs an AWS account, a credit card, a Kiro subscription, or any other paid service.
- Misrepresentation. The README never implies AWS Transform or Kiro was used, and it says plainly that Claude Code wrote the code under the owner's direction.
- Staged results. Every entry in the defect log was really caught by a test during this project. Nothing is planted after the fact to make the story look better. The legacy app is deliberately designed to contain real-world migration hazards, and the README says so. Whether the conversion trips over them is whatever really happens.

## 5. Constraints

- **Cost: free.** Public GitHub repo, GitHub Actions (standard runners are free for public repos), GitHub Environments, GitHub Container Registry, GitHub Pages, Docker Desktop for personal use, SQL Server Developer edition, and Claude Code under the owner's existing plan.
- **Owner's machine:** Apple Silicon (M3 Pro), 36 GB RAM, about 36 GB free disk. Installed: Docker Desktop, Node, Python, Java, Maven, git, GitHub CLI. Not installed: .NET SDK (the free .NET 10 SDK gets installed when building starts).
- **The legacy app never runs on the Mac.** .NET Framework is Windows only, and the owner chose not to run a Windows VM. The legacy app is built, run and tested only on GitHub Actions Windows runners.
- **SQL Server** runs in Docker on the Mac (the amd64 image under Rosetta emulation, slower but fine at this size) and on Linux runners. Windows runners can't run Linux containers, so the legacy job installs SQL Server natively on the runner (for example LocalDB or SQL Server Express). The builder verifies which option is quick and reliable.
- **Test code language:** TypeScript, the owner's main language.
- **Repo host:** GitHub, `ceylan019/dotnet-modernization-quality` (the owner's account, already logged in through the GitHub CLI on the Mac). It **starts private** so the owner can review everything first, then the owner switches it to public. Switching visibility keeps history, run links and URLs, so the repo never moves. While private, the free plan gives 2,000 Actions minutes a month (Windows minutes count double) and stops runs instead of charging when no card is on file, so Windows runs are kept to what's needed and image pushes to GHCR are kept minimal (500 MB private package storage). Required reviewers on Environments and GitHub Pages only work once the repo is public, so the staging, prod and Pages steps happen after the switch.
- **Commit identity:** the machine's global git identity is a work email address. This repo uses a repo-local git identity with the owner's GitHub noreply address, set before the first commit, so the work address never appears in public history. *Claude's call.*

## 6. Decided by the owner

- Stay on .NET to match the slide. A Java version was offered and declined.
- The legacy app runs only on GitHub's Windows runners. The owner sees it through what the pipeline captures: reports, screenshots, traces.
- Claude builds everything, designed its own way. Nothing mirrors the owner's work repos.
- Four environments: dev, qa, staging, prod, as at the owner's workplace.
- Free only. No AWS account, no credit card.
- The repo is `ceylan019/dotnet-modernization-quality`. It starts private, and the owner makes it public after reviewing.
- The API is GraphQL in both the old and new apps, matching what the owner tests day to day.
- The owner is the approver at three points, and the builder waits for each one:
  1. The test strategy and risk register, before the conversion runs.
  2. Any change to the recorded legacy baselines, and any accepted difference between old and new.
  3. The go/no-go decision and the prod approval for each release.
- Adopt several quality practices from the owner's personal website project (the owner's own work, not the employer's): a traceability gate, verifying that the released artifact is the tested one, mutation testing of gate logic, security and extended accessibility checks, Lighthouse budgets, and decision records. Visual regression, a cross-browser matrix and a no-JavaScript check stay optional. These are adapted ideas; the stack here is different.

## 7. The design

### 7.1 The legacy app ("before")

*Claude's call:* a fictional city's permit application system. It fits the public sector theme of the symposium. It's small: about four pages, five API endpoints, six tables and four stored procedures.

Stack. *Claude's call:* .NET Framework 4.8 rather than 3.5, since 4.8 is where most real legacy apps sit today and the slide says "3.5+".

- ASP.NET Web Forms UI: ASPX pages with code-behind, ViewState, postbacks, GridView.
- Business logic layer as a class library.
- Data access layer using ADO.NET to call stored procedures.
- A GraphQL API in the same app, "used by partner systems", built with a GraphQL.NET version from the .NET Framework era. This gives the contract tests something real to hold, and echoes the owner's "endpoints wired wrong" experience.
- SQL Server database with schema, stored procedures and synthetic seed data.

Pages: application search and list, application detail, new application form with a fee preview, staff review (change status).

API operations (GraphQL queries and mutations): search applications, get one by reference number, submit an application, change status, get a fee quote. The builder finalizes the exact schema.

Business rules, each chosen because it's a known way for this migration to break quietly. The builder picks the final set, but it must include at least these:

| Rule | Why it's a migration hazard |
|---|---|
| Fee = base fee by permit type + rate per square metre, discounts for seniors and non-profits, 13% HST, rounded to cents | SQL Server `ROUND` rounds halves away from zero, while .NET `Math.Round` rounds halves to even by default. `money` vs `numeric` types. |
| Review due date = submission date + N business days, skipping weekends and statutory holidays from a holidays table, in the America/Toronto time zone | Server local time vs UTC, `GETDATE()` vs `now()`, daylight saving edges, datetime precision. |
| Applicant name search is partial and ignores case and trailing spaces | SQL Server's default collation ignores case and PostgreSQL's doesn't. SQL Server ignores trailing spaces in `=` comparisons. |
| Some lists rely on the order the UI "always" showed, with no explicit ORDER BY | SQL Server tends to return clustered index order. PostgreSQL makes no such promise. |
| Status workflow (Submitted, Under review, Info requested, Approved, Rejected, Expired) with allowed transitions enforced in a stored procedure, and expiry after 180 days | Procedural T-SQL rewritten as PL/pgSQL, including error handling (`RAISERROR`/`THROW` vs `RAISE`). |
| Reference numbers like `PRM-2026-000123` built from an identity column | `IDENTITY` vs sequences, gaps, zero padding and formatting functions. |
| GraphQL schema and responses | The old and new GraphQL libraries have different defaults for field nullability, enum value names, error format, and how dates and decimals are serialized. A client can break quietly even when every query still runs. |
| Output encoding and error pages | Legacy Web Forms apps often write some text into pages unencoded and can show detailed error pages with stack traces. The new app must encode everything and leak nothing, so where the legacy app does either, the fix is recorded as an approved difference, not held to parity. |

Seed data is synthetic only. It's generated with French and English Canadian names (accents such as é and ç), names containing HTML markup, mixed case, trailing spaces, nulls, amounts that land exactly on rounding halves, and dates on weekends, holidays, month ends, leap day and daylight saving changes. There are two sizes: a small set for tests, and a large set (tens of thousands of applications) for the staging migration rehearsal and performance runs.

### 7.2 The modern app ("after")

- .NET 10 (LTS) with a Blazor UI, and a GraphQL API on ASP.NET Core at the same endpoint as the legacy one. *Claude's call:* the conversion brief names Hot Chocolate as the target GraphQL library, the way a modernization tool targets the mainstream modern option.
- PostgreSQL, with the stored procedures converted to PL/pgSQL functions. Business logic stays where the legacy app had it, which is the path the slide shows ("converted schema and stored procedures").
- A Linux container image run with Docker Compose, standing in for ECS/EC2 Linux. PostgreSQL in a container stands in for Aurora PostgreSQL, which is PostgreSQL compatible.
- xUnit unit tests for the business logic layer.
- *Claude's call:* Blazor with static server rendering, adding interactivity only where it's needed (the fee preview). This keeps UI tests stable. The builder may adjust.

### 7.3 The conversion (stand-in for AWS Transform)

This is the backbone of the story, so the process matters more than the tooling. The conversion runs in a separate agent session, which simulates a tool like AWS Transform that knows nothing about your quality plan. The rules below are fixed before it runs, and it runs **once**. Re-running it under new rules after seeing the first result would be fishing for a better story. *Claude's call* on these rules.

**What the conversion session sees:** the legacy app source (UI, business logic, data access, API), the database schema and stored procedures, and a short brief. The brief names the target stack and the deployment contract the pipeline expects: where the Dockerfile lives, the port, and the configuration variables. That's roughly what AWS Transform and its schema conversion get.

**What it doesn't see:** the seed data and its generator (their edge cases point straight at the hazards), the tests, the baselines, the quality documents, and this design document.

**What it may do:**

1. Write its own requirements, design and tasks documents from the legacy code before converting, in Kiro's spec-driven style.
2. Compile its output, start the app, and write and run its own unit tests, the way AWS Transform validates its builds. It can't run the parity or quality suites.
3. Produce the SQL Server to PostgreSQL data migration script from the schema.

**How it lands:**

1. As one pull request, with clearly labeled commits per layer: schema and procedures, data access, business logic, API, UI, data migration. The output is committed as is.
2. The pipeline's dev and qa stages run on that pull request. Their failing runs are the evidence. Each failure is triaged into the defect log with what broke, which test caught it, which environment caught it, the root cause, a link to the failing run, and the fix commit.
3. Fixes land as separate commits on the same pull request, each referencing its defect ID, until the gates go green.

If the conversion doesn't even build, that's recorded as is, and the owner decides what happens next.

### 7.4 The quality layer

**Documents.** Everything except the outcome records is written before conversion starts.

- Test strategy
- Risk register: each risk with likelihood, impact, how it would be detected, the tests that cover it, and status
- Release plan: environments, gates, go/no-go criteria, cutover steps
- Rollback runbook
- Go/no-go record for each release
- Defect log
- Post-release report
- Decision records: one short file per key call (for example the blind conversion, recorded baselines, the point of no return), each with the decision, why, and consequences
- A walkthrough the owner can use to explain the repo in an interview

**Test framework.** TypeScript and Playwright. *Claude's call* on the tools (chosen because the owner already knows them) and on the structure.

- **One test, two apps.** Each page and each API gets an app driver interface with two implementations, one for Web Forms and one for Blazor. Tests are written once against the interface and run against either app. Parity means same behavior, not same HTML.
- **Characterization and parity with recorded baselines.** On the Windows runner, the parity suite runs against the legacy app and records normalized outputs as baseline files: API responses, values shown on pages, database state after actions, and fee and date calculations across the seed data. Baselines are committed and reviewed like code. The modern app is compared against the committed baselines on Linux and on the Mac, so day to day work never waits on Windows. A separate, manually triggered workflow re-records the baselines when the legacy app changes. Intentional differences (for example, a legacy bug that's deliberately fixed) go in an approved differences list with a reason.
- **API contract tests:** the old and new GraphQL schemas are compared through introspection, and any breaking change fails the gate unless it's an approved difference. Response shapes, error formats and HTTP status codes are checked for each operation.
- **Traceability gate.** Every risk in the risk register has an ID, and every test carries the IDs of the risks it covers as tags. The gate fails if any risk has no passing test, a tag names an unknown risk, or a test has no tag. A check only counts if it examined a non-empty, expected set: a parity run that compared zero operations, or a migration check that saw zero rows, is a failure, not a pass. The gate's own logic is unit tested and mutation tested.
- **Accessibility:** axe scans on every page of both apps. The gate is zero serious or critical WCAG 2.1 AA violations in the modern app, and no page worse than its legacy counterpart. Beyond axe: keyboard tab order and visible focus, landmarks and unique link names, and no sideways scrolling at 375px wide. Legacy results are recorded so the improvement is visible.
- **Security:** names with HTML markup in the seed data must render as plain text in the modern app. Error pages show no stack traces or internals. The modern app sends security headers. GraphQL introspection is on in dev and qa (the contract tests need it) and off in prod, which the prod smoke test checks. Every page loads with no console errors.
- **Mutation testing.** Stryker mutates the test framework's own critical logic (parity normalizers, the diff, the traceability gate), because a normalizer that forgives too much makes parity tests pass while proving nothing. Stryker.NET mutates the modern app's fee and deadline rules. Both have a break threshold the builder sets.
- **Lighthouse:** run on the main pages of both apps (the legacy run happens in the Windows baseline workflow). The modern app has budgets as a gate, and the old and new scores form a before/after table in the README.
- **Data migration validation:** row counts per table, column-level checksums or aggregates, a full comparison of the tricky records, constraint and foreign key checks, and the migration run time (used to estimate a cutover window).
- **Performance:** a k6 load test against the modern app on the key journeys, with fixed thresholds for p95 latency and error rate. Legacy numbers are recorded for reference only, because Windows and Linux runners aren't comparable.
- **API collection:** a Bruno collection for exploratory API testing, also runnable in CI.
- **Tags:** `@smoke`, `@regression`, `@api`, `@parity`, `@a11y`, `@data`.
- **Reporting:** Allure published to GitHub Pages with history, plus Playwright traces and screenshots as run artifacts.

### 7.5 Pipeline and environments

GitHub Actions. The image is built once and promoted: the image built in the build stage is exactly the image every later environment tests and the prod stage releases, identified by digest.

| Stage | Runs on | What happens | Gate to move on |
|---|---|---|---|
| build | Linux | Compile, unit tests, lint, build the image, push it to GHCR tagged with the commit SHA | All green |
| dev | Linux | Start the image with PostgreSQL (small seed) via Compose, then run smoke and API contract tests | All green |
| qa | Linux | Full regression (UI and API), parity against the committed legacy baselines, accessibility, security, Lighthouse, mutation testing, traceability gate | Zero unapproved parity diffs, accessibility and Lighthouse budgets met, mutation thresholds met, every risk covered by a passing test, regression green |
| staging | Linux | Production-like rehearsal: load SQL Server with the large seed, run the data migration, validate it, then run smoke and k6 against the migrated data | Migration validation green, performance thresholds met, migration time recorded |
| prod | Linux | Waits for the owner's approval (a required reviewer on the GitHub Environment). Then it verifies the image digest is exactly the one qa and staging tested and refuses otherwise, tags the image with a version, creates a GitHub Release with the notes and the go/no-go record, and runs smoke against the released image | Owner approves, digest matches |
| post-release monitor (scheduled, nightly) | Linux | Pulls the current released image, runs smoke, and opens or updates a GitHub issue if it fails. This stands in for the slide's "Stay modern" column, alongside Dependabot | Not a gate; failures become issues |
| legacy baseline (separate, manual) | Windows | Build and run the legacy app with SQL Server, run the parity suite in record mode plus the legacy accessibility and Lighthouse runs, open a PR with the updated baselines | Owner reviews and merges (approval point 2) |

Each environment is ephemeral and exists only during its pipeline stage. Configuration differs by environment through env files and GitHub Environment secrets. No secrets are ever committed.

**Release sequence and rollback.** *Claude's call.*

- The first trip through prod is a release candidate, `v1.0.0-rc.1`, followed by `v1.0.0`.
- The rollback drill rolls prod back from `v1.0.0` to `v1.0.0-rc.1` by re-promoting the earlier image, runs smoke, then rolls forward again. It's labeled as a drill everywhere.
- The runbook also covers data, which is the hard part of a database migration. It defines a **point of no return**. Before PostgreSQL accepts its first write, rollback means sending users back to the legacy app on SQL Server, which stays untouched and read-only during cutover. After that point the plan is to fix forward, because data written to PostgreSQL would otherwise be lost. The go/no-go record states which side of that line the release is on.
- The legacy fallback is documented but not drilled, since there's no real traffic.

### 7.6 README and public evidence

- The story: inspired by LAB200 at the symposium, done entirely with free tools, with no AWS account, Kiro or AWS Transform involved.
- A before/after diagram that mirrors the slide and shows the free stand-ins.
- "AI migrates, QE proves it's safe": a table of the defects the tests caught, linking to the defect log and the fix commits.
- A pipeline diagram, a link to the live Allure report, and a link to the v1.0.0 release with its go/no-go record.
- Who did what: Claude Code wrote the apps, the conversion, the test code and first drafts of the documents, directed by the owner. The owner reviewed the quality documents and approved the release.
- How to run it locally on a Mac.

## 8. Order of work

1. **Spike (gate for the whole design):** prove that a Web Forms app with a GraphQL.NET endpoint on .NET Framework 4.8, with SQL Server, builds and runs on a GitHub Actions Windows runner, and that Playwright can drive both the pages and the GraphQL endpoint there. If this can't be made to work reliably, stop and bring it back to the owner before building anything else.
2. Legacy app, database and seed data generator.
3. Test strategy and risk register, before any conversion. **Owner approval point 1.**
4. Test framework, characterization tests, and recorded legacy baselines.
5. Pipeline build, dev and qa stages, with Allure on GitHub Pages. They're proven against a placeholder app so the mechanics work before the real conversion arrives. This has to come before step 6 so that the qa stage, not a local run, is what catches the conversion's defects.
6. The blind conversion (7.3) lands as a pull request. Dev and qa run on it, defects get logged, and fixes land on the same pull request. **Owner approval point 2** for any accepted difference.
7. Staging and prod stages, the rollback runbook, and the `v1.0.0-rc.1` release. **Owner approval point 3.**
8. Release `v1.0.0` through prod with its go/no-go record, the rollback drill, the post-release report, the README and the walkthrough. **Owner approval point 3.**

## 9. Left to the builder

- The exact GraphQL schema, table columns and the final list of business rules, keeping the hazards in 7.1.
- Which GraphQL.NET version the legacy app uses, as long as it plausibly belongs to the .NET Framework era and runs reliably.
- Windows runner details: image version, IIS Express vs IIS, LocalDB vs SQL Server Express.
- Blazor render mode details, and EF Core vs Dapper for the modern data access.
- The data migration tool (pgloader or a script).
- Folder layout of the repo and the test framework, and where the conversion spec documents live.
- Seed data sizes.
- Allure history mechanics on GitHub Pages.
- Mutation thresholds, Lighthouse budgets, and which security headers are required.
- Optional extras, only once the core is done: visual regression of the modern app on fixed data (run inside the official Playwright container, with baselines generated only by a workflow, never on a laptop), a cross-browser and device matrix for the modern app, and a check that read-only pages work without JavaScript.

The builder stops and asks the owner if:

- it reaches one of the three owner approval points in section 6;
- the spike fails;
- any step would need payment, or an account that asks for a card;
- the conversion comes out so clean that no tests fail. In that case, discuss honestly how to present it rather than inventing failures.
