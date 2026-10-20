# Approval point 1: the foundation pull request

The repository is still local, so the pull request for approval point 1 could not be opened from here. This file holds what the owner needs to open it: a checklist for the push and the Windows runs, then the pull request title and body.

Written on 2026-10-20 by Claude Code for the owner. Every command runs from the repository root.

## Before you push

1. **Clean the working tree.** Two untracked leftovers from tonight's local runs must not reach the repository.

   ```sh
   git switch foundation
   rm legacy/src/Permits.Web/eb.config     # empty stray file
   rm -r tests/baselines                   # one stray case file from a local run; official baselines come only from Windows
   git status --short                      # expect no output
   git log --all --format='%an <%ae>' | sort -u   # expect only the GitHub noreply address
   ```

2. **Create the private repository from `main`, then push `foundation`.** `main` holds only the bootstrap commit, with stub workflows: GitHub dispatches a workflow by hand only when it exists on the default branch.

   ```sh
   git switch main
   gh repo create ceylan019/dotnet-modernization-quality --private --source . --push
   git switch foundation
   git push -u origin foundation
   ```

3. **Run `legacy.yml` in smoke mode first.** This run proves the Windows recipe for the legacy app, which nothing has proven yet ([decision 0006](../decisions/0006-legacy-runs-on-windows-runners.md)). The push of `foundation` should start it by itself, because the branch changes `legacy/**`, and a push run is a smoke run. Check with `gh run list --workflow legacy.yml`. If no run started:

   ```sh
   gh workflow run legacy.yml --ref foundation -f mode=smoke
   gh run watch
   ```

   If it fails, read the `legacy-playwright` artifact and the IIS Express output in the log, then try the fallbacks in decision 0006 in their order. Stop after 10 failed runs and take the logs back to a planning session. Windows minutes count double against the 2,000 free private minutes, so batch fixes rather than pushing them one by one (every push that touches `legacy/**` starts a Windows run). When the run is green, record in decision 0006 what worked, what changed and how long it took, and set its status to accepted.

4. **Then run record mode.** Only after smoke is green.

   ```sh
   gh workflow run legacy.yml --ref foundation -f mode=record
   gh run watch
   ```

   The job seeds the database, records the suites twice, fails if the two recordings differ in anything but `recordedAt`, checks for at least 400 case files and `schema/introspection.json`, records Lighthouse and k6 reference numbers, and uploads everything as the artifact `legacy-baselines`. Download and check it:

   ```sh
   gh run list --workflow legacy.yml --limit 1                  # the run ID
   gh run download <run-id> --name legacy-baselines --dir tests/baselines/legacy
   find tests/baselines/legacy -name '*.json' | wc -l           # 1,200 or more cases, plus the Lighthouse and k6 summaries
   test -f tests/baselines/legacy/schema/introspection.json && echo ok
   grep -rl '<invalid' tests/baselines/legacy                   # expect no output
   ```

5. **Review and commit the baselines (approval point 2).** They become the yardstick for the conversion. Read at least these before committing:

   | File under `tests/baselines/legacy/` | What to see |
   |---|---|
   | `fee/fee-reno-10.70-none.json` | Fee `175.15`: the half cent rounded away from zero (RISK-FEE-01) |
   | `permit-types/permit-types.json` | Types in the order `DECK, DEMO, EVENT, PATIO, RENO, SIGN` (RISK-ORDER-01) |
   | `search/search-tremblay-all-p1.json` and `search/search-tremblay-upper-all-p1.json` | The same matches for `tremblay` and `TREMBLAY` (RISK-SEARCH-01) |
   | any `application/*-trailing-space.json` | The application is found despite the trailing space (RISK-SEARCH-02) |
   | `graphql-errors/malformed-body.json` | HTTP 400 with the plain text `Invalid request` (RISK-API-02) |
   | `schema/introspection.json` | The schema partner systems rely on (RISK-API-01) |
   | `lighthouse/summary.json`, `perf/summary.json` | Reference numbers for the before and after table, not gates |

   ```sh
   git add tests/baselines/legacy
   git commit -m "test: recorded legacy baselines"
   git push
   ```

   A push that changes only `tests/` does not start a Windows run.

6. **Update what the Windows runs changed.** Decision 0006 (step 3), the status section of the README, and the "Known gaps" list in the pull request body below, so that the body matches the branch.

7. **Open the pull request** with the title and body below. Opening it starts `pipeline.yml`.

   ```sh
   sed -n '/^<!-- pr-body:start -->$/,/^<!-- pr-body:end -->$/p' docs/quality/approval-point-1.md > "$TMPDIR/pr-body.md"
   gh pr create --base main --head foundation \
     --title "Foundation: legacy app, quality plan and test framework (approval point 1)" \
     --body-file "$TMPDIR/pr-body.md"
   ```

8. **Review in the order the body gives, then merge.** The merge is approval point 1.

## The pull request

**Title:** `Foundation: legacy app, quality plan and test framework (approval point 1)`

**Body:**

<!-- pr-body:start -->
## What this pull request is

