# Local equivalent of the pipeline run

This page records a run of the GitHub pipeline (`.github/workflows/pipeline.yml`) on a laptop, against the placeholder modern app, on 2026-10-20.

## Why this exists

The repository has no GitHub remote yet, so the workflow has never run on a hosted runner. There is a second reason. Promotion in the workflow is strict: `qa` needs `dev`, and while the placeholder answers 501 for every route except `/healthz`, `dev` is red by design. On GitHub the `qa` job would therefore be skipped and nobody would see how the quality gate behaves against an app that is not converted. This run executes the same steps by hand, including `qa`, to show that the gate fails closed.

## Setup

Shell: `export PATH="$HOME/.dotnet:$PATH"; source ~/.nvm/nvm.sh && nvm use 22`. Docker Desktop running. Each block below starts from the repository root unless it says otherwise.

Prerequisites, once, as the workflow's install steps do:

```bash
cd tests
npm ci
npx playwright install --with-deps chromium
```

Like a runner, the run does not read the repository's `.env`: every `docker compose` call gets `--env-file /dev/null`, and the passwords come from the shell, as the workflow writes them to `GITHUB_ENV`.

Scratch locations, outside the repository (nothing is copied into `tests/baselines`):

- an evidence directory, passed to the gate with `--evidence`;
- a legacy baselines directory, passed with `BASELINES_DIR`. It was recorded from the Mono preview of the legacy app just before this run, as described in the next section.

## Legacy baselines for the qa stage

The official baselines come only from the Windows record run, which has not happened yet. For this run they were recorded from the Mono preview of the legacy app into a new, empty scratch folder, with the small seed loaded before each pass:

```bash
(cd tests && npm run db:legacy:reset -- --seed small)
docker compose --profile legacy-preview restart legacy-preview
cd tests
TARGET=legacy BASE_URL=http://localhost:8081 PARITY_MODE=record BASELINES_DIR=<scratch baselines dir> npx playwright test specs/
```

Result: 1159 passed, 21 skipped, 1264 case files written, none containing `<invalid`.

Then the same suites compared the preview against those files, after another reset and restart. The evidence directory holds the `mutation-score` evidence from the build stage below.

```bash
(cd tests && npm run db:legacy:reset -- --seed small)
docker compose --profile legacy-preview restart legacy-preview
cd tests
TARGET=legacy BASE_URL=http://localhost:8081 BASELINES_DIR=<scratch baselines dir> npx playwright test specs/
npx tsx src/gate/gate-cli.ts --stage qa --playwright reports/playwright.json --evidence <scratch evidence dir>
```

Playwright: 1167 passed, 12 failed, 1 skipped. Every parity test passed. The 12 failures are checks that hold the modern app to absolute accessibility and security bars which the legacy app fails by design (axe violations on the application form, landmarks, reflow at 375 px, unencoded names, leaked exception details, missing security headers).

Gate (exit 1): **FAIL, 20 of 28 risks covered, 20 problems**: 12 `failing-test` (one per failed test and the risk it is tagged with) and 8 `uncovered`. The uncovered risks are RISK-A11Y-01, RISK-A11Y-03, RISK-A11Y-04, RISK-SEC-01, RISK-SEC-02 and RISK-SEC-03 (each has a failing test, so it cannot count as covered even where other tests of it passed), RISK-DATE-02 (its clock check needs the converted app) and RISK-PERF-02 (Lighthouse joins the qa stage after the conversion).

## Build stage

```bash
dotnet build modern/Permits.Modern.sln --configuration Release
dotnet test modern/Permits.Modern.sln --configuration Release --no-build
cd tests
npm run typecheck
npm run lint
npm run test:unit
npm run test:mutation
npx tsx src/gate/mutation-evidence.ts reports/mutation/mutation.json --out <scratch evidence dir>
cd ..
docker build --tag permits-modern:local modern
docker image inspect --format '{{.Id}}' permits-modern:local      # record this
docker save permits-modern:local --output <scratch>/image.tar
docker rmi permits-modern:local
docker load --input <scratch>/image.tar
docker image inspect --format '{{.Id}}' permits-modern:local      # must equal the recorded ID
```

Result: green.

| Step | Result |
|---|---|
| `dotnet build` | succeeded, 0 warnings, 0 errors |
| `dotnet test` | exit 0 (the solution has no test project yet, so nothing runs) |
| `typecheck`, `lint` | clean |
| `test:unit` | 18 files, 384 tests, all passed |
| `test:mutation` | score 98.02 (threshold 85): 1383 killed, 6 timeout, 24 survived, 4 no coverage, 1417 examined. Stryker runs the unit tests only (`vitest.unit.config.ts`), so it needs no database and no `.env` |
| mutation evidence | `mutation-score` evidence written, `passed: true`, examined 1417, names RISK-TEST-01 |
| image ID | `sha256:399adcecd3ba2497e6da49cf18afaeecd7147c82a2fcf46a1291894351d116b9` before the save, identical after `docker load` |

