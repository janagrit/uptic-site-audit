# Project Instructions

Playwright suite that audits the **live** site https://uptichospitality.com (WordPress 7, block theme, plugins `uptic-insights`, Slim SEO). There is no app code here: the site is the system under test, and failing checks are findings, logged in `FINDINGS.md`.

The suite lives in `e2e/site-audit/` (nested so it can be merged into the main project). Run every command from this folder; the CI workflow stays at the repo root in `.github/workflows/site-audit.yml` with `working-directory: e2e/site-audit`.

## Tech Stack

- TypeScript (strict, no emit), Node ≥ 20.12 (`process.loadEnvFile`)
- `@playwright/test` 1.64, `@axe-core/playwright`, `zod` for API schemas
- GitHub Actions in `mcr.microsoft.com/playwright:v1.64.0-noble` — keep the image tag in sync with `@playwright/test`

## Rules

- **Never write to production.** The auto fixture in `network/writeGuard.ts` aborts every unsafe method (POST, PUT, PATCH, DELETE, …) to the site, listed endpoint or not, and every request to `admin-post.php`, `admin-ajax.php`, `wp-comments-post.php`, `xmlrpc.php`; the `request` fixture refuses writes. To test a write, intercept it with `interceptAction()` from `network/mocks.ts`. `api/WpApi.ts` stays read-only. Security probes are GET only.
- **No false positives.** Run a new check against the live site before keeping it; confirm a failure by hand before logging it. What needs judgment goes in `docs/MANUAL-CHECKS.md`.
- **Known site defects** are expected failures (`test.fail`), never skipped: call `knownBug('FINDINGS #N: …')` at the top of the test (smoke/e2e) or add the check to `knownIssues` in `targets.ts` (audits, via `expectKnownIssue()`). The run is green while the bug is open; the results table counts it under "Known bug". When the site is fixed the test turns red under "Fixed on the site": remove `knownBug()`, mark the finding `fixed`, run `npm run baseline:update`.
- Finding numbers in tests must match `FINDINGS.md`. Never reuse or renumber a number a test cites.
- Animations: the home page fades content in on scroll unless reduced motion is on. Use `test.use({ reducedMotion: 'reduce' })` for contrast/visual checks.

## Code Style

- Import `test`/`expect` from `fixtures.ts`, never from `@playwright/test` (API specs use `apiTest`).
- Page objects in `page-objects/` (PascalCase, extend `BasePage`); locators by role/label first, CSS only when the markup gives nothing better (comment why).
- Specs: `*.spec.ts`, `describe` titled `<Layer> — <Area>` (e.g. `E2E — Contact form`).
- No `waitForTimeout`; wait on a condition or use `page.clock`.
- Constants for magic numbers (`VIEW_DELAY_MS`, `MAX_DIFF_PIXEL_RATIO`).

## Testing

| Command | Runs |
|---|---|
| `npm test` | everything (projects: unit, desktop, mobile, api) |
| `npm run test:e2e` / `test:api` / `test:seo` / `test:a11y` | one layer |
| `npm run test:ui` | Playwright UI mode |
| `npm run validate` | type-check + lint + unit tests (CI `validate` job); run `npm run lint:setup` once first |
| `npm run perf` | performance audit, separate config, medians of `PERF_RUNS` loads |
| `npm run test:visual:update:linux` | refresh the CI visual baseline (Docker) |

Flake check: `npx playwright test <spec> --retries=0 --repeat-each=10`. Config has `retries: 1`, so a flaky test still shows as Flaky in the summary table.

**Regression baseline:** `baseline/results.json` holds every test's expected outcome; `npm run baseline:check` (CI) fails if a test is removed, skipped, newly marked as a known bug (`pass → bug`) or missing from it, and on any run that did not collect the whole suite (file/grep/project filters, `.only`, interruptions). `baseline:update` refuses incomplete or red runs, and dropping tests needs `BASELINE_ALLOW_REMOVED=1`. Never edit the JSON by hand; after an intentional change run `npm run baseline:update` and commit it with the change.

## Project Structure

```
targets.ts      AuditTarget registry (AUDIT_TARGET), BASE_URL, PAGES, knownIssues; siteUrl()
config/         URL validation and path-preserving joins
fixtures.ts     page objects, wpApi, pageErrors, blockedWrites (auto write guard)
network/        write endpoints, write guard, interceptAction()
api/            read-only WP REST client + zod schemas
reporters/      audit-reporter.ts = the only verdict; model, baseline, findings, summary-table
audits/         generic accessibility rules/probes, visual stabilisation
perf/           performance audit (own config)
docs/           MANUAL-CHECKS.md
tools/lint/     ESLint with its own TypeScript 5 (the suite uses TypeScript 7)
tests/          audits (*.spec.ts), smoke/, e2e/, api/, unit/
```

## Conventions

- Conventional commits: `feat|fix|test|refactor|docs|chore|ci: …`
- Branch per change (`fix/…`, `feat/…`), merged to `main` by PR after the Site audit check passes
- CI: daily 06:00 UTC, push to `main`, PRs, manual run with `base_url`