The foundation of the migration: everything that has to exist before the conversion runs. **Merging it is the owner's approval point 1, and the conversion starts only after the merge.**

It contains:

- the legacy app (.NET Framework 4.8 Web Forms, GraphQL.NET 2.4, ADO.NET, SQL Server scripts), built with deliberate migration hazards;
- deterministic synthetic seed data and its catalog of hazard records;
- the quality documents: test strategy, risk register, release plan, rollback runbook, approved differences, defect log, go/no-go template, decision records, and the conversion brief;
- the TypeScript test framework: page drivers, the parity engine, the traceability gate, the API parity suites, smoke tests, k6 journeys, Lighthouse CI and a Bruno collection;
- the data migration validator;
- the legacy baselines recorded on the Windows runner;
- the pipeline (build, dev, qa) with a placeholder modern app, and the Windows workflow for the legacy app.

## Review in this order

1. **Risk register** (`docs/quality/risk-register.md`, generated from `docs/quality/risks.json`). Is a risk missing? Are likelihood and impact right? Would each detection really catch the failure it names, and is each risk assigned to the right stage?
2. **Test strategy** (`docs/quality/test-strategy.md`). What "safe" means (section 1), what is out of scope and why (section 2, including authentication), entry and exit criteria (section 8), defect handling (section 9) and the known limits (section 13).
3. **Recorded baselines** (`tests/baselines/legacy/`). They come from the Windows record run and become the yardstick for the conversion. Spot check one file per suite: the RENO fee at 10.70 m² is `175.15`, permit types keep their order, `TREMBLAY` finds what `tremblay` finds, a trailing space lookup still finds its application, and the schema is complete. Any later change to them is approval point 2.
4. **Release plan** (`docs/quality/release-plan.md`), with the rollback runbook (`docs/quality/rollback-runbook.md`) and decision 0004 on the point of no return.

Then, more briefly:

5. **Conversion brief** (`docs/conversion/brief.md`). Besides `legacy/`, it is all the conversion agent sees. Check that it gives nothing away about tests, risks or data.
6. **Decision records** (`docs/decisions/`). Decision 0006 records what the first Windows runs showed.

## Decisions this review settles

The documents propose these values. Merging accepts them:

- migration plus validation within 10 minutes for 50,000 applications, which sizes the cutover window (strategy, section 8);
- k6 on the modern app: p95 under 500 ms and under 1% failed requests;
- Lighthouse budgets: performance 0.80, accessibility 0.95, best practices 0.90;
- a mutation score break threshold of 85 for the parity and gate code;
- authentication out of scope, because the legacy app has none (strategy, section 2);
- strict promotion. qa runs only after dev is green, so qa cannot run on GitHub against the placeholder. Section 8 of the strategy asks for build, dev and qa to run end to end against the placeholder before the conversion. Either accept that the first real qa run happens on the conversion pull request, or ask for section 8 to be amended before merging.

## What the checks on this pull request mean

| Check | Expected | Why |
|---|---|---|
| `pipeline / build` | green | Compiles the placeholder, typechecks, lints, runs the unit tests and Stryker (breaks below 85), builds the image once and records its digest |
| `pipeline / dev` | **red** | The placeholder answers `GET /healthz` and returns 501 for everything else, so the smoke tests and the GraphQL contract test fail |
| `pipeline / qa` | skipped | qa needs a green dev. A stage never promotes past a red one |
| `pipeline / pages` | skipped | The report is published only from a public repository, and never from a pull request |
| `legacy` (Windows) | not started here | It runs on pushes that touch `legacy/**` and by hand. The smoke and record runs before this pull request are its evidence |

**The red dev check is expected and is not a reason to hold the merge.** It is the starting line the conversion has to turn green. It must be red only in the step "Smoke and contract tests", with failures that show the 501 answers. A red anywhere else is a pipeline defect to fix before merging: the image load and digest check, the Compose start, the health wait, `npm ci`, or an action version that does not resolve. None of these steps had run on GitHub before this pull request.

qa runs for real for the first time on the conversion pull request. Before that, its gate was run locally over the API suites against a Mono preview of the legacy app, and it refused as designed, listing the qa risks that had no passing test yet. That local run is not evidence for any risk.

## Known gaps at the time of this pull request

- The UI, accessibility and security suites are not written yet.
- The clock check for RISK-DATE-02 and Stryker.NET on the modern fee and due date rules need the converted app.
- Lighthouse in the qa stage, and the staging, prod and nightly monitor stages, come after the conversion.
- The data migration validator has been tested on scratch tables only. Its real mapping is written once the converted schema exists.

## Approval

**Merging this pull request is approval point 1.** It means the owner accepts the test strategy, the risk register, the recorded baselines and the pipeline dry run as the yardstick the conversion will be judged by. Claude Code never merges it.

**The conversion starts only after the merge.** It runs once, in a separate session that sees only `legacy/` and the conversion brief (decision 0001). Its output arrives as its own pull request, where dev and qa catch what they catch and every failure goes into the defect log.

To change anything first, request changes here. Changing the register or the strategy after the conversion has run would mean judging the result by a new standard.
<!-- pr-body:end -->