The workflow runs the digest check in the `dev` and `qa` jobs after downloading the artifact. Here it was done once, right after the load, which is the same comparison.

## Dev stage

```bash
export POSTGRES_PASSWORD="Ci$(openssl rand -hex 16)" MSSQL_SA_PASSWORD="Ci$(openssl rand -hex 16)" APP_IMAGE=permits-modern:local
docker compose --env-file /dev/null up -d --no-build app postgres
until curl --silent --fail http://localhost:8080/healthz; do sleep 2; done
cd tests
export TARGET=modern BASE_URL=http://localhost:8080 TEST_STAGE=dev
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/smoke npx playwright test --grep @smoke
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/contract npx playwright test specs/api/contract.spec.ts
```

`MSSQL_SA_PASSWORD` is a throwaway that no service here uses. Compose reads the whole file whatever the profile, and the legacy services require that variable, so the workflow sets it too.

The app answered `/healthz` about 8 seconds after `docker compose up` started. Both Playwright invocations ran and both exited 1, as expected, each into its own report folder (`playwright-report/smoke` and `playwright-report/contract`, the two folders the workflow uploads).

| Invocation | Passed | Failed |
|---|---|---|
| `--grep @smoke` | 1 | 2 |
| `specs/api/contract.spec.ts` | 0 | 4 |

- Passed: `health endpoint answers 200`.
- Failed, smoke: `home page answers 200` and `permitTypes is not empty`. The placeholder answers 501 with `{"error":"not converted yet"}`.
- Failed, contract: the schema checks (`schema has no unapproved breaking changes`, `every operation document validates against the live schema`) got HTTP 501 where they expect data. The two error shape checks (`a query selecting an unknown field`, `a request body that is not JSON`) failed with `No legacy baseline for graphql-errors/...`. The workflow sets no `BASELINES_DIR`, and no baselines are committed yet, so those two fail on a missing baseline rather than on the 501. On a runner the committed official baselines would be found, and they would fail on the 501 instead.

## qa stage (run on purpose, CI would skip it)

The stack from the dev stage was still up, and the shell was still in `tests`.

```bash
export TARGET=modern PARITY_MODE=compare TEST_STAGE=qa BASE_URL=http://localhost:8080
export BASELINES_DIR=<scratch baselines dir>
npx playwright test specs/
npx tsx src/gate/gate-cli.ts --stage qa --playwright reports/playwright.json --evidence <scratch evidence dir>
```

Playwright: 1180 tests, 1 passed (the health endpoint), 1179 failed, in 6.8 minutes. Exit 1. No test crashed the tooling; every failure is an assertion or a stated driver error. By cause:

- 1128 parity failures, each naming real differences against the legacy baseline. A typical one: `due-date/due-deck-2023-12-31, 2 difference(s)`, with `$.data (missing) expected {"dueDate":"2024-01-08"}` and `$.status (changed) expected 200 actual 501`. The application, due date, fee, search, workflow and GraphQL error suites all fail this way.
- 47 UI specs fail with `Modern UI driver is written after the conversion (Plan 2)`. That is the driver's deliberate message, not a crash.
- 2 contract checks fail with `Expected data without errors (HTTP 200), got HTTP 501`, and the 2 smoke checks fail on the 501 as in the dev stage.

Gate (exit 1): **FAIL, 1 of 28 risks covered, 2406 problems**: 2379 `failing-test` (one per failed test and risk it is tagged with) and 27 `uncovered`. The other 27 risks, from RISK-FEE-01 to RISK-PERF-02, are `NOT COVERED`.

The only covered risk is RISK-TEST-01, and it comes from the build stage's mutation evidence (check `mutation-score`), not from any test against the app. It says the test framework's own logic is mutation tested; it says nothing about the placeholder or a converted app.

## Teardown

```bash
docker compose --env-file /dev/null --profile modern down --volumes
```

The `app` and `postgres` containers were removed. The `mssql` and `legacy-preview` containers were not touched. The compose network stayed because they still use it.

## What this proves

- The build stage steps work end to end without a `.env` file, and the image promotion check works: an image saved to a tar and loaded back keeps the same ID.
- The placeholder container starts, serves `/healthz`, and answers 501 elsewhere, so the dev stage fails for the stated reason and passes the one check it should. Each dev invocation keeps its own report.
- The gate fails closed against an unconverted app. It lists every failing test against its risks and every uncovered risk, and exits non-zero, rather than crashing or passing on missing evidence.
- Parity mode compares real responses against recorded legacy baselines and reports readable differences (here, 501 against the expected 200 and data).

## What this does not prove

- Anything on GitHub runners: the workflow syntax is checked with actionlint, but artifact upload and download, caching, the `if:` conditions, masking, the Pages job and the strict `needs` skipping were not exercised.
- Anything against the real .NET Framework runtime. The baselines used here came from the Mono preview test aid, not from the Windows runner. They are not the official baselines, and differences between Mono and the real runtime (for example in rounding, culture or error text) could exist. The official baselines are recorded on Windows.
- Anything about a converted app. Every result above is about the placeholder.
