# Project Instructions

Playwright suite that audits the **live** site https://uptichospitality.com (WordPress 7, block theme, plugins `uptic-insights`, Slim SEO). There is no app code here: the site is the system under test, and failing checks are findings, logged in `FINDINGS.md`.

The suite lives in `e2e/site-audit/` (nested so it can be merged into the main project). Run every command from this folder; the CI workflow stays at the repo root in `.github/workflows/site-audit.yml` with `working-directory: e2e/site-audit`.

## Tech Stack

- TypeScript (strict, no emit), Node ≥ 20.12 (`process.loadEnvFile`)
- `@playwright/test` 1.64, `@axe-core/playwright`, `zod` for API schemas
- GitHub Actions in `mcr.microsoft.com/playwright:v1.64.0-noble` — keep the image tag in sync with `@playwright/test`

## Rules

- **Never write to production.** The auto fixture in `network/writeGuard.ts` aborts POSTs to `admin-post.php`, `admin-ajax.php`, `wp-comments-post.php`, `xmlrpc.php`. To test a write, intercept it with `interceptAction()` from `network/mocks.ts`. `api/WpApi.ts` stays read-only.
- **Known site defects** stay red, they are not skipped: tag the test `@bug` with `knownBug('FINDINGS #N: …')` (smoke/e2e) or add the check to `knownIssues` in `targets.ts` (audits, via `auditDetails()`). The run is red while the bug is open; the results table separates open bugs from new failures. When the test passes (listed under "Fixed on the site"), remove the tag and mark the finding `fixed`. `npm run test:skip-bugs` leaves `@bug` tests out.
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
| `npm test` | everything (projects: desktop, mobile, api) |
| `npm run test:e2e` / `test:api` / `test:seo` / `test:a11y` | one layer |
| `npm run test:ui` | Playwright UI mode |
| `npx tsc -p .` | type-check (CI runs it) |
| `npm run test:visual:update:linux` | refresh the CI visual baseline (Docker) |

Flake check: `npx playwright test <spec> --retries=0 --repeat-each=10`. Config has `retries: 1`, so a flaky test still shows as Flaky in the summary table.

**Regression baseline:** `baseline/results.json` holds every test's expected outcome; `npm run baseline:check` (CI) fails if a test is removed, skipped, newly tagged `@bug`, fixed (`bug → pass`) or missing from it. Never edit the JSON by hand; after an intentional change run `npm run baseline:update` and commit it with the change.

## Project Structure

```
targets.ts      BASE_URL (.env / env, default production), PAGES, knownIssues
fixtures.ts     page objects, wpApi, pageErrors, blockedWrites (auto write guard)
network/        write endpoints, write guard, interceptAction()
api/            read-only WP REST client + zod schemas
reporters/      console + GitHub step-summary results table
tests/          audits (*.spec.ts), smoke/, e2e/, api/
```

## Conventions

- Conventional commits: `feat|fix|test|refactor|docs|chore|ci: …`
- Branch per change (`fix/…`, `feat/…`), merged to `main` by PR after the Site audit check passes
- CI: daily 06:00 UTC, push to `main`, PRs, manual run with `base_url`
