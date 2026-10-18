# uptic-site-audit

Automated checks and a running list of recommendations for <https://uptichospitality.com>.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # optional: BASE_URL defaults to production
```

`BASE_URL` in `.env` picks the site under test (e.g. a staging copy). A `BASE_URL` set in the shell wins over `.env`: `BASE_URL=https://staging.example.com npm test`.

## Run

| Command | Checks |
|---------|--------|
| `npm test` | everything |
| `npm run test:seo` | h1, title, meta description, canonical, Open Graph, JSON-LD, robots |
| `npm run test:a11y` | axe WCAG 2.2 AA scan, image alt text |
| `npm run test:links` | broken links on each page (network errors named, 6 links at a time) |
| `npm run test:mobile` | horizontal overflow on Pixel 7 + full-page screenshots in `screenshots/` |
| `npm run test:visual` | home hero compared against the baseline in `tests/visual.spec.ts-snapshots/` (refresh with `test:visual:update`) |
| `npm run test:e2e` | user flows with intercepted network: contact form (incl. back-button recovery, honeypot), article view counter (incl. background tab, failed beacon), API ↔ page consistency, the site without JavaScript |
| `npm run test:api` | REST API (`wp/v2/posts` schema, lookups, 400 contract), canonical-host redirects, sitemap URLs, user enumeration, security headers |
| `npm run test:ui` | Playwright UI mode: pick tests, watch them run, time-travel through steps and network calls. Narrow it with args, e.g. `npm run test:ui -- tests/e2e` or `npm run test:ui -- --project=api` |
| `npm run baseline:check` | full suite, then compare every test's outcome with `baseline/results.json` (what CI runs) |
| `npm run baseline:update` | rewrite the baseline after an intentional change (refuses if the run fails) |
| `npm run report` | open the HTML report from the last run |

Also in `npm test`: `page-health` (every page loads its assets and throws no JS errors) and `smoke/not-found` (real 404 + `noindex`).
Failing tests are findings, not bugs in the suite. Log them in [FINDINGS.md](FINDINGS.md).

## Regression baseline

[baseline/results.json](baseline/results.json) records the expected outcome of every test: `pass`, `known-defect` (a `test.fail` tied to a FINDINGS number) or `skipped`. `npm run baseline:check` fails when a test is removed, skipped, newly marked as a known defect, or missing from the file — the ways a red test gets "fixed" without fixing anything.

- After an intentional change (new test, site defect fixed, test retired): `npm run baseline:update`, review the JSON diff, commit it with the change.
- Run it on the **full suite against production**. Other targets skip the check; a filtered run reports unselected tests as removed.

How each failure mode was proven (a deliberately broken condition must turn every new test red): [.claude/tdd/failure-modes.tdd.md](.claude/tdd/failure-modes.tdd.md).

## CI (GitHub Actions)

[.github/workflows/site-audit.yml](.github/workflows/site-audit.yml) type-checks and runs the full suite with the baseline check:

- **daily at 06:00 UTC**, on every push to `main`, and on pull requests
- **on demand**: Actions → Site audit → Run workflow, optionally with a different `base_url`
- in the `mcr.microsoft.com/playwright:v1.64.0-noble` image (keep its version in sync with `@playwright/test`)

The results table appears on the run page; the HTML report (and traces on failure) are attached as artifacts. GitHub emails you when a scheduled run fails.

Target: the `base_url` input, else the `BASE_URL` repository variable (Settings → Secrets and variables → Actions → Variables), else production.

**Visual baselines** are per OS: `-darwin.png` for local Macs, `-linux.png` for CI. After an intentional site change, refresh both: `npm run test:visual:update` and `npm run test:visual:update:linux` (needs Docker).

## Structure

```
targets.ts          pages under audit, known defects, sample article
fixtures.ts         test fixtures: page objects, wpApi, pageErrors, write guard (auto)
page-objects/       one class per page or shared component
network/
  endpoints.ts      write endpoints (admin-post, admin-ajax) and form-body helpers
  writeGuard.ts     aborts every write to production unless a test intercepts it
  mocks.ts          interceptAction(): record + fulfill a specific POST action
api/
  WpApi.ts          read-only client for /wp-json/wp/v2
  schemas.ts        zod schemas for API responses
reporters/
  summary-table.ts  results table printed after every run (Known defect = expected test.fail)
  baseline.ts       BASELINE=check|update against baseline/results.json
baseline/           expected outcome of every test
tests/
  *.spec.ts         audits: SEO, a11y, links, mobile, visual, page health
  smoke/            home, navigation, search, not found
  e2e/              flows with network interception
  api/              REST API (own browserless project)
```

## Testing against production

The suite runs against the live site, so it must never write to it:

- **Write guard** — an auto fixture aborts every non-GET request to `admin-post.php`, `admin-ajax.php`, `wp-comments-post.php` and `xmlrpc.php`. Aborted requests are exposed as `blockedWrites`.
- **To test a write**, intercept it: `interceptAction(page, ADMIN_POST, CONTACT_ACTION)` fulfills the request in the browser and records it for assertions. Nothing reaches the server.
- `WpApi` is read-only by design. Don't add write methods.

## Add a page

Append it to `PAGES` in [targets.ts](targets.ts). Every audit check runs against every listed page.
