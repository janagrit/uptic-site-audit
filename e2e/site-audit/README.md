# uptic-site-audit

A Playwright + TypeScript quality audit of a **live production website**, <https://uptichospitality.com>
(WordPress). The site is the system under test: there is no application code here, and a failing check
is a finding about the site, logged with severity and a fix in [FINDINGS.md](FINDINGS.md).

Testing production rather than a test environment shapes most of the design:

- **The suite must never change production.** No form submission, comment, view count or REST write may
  leave the machine, even by accident.
- **The site has known, open defects.** A run must stay green while they are open, turn red when a new one
  appears, *and* turn red when one gets fixed, so the record stays true.
- **Nobody may "fix" a red run by deleting, skipping or relabelling a test.**
- **Production is noisy.** Performance numbers vary run to run and must not cause false alarms.

| Layer | What it checks | Where |
|---|---|---|
| Unit | The framework itself: reporter verdict, baseline rules, write guard, URL parsing, schemas, a11y and perf rules | `tests/unit/` |
| API contract | WP REST: schemas, pagination, invalid parameters, status codes, content types, error envelopes | `tests/api/posts.spec.ts` |
| Security | HSTS, CSP, nosniff, framing, cookies, version disclosure, REST exposure, user enumeration, output escaping (all GET) | `tests/api/security.spec.ts` |
| Smoke / E2E | Navigation, search, 404, contact form, article view counter, no-JavaScript fallback, API ↔ page consistency | `tests/smoke/`, `tests/e2e/` |
| Accessibility | axe WCAG 2.2 AA, alt text quality, decorative images, accessible names, keyboard and focus visibility, heading order, form labels, errors and announcements | `tests/accessibility.spec.ts` |
| SEO, links, page health | Titles, descriptions, canonical, Open Graph, JSON-LD, robots, broken links, failing assets, JS errors | `tests/*.spec.ts` |
| Mobile, visual | Reflow at 320–1024 px, touch targets (WCAG 2.5.8), form usability; deterministic screenshots of key components | `tests/mobile.spec.ts`, `tests/visual*.spec.ts` |
| Performance (separate) | LCP, CLS, INP (lab), page weight, image optimization, budgets, history | `perf/` |

What a tool cannot judge (does this alt text describe the image?) is listed in
[docs/MANUAL-CHECKS.md](docs/MANUAL-CHECKS.md).

## Quick start

All commands run from this folder (`e2e/site-audit/`). Node ≥ 20.12.

```bash
npm install
npx playwright install chromium
npm run lint:setup          # isolated ESLint toolchain (see "Why ESLint lives in tools/lint")
cp .env.example .env        # optional: BASE_URL defaults to production
```

| Command | Runs |
|---|---|
| `npm test` | the whole audit (projects `unit`, `desktop`, `mobile`, `api`) |
| `npm run validate` | type-check + lint + unit tests: no traffic to the site, ~10 s |
| `npm run test:api` / `test:e2e` / `test:a11y` / `test:seo` / `test:mobile` / `test:visual` | one layer |
| `npm run baseline:check` | full audit, then compare every outcome with `baseline/results.json` (what CI runs) |
| `npm run baseline:update` | record outcomes after an intentional change (refuses unless complete and green) |
| `npm run perf` | performance audit: `PERF_RUNS` (default 5) cold loads per page, judged on the median |
| `npm run test:ui` / `npm run report` | Playwright UI mode / last HTML report |

## Architecture

```
targets.ts            AuditTarget registry: site URL, platform, pages, known issues. The only config.
config/url.ts         URL validation and path-preserving joins (pure)
fixtures.ts           test/apiTest/unitTest + page objects, write guard (auto), read-only `request`
network/
  writeGuard.ts       production write protection: policy (pure) + browser guard + API guard
  endpoints.ts        WordPress write endpoints; form-body helpers
  mocks.ts            interceptAction(): answer a write in the browser and record it
api/                  read-only WP REST client (WpApi) and zod contracts (schemas.ts)
audits/               generic audit logic: accessibility rules and probes, visual stabilisation
page-objects/         one class per page or component (role/label locators first)
reporters/
  audit-reporter.ts   the single result authority: classify → baseline → verdict → outputs
  model.ts            outcome classification and the verdict (pure)
  baseline.ts         regression baseline: drift, collection evidence, update rules (pure + file I/O)
  findings.ts         test outcomes → findings with severity, page, evidence, remediation
  summary-table.ts    console table and GitHub step summary (rendering only)
perf/                 performance module, own config (playwright.perf.config.ts)
tests/                unit/, api/, smoke/, e2e/, audits (*.spec.ts)
tools/lint/           ESLint toolchain (own package.json)
```

Dependencies point one way: specs → fixtures, page objects, audits → network, api, config. The rules that
make decisions (verdict, baseline, write policy, URL handling, alt-text and heading rules, performance
statistics) are pure functions with unit tests; the Playwright-facing code only gathers facts.

