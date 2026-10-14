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
| `npm run test:links` | broken links on each page |
| `npm run test:mobile` | horizontal overflow on Pixel 7 + full-page screenshots in `screenshots/` |
| `npm run test:visual` | home hero compared against the baseline in `tests/visual.spec.ts-snapshots/` (refresh with `test:visual:update`) |
| `npm run test:e2e` | user flows with intercepted network: contact form, article view counter, API ↔ page consistency |
| `npm run test:api` | public WordPress REST API (`wp/v2/posts`): schema, lookups, every post link loads |
| `npm run test:ui` | Playwright UI mode: pick tests, watch them run, time-travel through steps and network calls. Narrow it with args, e.g. `npm run test:ui -- tests/e2e` or `npm run test:ui -- --project=api` |
| `npm run report` | open the HTML report from the last run |

Failing tests are findings, not bugs in the suite. Log them in [FINDINGS.md](FINDINGS.md).

## CI (GitHub Actions)

[.github/workflows/site-audit.yml](.github/workflows/site-audit.yml) runs the full suite:

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
tests/
  *.spec.ts         audits: SEO, a11y, links, mobile, visual
  smoke/            home, navigation, search
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
