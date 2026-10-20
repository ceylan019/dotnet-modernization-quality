# Approved differences

Parity tests hold the modern app to what the legacy app recorded. Sometimes the modern app should differ: a legacy flaw that the migration fixes on purpose, or a library convention that cannot be kept without harm. An approved difference is how such a case passes the gate without loosening the test for everything else. The owner approves every entry (approval point 2); the builder can only propose one.

The list lives in [`tests/approved-differences.json`](../../tests/approved-differences.json). It starts empty, and nothing is approved before the difference has actually been observed in a run.

## When a difference may be approved

- The legacy behavior is a defect, and the modern app fixes it on purpose. The fix must be what a user or partner would want, not merely what the conversion happened to produce.
- The difference cannot reach a user or partner in a way that changes an outcome, and keeping the legacy form would cost more than it protects.

## When it may not

- To turn a red run green without understanding why it is red.
- To absorb a modern defect. A wrong fee, a shifted date, a lost row or a dropped trailing space is a defect to fix, whatever the deadline.
- As a wildcard wider than the observed difference. An entry covers the paths that were seen to differ and nothing more.

## Entry format

Each entry is validated when the list is loaded (`approvedBy` must not be empty):

```json
{
  "id": "AD-001",
  "suite": "ui-detail",
  "caseId": "detail-html-in-name-roy",
  "path": "$.ApplicantName",
  "reason": "Legacy writes the name unencoded, so <b>Roy</b> renders as bold Roy. The modern app shows the literal text. Fixes stored XSS (RISK-SEC-01).",
  "approvedBy": "ceylan019",
  "approvedOn": "2026-11-02",
  "defect": "DEF-004"
}
```

This example illustrates the format only; it is not in the list.

| Field | Meaning |
|---|---|
| `id` | `AD-` and a running number, never reused |
| `suite`, `caseId` | The baseline case, as in `tests/baselines/legacy/<suite>/<caseId>.json`. `caseId` may be `*` when the same path differs in every case of the suite for the same reason |
| `path` | The exact path reported by the diff. A `*` stands for one path segment, never more. Schema differences use `schema:<Type>.<field>` |
| `reason` | Why the difference is right, in a sentence a reviewer can check |
| `approvedBy`, `approvedOn` | The owner's GitHub handle and the date of approval |
| `defect` | The defect log entry that found the difference, when there is one |

## How a difference gets approved

1. A parity or contract test fails in qa, and triage classifies the failure as a candidate accepted difference (see the [test strategy](test-strategy.md#9-defect-management)).
2. The builder logs it in the [defect log](defect-log.md) and proposes an entry in its own commit, with the reason and the defect ID.
3. The owner reviews the entry against the failing run. Approval is the owner merging that commit, or the owner adding their handle and date to it.
4. On the next run, every test that used the entry carries an `approved-difference` annotation with its ID, so the report shows exactly where an approval was applied.
5. Each release's go/no-go record lists the approvals in effect.

## Differences expected before the conversion

The register already knows of legacy behaviors the modern app must not copy. They are listed here so that a reviewer is not surprised when they appear, not approved in advance:

- **Unencoded names** on the detail page (RISK-SEC-01). Legacy renders `<b>Roy</b>` as bold text; the modern app must show the literal characters.
- **Exception detail in GraphQL errors and error pages** (RISK-SEC-02). Legacy runs GraphQL with `ExposeExceptions = true` and shows the detailed ASP.NET error page for `Detail.aspx?id=abc`. Parity compares only the first line of each error message, so a business message such as `Invalid status transition from Approved to UnderReview` must still match; whatever legacy adds around it may become an approved difference.

Accessibility and security checks do not need approvals for being better than legacy: those gates compare the modern app with absolute bars and with legacy as a floor, never for equality.
