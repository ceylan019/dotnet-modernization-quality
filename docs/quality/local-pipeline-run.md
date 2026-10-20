# Local equivalent of the pipeline run

This page records a run of the GitHub pipeline (`.github/workflows/pipeline.yml`) on a laptop, against the placeholder modern app, on 2026-10-20.

## Why this exists

The repository has no GitHub remote yet, so the workflow has never run on a hosted runner. There is a second reason. Promotion in the workflow is strict: `qa` needs `dev`, and while the placeholder answers 501 for every route except `/healthz`, `dev` is red by design. On GitHub the `qa` job would therefore be skipped and nobody would see how the quality gate behaves against an app that is not converted. This run executes the same steps by hand, including `qa`, to show that the gate fails closed.

## Setup

Shell: `export PATH="$HOME/.dotnet:$PATH"; source ~/.nvm/nvm.sh && nvm use 22`. Docker Desktop running. Everything below ran from the repository root unless a directory is named.

Scratch locations (outside the repository, nothing copied into `tests/baselines`):

- evidence directory: a scratch folder, passed to the gate with `--evidence`
- legacy baselines: a scratch folder recorded the same evening from the Mono preview of the legacy app, passed with `BASELINES_DIR`

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
| `test:unit` | 18 files, 352 tests, all passed |
| `test:mutation` | score 97.60 (threshold 85): 1050 killed, 6 timeout, 22 survived, 4 no coverage, 1082 examined |
| mutation evidence | `mutation-score` evidence written, `passed: true`, covers RISK-TEST-01 |
| image ID | `sha256:399adcecd3ba2497e6da49cf18afaeecd7147c82a2fcf46a1291894351d116b9` before the save, identical after `docker load` |

The workflow runs the digest check in the `dev` and `qa` jobs after downloading the artifact. Here it was done once, right after the load, which is the same comparison.

## Dev stage

```bash
export POSTGRES_PASSWORD="Ci$(openssl rand -hex 16)" APP_IMAGE=permits-modern:local
docker compose up -d --no-build app postgres
until curl --silent --fail http://localhost:8080/healthz; do sleep 2; done
cd tests
export TARGET=modern BASE_URL=http://localhost:8080 TEST_STAGE=dev
npx playwright test --grep @smoke
npx playwright test specs/api/contract.spec.ts
```

The app answered `/healthz` within about four seconds. Both Playwright invocations ran and both exited 1, as expected.

| Invocation | Passed | Failed |
|---|---|---|
| `--grep @smoke` | 1 | 2 |
| `specs/api/contract.spec.ts` | 0 | 4 |

- Passed: `health endpoint answers 200`.
- Failed, smoke: `home page answers 200` and `permitTypes is not empty`. The placeholder answers 501 with `{"error":"not converted yet"}`.
- Failed, contract: the schema checks (`schema has no unapproved breaking changes`, `every operation document validates against the live schema`) got HTTP 501 where they expect data. The two error shape checks (`a query selecting an unknown field`, `a request body that is not JSON`) failed with `No legacy baseline for graphql-errors/...`. The workflow sets no `BASELINES_DIR`, and `tests/baselines` is not committed in this checkout, so those two fail on a missing baseline rather than on the 501. On a runner the committed official baselines would be found, and they would fail on the 501 instead.

## qa stage (run on purpose, CI would skip it)

```bash
export TARGET=modern PARITY_MODE=compare TEST_STAGE=qa BASE_URL=http://localhost:8080
export BASELINES_DIR=<scratch>/baselines-11b
cd tests
npx playwright test specs/
npx tsx src/gate/gate-cli.ts --stage qa --playwright reports/playwright.json --evidence <scratch evidence dir>
```

The stack from the dev stage was still up. `baselines-11b` holds the full set (API, search, workflow, UI, accessibility and security cases); `baselines-11a` is a subset of it, so it was not needed.

Playwright: 1180 tests, 1 passed (the health endpoint), 1179 failed, in 6.6 minutes. Exit 1. No test crashed the tooling; every failure is an assertion or a stated driver error. By cause:

- About 1100 parity failures, each naming real differences against the legacy baseline. A typical one: `due-date/due-deck-2023-12-31, 2 difference(s)`, with `$.data (missing) expected {"dueDate":"2024-01-08"}` and `$.status (changed) expected 200 actual 501`. Application, due date, fee, search and workflow suites all fail this way.
- 47 UI specs fail with `Modern UI driver is written after the conversion (Plan 2)`. That is the driver's deliberate message, not a crash.
- A few API specs fail with `Expected data without errors (HTTP 200), got HTTP 501`.

Gate (exit 1): **FAIL, 1 of 28 risks covered, 27 problems.** The only covered risk is RISK-TEST-01 (check `mutation-score`, from the build stage evidence). The other 27 risks, from RISK-FEE-01 to RISK-PERF-02, are `NOT COVERED`, and the Problems list names each as `uncovered: RISK-...`.

## Teardown

```bash
docker compose --profile modern down --volumes
```

The `app` and `postgres` containers were removed. The `mssql` and `legacy-preview` containers were not touched. The compose network stayed because they still use it.

## What this proves

- The build stage steps work end to end, and the image promotion check works: an image saved to a tar and loaded back keeps the same ID.
- The placeholder container starts, serves `/healthz`, and answers 501 elsewhere, so the dev stage fails for the stated reason and passes the one check it should.
- The gate fails closed against an unconverted app. It lists uncovered risks and exits non-zero, rather than crashing or passing on missing evidence.
- Parity mode compares real responses against recorded legacy baselines and reports readable differences (here, 501 against the expected 200 and data).

## What this does not prove

- Anything on GitHub runners: the workflow syntax is checked with actionlint, but artifact upload and download, caching, the `if:` conditions, masking, the Pages job and the strict `needs` skipping were not exercised.
- Anything against the real .NET Framework runtime. The baselines used here came from the Mono preview test aid, not from the Windows runner. They are not the official baselines, and differences between Mono and the real runtime (for example in rounding, culture or error text) could exist. The official baselines are recorded on Windows.
- Anything about a converted app. Every result above is about the placeholder.
