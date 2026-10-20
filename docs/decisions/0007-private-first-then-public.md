# 0007: The repository starts private, then goes public

**Status:** accepted (2026-10-20). Current state: the repository exists only on the owner's machine. Creating it on GitHub is the owner's step.

## Context

This is a public portfolio piece, but the owner wants to review everything before anyone else can see it. GitHub keeps history, run links and URLs when a repository changes visibility, so starting private costs nothing in the final result. The free plan does treat private repositories differently: 2,000 Actions minutes a month with Windows minutes counted double, runs stopped rather than charged when no card is on file, 500 MB of private package storage, and no required reviewers on Environments and no GitHub Pages for private repositories.

## Decision

- The owner creates `ceylan019/dotnet-modernization-quality` as a **private** repository and pushes the local history.
- The owner reviews it, then switches it to **public**. The builder never changes visibility.
- Everything committed must already be fit to publish: synthetic data only, no secrets (local passwords live in a gitignored `.env`, CI passwords are generated per run), no content from any employer, and a repo-local git identity using the owner's GitHub noreply address.
- While private, Windows runs are kept to what is needed (the legacy workflow starts only on changes under `legacy/` or by hand), and images go to the registry only at release time.
- The steps that need a public repository wait for the switch: required reviewers on the staging and prod Environments, and the Allure report on GitHub Pages.

## Consequences

- No Windows run has happened yet. The legacy recipe ([0006](0006-legacy-runs-on-windows-runners.md)) is unproven, and no legacy baseline exists until the first recording run after the push.
- Approval point 1 happens on the private repository through a pull request. Approval point 3 (the prod approval) needs the public repository.
- A local Mono preview of the legacy app lets the drivers and suites be exercised before the first Windows run, but it never produces evidence or baselines.
