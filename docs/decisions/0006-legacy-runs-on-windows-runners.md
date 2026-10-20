# 0006: The legacy app runs on GitHub's Windows runners

**Status:** proposed. The recipe below is written and lint clean but **unproven until the first Windows run** of `.github/workflows/legacy.yml`. The GitHub repository did not exist when it was written, so no Windows run has happened yet. Timings and any recipe changes get recorded here after the first green run.

## Context

The legacy app is ASP.NET Web Forms on .NET Framework 4.8 with a GraphQL.NET 2.4 endpoint. It runs only on Windows, and the owner chose not to run a Windows VM, so it runs on the `windows-2022` runner. Windows runners cannot run Linux containers, so SQL Server has to be installed natively there. The test tooling uses the Node `mssql` driver, which needs TCP, so LocalDB is ruled out: the database is always `localhost,1433` with SQL authentication as `sa`, on the Mac (Docker) and on the runner alike.

## Decision

The `legacy` job in `.github/workflows/legacy.yml` runs on `windows-2022`. It starts on pushes that touch `legacy/**` or the workflow itself (test-only changes never start a Windows run), or on dispatch with `mode` set to `smoke` or `record`:

```
gh workflow run legacy.yml --ref foundation -f mode=smoke
```

Steps, in order:

1. Generate an `sa` password for the run and mask it in the log.
2. Install SQL Server 2022 Developer with `potatoqualitee/mssqlsuite@v1.12` (`install: sqlengine`, `version: 2022`). It installs the default instance with TCP enabled on 1433, turns on SQL authentication and sets the `sa` password. A wait step then polls `localhost,1433` for up to 120 seconds.
3. Install Node from `.nvmrc`, run `npm ci` and `npx playwright install chromium` in `tests/`.
4. Reset the database: `npx tsx src/db/reset-legacy-db.ts --seed none` drops and recreates `Permits` and runs `legacy/db/*.sql` in name order.
5. Build: `dotnet build legacy/Permits.Legacy.sln -c Release` with the SDK already on the image. The projects are SDK style and get the .NET Framework 4.8 reference assemblies from NuGet, so no targeting pack is needed.
6. Write the connection string and `FixedToday` (`2026-10-15`) into `legacy/src/Permits.Web/web.config` of the runner's working copy with PowerShell. The committed file keeps a password-free default.
7. Start IIS Express in the background: `iisexpress.exe /path:<workspace>\legacy\src\Permits.Web /port:8080 /clr:v4.0`.
8. Wait up to 90 seconds for HTTP 200 on `/Default.aspx` (the first request compiles the pages).
9. Run Playwright with `TARGET=legacy` and `BASE_URL=http://localhost:8080` (`npm run test:smoke`).
10. Always upload `tests/playwright-report` and `tests/test-results`. On failure, print the IIS Express output.

## Fallbacks, in the order to try

- **SQL Server install fails:** change `SQL_INSTALL` at the top of the job to `chocolatey`. That step installs `sql-server-express`, then enables SQL logins (`LoginMode = 2`), pins TCP to port 1433 in the registry, restarts the service and enables `sa`.
- **`dotnet build` cannot build net48 on the runner:** add `microsoft/setup-msbuild` and run `msbuild legacy\Permits.Legacy.sln /restore /p:Configuration=Release`.
- **IIS Express missing or failing:** enable full IIS (`Install-WindowsFeature Web-Server,Web-Asp-Net45`) and create a site on port 8080 whose physical path is `legacy\src\Permits.Web`.
- **IIS Express start step hangs:** drop the output redirection from `Start-Process` so no handle is shared with the step.
- **Assembly binding failures:** add `bindingRedirect` entries to `web.config`. One for `Newtonsoft.Json` is already there because GraphQL.NET 2.4.0 references version 10.0.0.0 and the app ships 13.0.3.
- **Stop rule:** if 10 Windows runs have not produced a green spike, stop the plan and take the failing logs to the owner.

## What is proven so far

On the Mac (2026-10-20):

- `dotnet build legacy/Permits.Legacy.sln -c Release` succeeds and `legacy/src/Permits.Web/bin/` holds the app and its dependencies.
- The reset script builds the database on SQL Server 2022 in Docker (`docker compose --profile legacy-db up -d mssql`).
- `actionlint` reports nothing for the workflow.
- Both spike tests pass against the local Mono preview described below.

Not proven: everything that happens only on Windows. That is the `mssqlsuite` install on the current runner image, the IIS Express path and its background start, the PowerShell edit of `web.config`, the .NET Framework runtime itself, and all timings.

## Local Mono preview (a test aid, not a substitute)

`tools/mono-preview/` runs the built `legacy/src/Permits.Web` folder on Mono 6.12 with `xsp4`, against the Docker SQL Server:

```
dotnet build legacy/Permits.Legacy.sln -c Release
docker compose --profile legacy-db up -d --wait mssql
(cd tests && npm run db:legacy:reset -- --seed none)
docker compose --profile legacy-preview up -d --wait --build legacy-preview
(cd tests && BASE_URL=http://localhost:8081 TARGET=legacy npm run test:smoke)
```

The container copies the folder, writes the connection string and `FixedToday` into the copy of `web.config`, and serves it on port 8081. Mono renders Web Forms client IDs with automatic segments (`ctl00_MainContent_...`) that .NET Framework 4.x leaves out in Predictable mode, so the preview adds an HTTP module that strips them from HTML responses. The image runs natively (arm64 on Apple Silicon) because the amd64 Mono image crashes under emulation.

Mono is not .NET Framework. Culture data, error pages, `SqlClient` behavior and Web Forms rendering can differ, so a green preview never replaces the Windows run, and baselines are never recorded from it.

## Consequences

- Windows minutes count double against the private repository's allowance, so the push trigger is limited to legacy paths and runs are batched.
- Recorded legacy baselines come only from this job, never from the Mac or the preview.
- The first push of `foundation` is the real test of this recipe, and this record gets updated with what actually worked.
