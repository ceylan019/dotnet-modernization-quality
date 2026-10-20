# 0003: Build the image once and promote it by digest

**Status:** accepted (2026-10-20). The build, dev and qa stages implement it first; prod enforces it once it exists.

## Context

A common way for a release to go wrong is to test one artifact and ship another: a rebuild at release time picks up a new base image or package version, or a tag is moved after testing. Every gate before prod is only worth something if prod ships exactly what those gates saw.

## Decision

- The build stage builds the modern image once. Its digest is a build output and identifies the artifact from then on.
- dev, qa and staging each load that image and check its digest against the build output before running anything.
- The prod job compares the digest it is about to tag with the digest that qa and staging tested and refuses to tag or release on a mismatch.
- A release tags the existing digest with its version; it never rebuilds. Rollback re-promotes an earlier digest; it never rebuilds either.
- The digest is written into the go/no-go record and the GitHub Release.

## Consequences

- RISK-REL-01 is covered by a hard check rather than by process.
- A change of any kind, even a rebuild of the same commit, means a new artifact that starts again at build.
- While the repository is private, the image moves between stages as a workflow artifact rather than through the registry, to stay inside the 500 MB of free private package storage. The digest check is the same either way.
