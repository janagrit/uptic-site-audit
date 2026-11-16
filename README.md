# Production Website QA Audit

A Playwright + TypeScript test framework for auditing a live WordPress website: [uptichospitality.com](https://uptichospitality.com).

This repository treats the production website as the system under test. It checks the user-facing experience and technical contracts, records confirmed defects with evidence and remediation guidance, and runs continuously through GitHub Actions.

> **Important:** This is a read-only production audit. Requests that could modify the site are blocked by design; tests that exercise write flows use intercepted mocks.

## What it covers

| Area | Coverage |
|---|---|
| Functional testing | Navigation, search, 404 behavior, contact form behavior, article interactions, page/API consistency |
| Accessibility | axe checks against WCAG 2.2 AA, image alternatives, labels, keyboard access, focus visibility, headings and form feedback |
| SEO and content health | Page titles, meta descriptions, canonical URLs, Open Graph, structured data, robots directives and broken links |
| API and security | WordPress REST API contracts, response schemas, security headers, exposed endpoints and version disclosure |
| Responsive UI | Mobile/tablet layouts, reflow, touch targets and visual regression checks |
| Performance | Repeated cold-load measurements, LCP, load-time CLS, interaction-latency proxy, page weight and performance budgets |
| Framework quality | Unit tests for the reporter, regression baseline, production write guard, URL handling and audit rules |

## Test architecture

The suite is organized as a standalone project under `e2e/site-audit/`.

- **Playwright + TypeScript** for browser, API and unit testing.
- **Page objects and shared fixtures** for reusable test setup and maintainable selectors.
- **Production write guard** to prevent accidental mutations to the live website.
- **Known-defect tracking** to keep confirmed open issues visible without hiding new regressions.
- **Regression baseline** to detect unexpected test changes, including tests that disappear, become skipped or start passing because a site defect was fixed.
- **Custom audit reporter** to produce one consistent verdict across the console, GitHub Actions summary and JSON output.
- **GitHub Actions** for scheduled and pull-request validation.

The detailed architecture, design decisions, command reference and workflows are documented in the [test-suite README](e2e/site-audit/README.md).

## Quick start

Requirements: Node.js **20.12 or later**.

```bash
cd e2e/site-audit
npm ci
npx playwright install chromium
npm run lint:setup
cp .env.example .env
npm test
```

By default, the tests target the production URL configured in [targets.ts](e2e/site-audit/targets.ts). To point the suite at a staging copy, set `BASE_URL` in `.env`.

### Useful commands

Run these from `e2e/site-audit/`:

| Command | Purpose |
|---|---|
| `npm test` | Run the full Playwright audit |
| `npm run validate` | Type-check, lint and run unit tests without contacting the site |
| `npm run test:api` | Run WordPress API contract and security tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:a11y` | Run accessibility checks |
| `npm run test:seo` | Run SEO checks |
| `npm run test:mobile` | Run mobile project checks |
| `npm run test:visual` | Run visual regression tests |
| `npm run baseline:check` | Check results against the approved regression baseline |
| `npm run baseline:update` | Update the baseline after reviewing an intentional test change |
| `npm run perf` | Run the separate performance audit |
| `npm run report` | Open the latest Playwright HTML report |

See [e2e/site-audit/README.md](e2e/site-audit/README.md) for the full command list and operating guidance.

## Latest recorded audit

The findings report records the **15 November 2026** run:

- **340 tests** in the run
- **335 passed**
- **5 known open defects** tracked as expected failures
- **0 new unexpected failures**
- Regression baseline check passed

These figures describe that recorded run; they are not a live status guarantee. See the [full findings report](e2e/site-audit/FINDINGS.md) for the issue register, evidence, severity and suggested fixes.

## CI

The [GitHub Actions workflow](.github/workflows/site-audit.yml) runs:

1. Validation (type-check, lint and unit tests).
2. The complete site audit on pushes, pull requests and the daily schedule.
3. The performance audit on its scheduled run or when manually requested.

Reports, machine-readable results and failure artifacts are uploaded by the workflow.

## Repository layout

```text
.github/workflows/site-audit.yml   CI workflow
e2e/site-audit/
  api/                             WordPress REST client and schemas
  audits/                          Shared audit rules and helpers
  baseline/                         Approved test-outcome baseline
  config/                           URL and target configuration
  docs/                             Manual checks and supporting docs
  network/                          Production write protection and mocks
  page-objects/                     Page object models
  perf/                             Performance budgets and measurements
  reporters/                        Verdict, findings and report generation
  reports/                          Machine-readable audit output
  tests/                             Unit, API, smoke, E2E and audit specs
  FINDINGS.md                        Confirmed site findings and remediation notes
  README.md                          Detailed test-suite documentation
```

## Scope and limitations

Automated checks can identify measurable behavior and technical issues, but they cannot reliably judge every content or design decision. Items requiring human review are separated in the [manual checks guide](e2e/site-audit/docs/MANUAL-CHECKS.md).

Performance results are lab measurements from a controlled browser profile. They are useful for comparisons within this suite, not a substitute for real-user Core Web Vitals data.

---

**Project:** Production website quality engineering  
**Stack:** Playwright · TypeScript · Node.js · axe-core · Zod · GitHub Actions
