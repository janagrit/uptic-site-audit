# Review: feat/failure-modes → main

**Reviewed**: 2026-10-14 (local mode; no PR yet, `gh` not installed)
**Commits**: b014644 … (this branch)
**Decision**: APPROVE with comments (the one HIGH finding is fixed on the branch)

## Summary

Adds 14 RED-probed failure-mode tests, two regression guards for bugs found in the suite, a
per-test regression baseline enforced in CI, CLAUDE.md, and three new site findings (#17–#19).
No security issues: no secrets, `.env` untracked, the write guard still covers every new test that
touches production writes.

## Findings

### CRITICAL
None.

### HIGH
- **`reporters/baseline.ts` — baseline check failed on any non-production target.** The redirect
  tests skip off production and staging has different defects, so a manual CI run with `base_url`
  would always fail with drift. **Fixed:** check/update now skip with a message when
  `BASE_URL !== PRODUCTION_URL` (verified with a staging URL: skipped, exit 0).

### MEDIUM
- **`reporters/summary-table.ts` prints `PASS` before the baseline reporter fails the run.** The
  exit code and the "Baseline check FAILED" block that follows are correct, but the status line
  can mislead. Not fixed; reporters receive the pre-override result.
- **`tests/page-health.spec.ts` counts every same-origin `requestfailed`**, which can include
  harmless `net::ERR_ABORTED` (cancelled preloads). Clean in 3×3 runs; if it flakes, exclude
  `ERR_ABORTED` alongside the guard's `ERR_BLOCKED_BY_CLIENT`.

### LOW
- `BASELINE=check` on a filtered run reports every unselected test as removed — documented in
  README and the reporter header.
- `tests/api/security.spec.ts` casts the users response to `unknown[]` without validation; a
  non-array 200 would give a confusing message, but the test still fails correctly.
- `BUG-R1 regression` uses a deliberate 1 s real-time wait (commented); it is the bug's only
  observable.

## Validation Results

| Check | Result |
|---|---|
| Type check (`tsc -p .`) | Pass |
| Lint | Skipped (none configured) |
| Tests, local, 3× no retries | Pass — 198 passed, 27 known, 3 skipped, 0 flaky |
| CI job in `playwright:v1.64.0-noble` with `BASELINE=check` | Pass — 79/79 match baseline, exit 0 |
| Baseline drift detection (skip / delete / hide with test.fail) | Pass — all three reported, exit 1 |
| Build | Skipped (no build step) |

## Files Reviewed

Added: `reporters/baseline.ts`, `baseline/results.json`, `tests/page-health.spec.ts`,
`tests/smoke/not-found.spec.ts`, `tests/e2e/no-javascript.spec.ts`, `tests/api/site.spec.ts`,
`tests/api/security.spec.ts`, `CLAUDE.md`, `.claude/evals/failure-modes.md`,
`.claude/tdd/failure-modes.tdd.md`.
Modified: `tests/e2e/article-views.spec.ts`, `tests/e2e/contact-form.spec.ts`,
`tests/smoke/search.spec.ts`, `tests/api/posts.spec.ts`, `tests/links.spec.ts`,
`tests/accessibility.spec.ts`, `api/WpApi.ts`, `page-objects/ContactPage.ts`, `targets.ts`,
`playwright.config.ts`, `package.json`, `FINDINGS.md`, `README.md`,
`.github/workflows/site-audit.yml`.