### Generic vs WordPress

`AuditTarget { id, name, productionUrl, platform, pages, sampleArticleSlug? }` in [targets.ts](targets.ts)
is the only place a site is described. Generic audits (SEO, accessibility, links, mobile, page health,
visual, performance, security headers) run on every listed page of any target. WordPress-specific layers
(`api/WpApi.ts`, the REST contract and exposure tests, `network/endpoints.ts`) declare it with
`requirePlatform('wordpress')` and skip on other platforms.

**Add a site:** add an entry to `TARGETS` and run `AUDIT_TARGET=<id> npm test`. **Add a page:** append it
to the target's `pages`; every generic audit runs against it.

`BASE_URL` points a target at another copy (staging) and may include a path: `https://host/staging/`
stays `https://host/staging/contact/`, because every navigation and request goes through `siteUrl()`
([config/url.ts](config/url.ts) explains why Playwright's own `baseURL` would drop the path).

## Key engineering decisions

### 1. One reporter decides the verdict

The suite used to have two reporters: a results table and a baseline check. Playwright calls each
reporter's `onEnd` in order and lets a later one change the run status, so the table printed **PASS**,
then the baseline reporter failed the run. Two sources of truth disagreed, and the one people read was wrong.

Now [reporters/audit-reporter.ts](reporters/audit-reporter.ts) is the only reporter with an opinion. It
classifies every test, evaluates the baseline, calls `decideVerdict()` once, renders the console table,
the GitHub step summary and `reports/audit-results.json` from that same verdict, and returns it as the
exit status. `list` and `html` only display.

| Outcome | Meaning | Red? |
|---|---|---|
| passed / flaky | as expected (flaky = passed on retry, listed) | no |
| known defect | `knownBug()` test failing as expected; open FINDINGS entry | no |
| new failure | expected to pass and did not | **yes** |
| fixed on site (unexpected pass) | a `knownBug()` test passed: remove the marker, mark the finding fixed | **yes** |
| skipped | `test.skip`, or platform not applicable | no (baseline drift if new) |
| not run | collected but never finished (interrupted) | **yes** |
| baseline drift | a test added, removed, skipped or relabelled without a baseline update | **yes** (check mode) |

`decideVerdict()` can only add reasons to fail; it never turns a failed Playwright run green.

### 2. The baseline only trusts complete runs

[baseline/results.json](baseline/results.json) records every test's expected outcome (`pass`, `bug`,
`skipped`). The check catches a red test made green by deleting it, skipping it or wrapping it in
`knownBug()`. That guard is only as good as the run behind it, so before checking or updating, the
reporter gathers **collection evidence**:

- every configured project ran (no `--project` subset);
- every spec file each project selects *on disk* contributed tests (catches file filters, `test.only` and
  files that failed to load);
- no `--grep`, `--shard`, `--last-failed` or `--only-changed`;
- every collected test finished (no interrupted runs).

