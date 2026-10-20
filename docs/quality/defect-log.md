# Defect log

Every defect here was caught by a test during this project, in the environment named, with a link to the failing run. Nothing is planted after the fact, and a failure that turned out not to be a product defect stays in the log with its real classification. Severity and classification are defined in the [test strategy](test-strategy.md#9-defect-management).

**No entries yet.** The first entries come from the dev and qa runs on the conversion pull request.

## Summary

| ID | Severity | Classification | Caught by | Stage | Risk | Status |
|---|---|---|---|---|---|---|

## Entries

Copy this block for each defect, newest last. IDs run `DEF-001`, `DEF-002`, and so on, and never get reused.

```markdown
### DEF-000: <one line: what broke, as a user or partner would see it>

- **Severity:** S1 | S2 | S3 | S4
- **Classification:** product defect | test defect | baseline defect | environment defect | accepted difference
- **Caught by:** <spec file and test title>
- **Stage:** dev | qa | staging | prod
- **Risk:** <RISK-ID>
- **Failing run:** <link to the workflow run>
- **Expected (legacy):** <the baseline value, or the rule>
- **Actual (modern):** <what the modern app did>
- **Root cause:** <the line or decision in the converted code, and why it differs>
- **Fix:** <commit link> (the commit message references this ID)
- **Verified by:** <link to the first green run after the fix>
- **Status:** open | fixed | accepted (see <approved difference ID>) | not a product defect
```
