# 0006: The legacy app runs on GitHub's Windows runners

**Status:** proposed. The recipe below is written and lint clean but **unproven until the first Windows run** of `.github/workflows/legacy.yml`. The GitHub repository did not exist when it was written, so no Windows run has happened yet. Timings and any recipe changes get recorded here after the first green run.

## Context

The legacy app is ASP.NET Web Forms on .NET Framework 4.8 with a GraphQL.NET 2.4 endpoint. It runs only on Windows, and the owner chose not to run a Windows VM, so it runs on the `windows-2022` runner. Windows runners cannot run Linux containers, so SQL Server has to be installed natively there. The test tooling uses the Node `mssql` driver, which needs TCP, so LocalDB is ruled out: the database is always `localhost,1433` with SQL authentication as `sa`, on the Mac (Docker) and on the runner alike.

## Decision

The `legacy` job in `.github/workflows/legacy.yml` runs on `windows-2022`. It starts on pushes that touch `legacy/**` or the workflow itself (test-only changes never start a Windows run), which run in smoke mode, or on dispatch with `mode` set to `smoke` or `record`:

```
gh workflow run legacy.yml --ref foundation -f mode=smoke
```

Steps, in order:

1. Generate an `sa` password for the run and mask it in the log.
2. Install SQL Server 2022 Developer with `potatoqualitee/mssqlsuite@v1.12` (`install: sqlengine`, `version: 2022`). It installs the default instance with TCP enabled on 1433, turns on SQL authentication and sets the `sa` password. A wait step then polls `localhost,1433` for up to 120 seconds.
3. Install Node from `.nvmrc`, run `npm ci` and `npx playwright install chromium` in `tests/`.
4. Reset the database: `npx tsx src/db/reset-legacy-db.ts --seed small` drops and recreates `Permits`, runs `legacy/db/*.sql` in name order and loads the small seed. The smoke specs open seeded applications picked from the catalog, so they need it.
5. Build: `dotnet build legacy/Permits.Legacy.sln -c Release` with the SDK already on the image. The projects are SDK style and get the .NET Framework 4.8 reference assemblies from NuGet, so no targeting pack is needed.
6. Write the connection string and `FixedToday` (`2026-10-15`) into `legacy/src/Permits.Web/web.config` of the runner's working copy with PowerShell. The committed file keeps a password-free default.
7. Start IIS Express in the background: `iisexpress.exe /path:<workspace>\legacy\src\Permits.Web /port:8080 /clr:v4.0`. It runs inside `cmd /c`, started hidden with `Start-Process`, so it has a console of its own; `cmd` redirects its output to log files in `RUNNER_TEMP`.
8. Wait up to 90 seconds for HTTP 200 on `/Default.aspx` (the first request compiles the pages). The wait fails at once if no `iisexpress` process is running.
9. Smoke mode: run Playwright with `TARGET=legacy` and `BASE_URL=http://localhost:8080`: `npx playwright test --project read-only --project legacy-smoke --grep @smoke`. That is the shared smoke spec plus the Web Forms checks in `tests/specs-legacy/`. The `legacy-smoke` project exists only with `TARGET=legacy`, and naming it fails the step if it ever goes missing.
10. Record mode, instead of step 9: empty `tests/baselines/legacy`, then twice reset the database with the small seed, warm up the app and record `specs/api specs/ui specs/a11y specs/security` (the second pass into a temporary folder). The two passes may differ only in `recordedAt`. The job then checks for at least 400 case files and `schema/introspection.json`, records Lighthouse and k6 reference numbers (a k6 threshold breach, exit code 99, does not fail the job; any other failure or a missing summary does) and uploads everything as the artifact `legacy-baselines`.
11. Always upload `tests/playwright-report` and `tests/test-results`. On failure, print the IIS Express output.

## Fallbacks, in the order to try