`BASELINE=update` also requires a green run and refuses to drop tests unless `BASELINE_ALLOW_REMOVED=1`
confirms it; the file is written atomically. `BASELINE` must be `check`, `update` or unset, and a typo
fails at startup. Against a non-production `BASE_URL` the check is skipped (the baseline describes
production's known bugs) and an update is refused.

### 3. Production write protection is fail-safe, not a deny-list

[network/writeGuard.ts](network/writeGuard.ts) routes **every** request of every browser context through
one pure policy:

- unsafe methods (anything but GET/HEAD/OPTIONS) to the target or production host (`www.` and bare) are
  aborted, **including endpoints nobody listed**;
- known WordPress write endpoints (`admin-post.php`, `admin-ajax.php`, `wp-comments-post.php`,
  `xmlrpc.php`) are blocked for every method on every host, since `admin-ajax.php?action=…` can write on GET;
- third-party hosts (analytics) are left alone: they are not the system under test.

The `request` fixture is wrapped so `post/put/patch/delete` and unsafe `fetch` throw before sending, and
service workers are blocked so nothing bypasses routing. Tests that *want* a write use
`interceptAction()`: page routes run before the context-level guard, so the mock answers and nothing
reaches the network. The guard's own tests run against a fake `.example` origin behind a stub route, so
even a broken guard could not send anything anywhere.

### 4. Known defects are expected failures, tied to FINDINGS

A test that fails because of an open site defect calls `knownBug('FINDINGS #N: …')` (`test.fail`); page
audits list the check in the page's `knownIssues`. The run stays green while the defect is open and
turns red the day it is fixed. The reporter pulls severity, page and remediation from the FINDINGS.md
row, so the JSON report and step summary read like a findings list, not a stack trace.

```ts
test('home page offers a search box', async ({ homePage, page }) => {
  knownBug('FINDINGS #11: no search UI on the home page');
  …
});
```

### 5. No false positives over more checks

Every new audit was run against the live site before it was kept, and every failure was confirmed by
hand before being logged. Two examples: the REST "user routes" check first flagged `/users/me` and the
application-password routes, which need a login, so it now targets only routes that list or look up
users. The keyboard check flagged the article search field; a screenshot confirmed it has no visible
focus indicator, so it became FINDINGS #24. Touch targets use axe's `target-size` rule because it applies
the WCAG spacing and inline-link exceptions a hand-written size check would miss.

### 6. Performance is measured, not asserted once

[perf/](perf/) runs outside the functional suite (own config, one worker, never on pull requests). Each
page is loaded `PERF_RUNS` times in fresh, cold, throttled contexts (Slow 4G, 4× CPU, Pixel 7) and judged
on the **median**: budgets in [perf/budgets.json](perf/budgets.json) fail, while a worsening against
recent history only warns, and only once three earlier runs exist. Results go to `perf-results/<page>.json`
and `perf-results/history.jsonl` (kept between CI runs). It reports LCP, CLS, INP (lab proxy), bytes by
type, request count and image problems (oversized, legacy format, missing dimensions, lazy above the
fold). Lighthouse was considered; this measures the same Core Web Vitals with the browser's own APIs,
adds no dependency, and keeps the write guard active.

### 7. Visual tests are deterministic by construction

Screenshots cover stable components (header nav, Services menu, contact form) and the first viewport of
key pages at desktop, tablet and mobile sizes, never full pages whose length changes when an article is
published. Before each one, [audits/visual.ts](audits/visual.ts) turns motion off, waits for web fonts
and in-view images, scrolls to the top and hides the caret. Baselines are per OS (`-darwin` locally,
`-linux` in CI, generated in the CI Docker image). New ones are added with `--update-snapshots=missing`,
so existing baselines are never silently rewritten.

### Why ESLint lives in `tools/lint`

The suite type-checks with TypeScript 7 (native compiler). typescript-eslint needs the TypeScript 5
JavaScript API, which TypeScript 7 does not ship. Rather than downgrade the compiler, the lint toolchain
has its own `package.json` with TypeScript 5.9, and Node's module resolution gives the linter its own
copy. Rules: `strictTypeChecked`, no floating promises, Playwright's recommended set, no `waitForTimeout`,
no `.only`, and importing `test` from `@playwright/test` is an error (it would bypass the write guard).

## Reports

| Output | For | Where |
|---|---|---|
| Console table | the person running the suite | stdout |
| GitHub step summary | the CI run page | `$GITHUB_STEP_SUMMARY` |
| `reports/audit-results.json` | machines, dashboards, trend tools | CI artifact `audit-results` |
| HTML report | drilling into one test: trace, screenshot, attachments | `playwright-report/`, CI artifact |
| `perf-results/*.json`, `history.jsonl` | performance budgets and trends | CI artifact `performance-results` |

`audit-results.json` (schema version 1) holds the verdict and its reasons, counts per outcome, per-file
groups, the baseline result (drift and collection issues), every test record, and a `findings` list.
Each finding has `category` (new-failure / fixed-on-site / known-defect), `severity`, `page`,
`reference`, `expected`, `actual`, `evidence` (error, screenshot and trace paths) and `remediation`.

## CI

[.github/workflows/site-audit.yml](../../.github/workflows/site-audit.yml) runs daily at 06:00 UTC, on push
to `main`, on pull requests, and manually (optional `base_url` and performance):

1. **validate**: type-check, lint, unit tests. No site traffic; a broken framework fails here in a minute.
2. **audit** (needs validate): the full suite with `BASELINE=check`. One job on purpose: the baseline only
   trusts a run that collected the whole suite, so the layers are separated in the report, not across
   jobs. Uploads the HTML report, `audit-results.json`, and traces on failure.
3. **performance** (needs validate; schedule or manual only): `npm run perf`, history in the Actions cache.

All jobs run in `mcr.microsoft.com/playwright:v1.64.0-noble` (keep it in sync with `@playwright/test`).
The target is the `base_url` input, else the `BASE_URL` repository variable, else production.

## Workflows

- **Site fixed a known bug:** the run turns red under "Fixed on the site". Remove `knownBug()` (or the
  `knownIssues` entry), mark the finding `fixed`, run `npm run baseline:update`, commit both.
- **New site defect:** add a FINDINGS row with the next number, call `knownBug('FINDINGS #N: …')`, update
  the baseline. Never reuse a finding number.
- **New test:** write it, run `npm run baseline:update`, review the JSON diff (only additions expected),
  commit it with the test.
- **Visual change on the site:** `npm run test:visual:update` and `npm run test:visual:update:linux`
  (Docker), then review the images.
- **Flake check:** `npx playwright test <spec> --retries=0 --repeat-each=10`.

Code style: import `test`/`expect` from `fixtures.ts`; page objects extend `BasePage`; describe blocks
are titled `<Layer> — <Area>`; no `waitForTimeout`; constants for magic numbers. See [CLAUDE.md](CLAUDE.md).