- **SQL Server install fails:** change `SQL_INSTALL` at the top of the job to `chocolatey`. That step installs `sql-server-express`, then enables SQL logins (`LoginMode = 2`), pins TCP to port 1433 in the registry, restarts the service and enables `sa`.
- **`dotnet build` cannot build net48 on the runner:** add `microsoft/setup-msbuild` and run `msbuild legacy\Permits.Legacy.sln /restore /p:Configuration=Release`.
- **IIS Express missing or failing:** enable full IIS (`Install-WindowsFeature Web-Server,Web-Asp-Net45`) and create a site on port 8080 whose physical path is `legacy\src\Permits.Web`.
- **IIS Express start step hangs, or IIS Express exits after it:** make sure `Start-Process` itself redirects nothing, so IIS Express shares no handle with the step. Run 1 hit the second case (see below).
- **Assembly binding failures:** add `bindingRedirect` entries to `web.config`. One for `Newtonsoft.Json` is already there because GraphQL.NET 2.4.0 references version 10.0.0.0 and the app ships 13.0.3.
- **Stop rule:** if 10 Windows runs have not produced a green smoke run, stop the plan and take the failing logs to the owner.

## What is proven so far

On the Mac (2026-10-20):

- `dotnet build legacy/Permits.Legacy.sln -c Release` succeeds and `legacy/src/Permits.Web/bin/` holds the app and its dependencies.
- The reset script builds the database on SQL Server 2022 in Docker (`docker compose --profile legacy-db up -d mssql`).
- `actionlint` reports nothing for the workflow.
- The smoke step of the workflow passes against the local Mono preview described below, after a reset with the small seed: 15 passed, and 1 skipped (the health endpoint, which only the modern app has). After a reset without the seed, 5 of the legacy smoke checks fail, which is why step 4 loads it.

On Windows, run 1 (2026-10-20, run 39504694974, smoke mode from the push, 6 min 40 s in all):

- Worked: the `mssqlsuite` install (3 min 27 s) and the TCP 1433 wait (4 s), `npm ci` with Chromium (40 s), the reset with the small seed (4 s), `dotnet build` with 0 warnings and 0 errors (23 s), and the PowerShell edit of `web.config` (1 s).
- Failed: IIS Express, started by `Start-Process` with its output redirected to files, printed `Registration completed` and `IIS Express is running` for port 8080. Every request in the wait step was then refused ("No connection could be made because the target machine actively refused it"), its log shows no request at all, and the job's orphan process cleanup did not find it while it did find `dotnet` from the build step. So IIS Express exited between the two steps, most likely because the handles it shared with the start step closed when that step ended. Step 7 now starts it through `cmd` in a console of its own, and step 8 checks that the process is alive, so a repeat shows up as "IIS Express is not running" instead of 90 seconds of refused connections.

Not proven yet: the IIS Express start above, the `web.config` edit taking effect, the .NET Framework runtime itself, and the smoke and record steps.

## Local Mono preview (a test aid, not a substitute)

`tools/mono-preview/` runs the built `legacy/src/Permits.Web` folder on Mono 6.12 with `xsp4`, against the Docker SQL Server:

```
dotnet build legacy/Permits.Legacy.sln -c Release
docker compose --profile legacy-db up -d --wait mssql
(cd tests && npm run db:legacy:reset -- --seed small)
docker compose --profile legacy-preview up -d --wait --build legacy-preview
(cd tests && TARGET=legacy BASE_URL=http://localhost:8081 npx playwright test --project read-only --project legacy-smoke --grep @smoke)
```

The container copies the folder, writes the connection string and `FixedToday` into the copy of `web.config`, and serves it on port 8081. Mono renders Web Forms client IDs with automatic segments (`ctl00_MainContent_...`) that .NET Framework 4.x leaves out in Predictable mode, so the preview adds an HTTP module that strips them from HTML responses. The image runs natively (arm64 on Apple Silicon) because the amd64 Mono image crashes under emulation.

Mono is not .NET Framework. Culture data, error pages, `SqlClient` behavior and Web Forms rendering can differ, so a green preview never replaces the Windows run, and baselines are never recorded from it.

## Consequences

- Windows minutes count double against the private repository's allowance, so the push trigger is limited to legacy paths and runs are batched.
- Recorded legacy baselines come only from this job, never from the Mac or the preview.
- The first push of `foundation` is the real test of this recipe, and this record gets updated with what actually worked.
