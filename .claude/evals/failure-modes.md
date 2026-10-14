# EVAL DEFINITION: failure-modes

Gaps found on 2026-10-14 against `main @ d4427a5` (56 tests). Each mode says what can break on the
live site, why the current suite misses it, and how it is graded. All graders are code-based
(Playwright assertions); none are model-graded.

Probed facts this is based on: unknown URLs return 404 · http and www 301 to https apex ·
`sitemap.xml` 200 · search echoes the query HTML-escaped · REST rejects `per_page=101` with 400 ·
`/wp-json/wp/v2/users` is public and exposes slug `tariqkhanoutlook-com` · only security header is
`content-security-policy: upgrade-insecure-requests`.

## Capability evals — implemented in this round (test-first)

| ID | Failure mode | Missed today because | Grader | Expect today |
|----|--------------|----------------------|--------|--------------|
| FM-1 | Contact submit fails (5xx) and the user returns to the form: button stays disabled on "Sending…" | only the happy path is mocked | e2e: replay submit + persisted `pageshow` (Playwright disables bfcache, so `goBack()` cannot reproduce it) → button enabled with original label | pass |
| FM-2 | Spam honeypot becomes visible or keyboard-reachable (real users fill it, inquiries silently dropped) | payload test only checks it is sent empty | e2e: field not visible, `tabindex=-1`, wrapper `aria-hidden` | pass |
| FM-3 | View beacon is sent from a background tab (inflated stats) | only the visible path is tested | e2e: hidden `visibilityState`, run 2× delay → 0 requests | pass |
| FM-4 | View beacon network error surfaces as an uncaught page error | only success is mocked | e2e: abort the beacon → `pageErrors` empty | pass |
| FM-5 | A same-origin asset (CSS, JS, font, image) fails to load | `links.spec` checks `<a href>` only | audit, all PAGES: no same-origin response ≥ 400 on load | pass |
| FM-6 | Uncaught JS errors on pages other than home | `pageErrors` only asserted on home | audit, all PAGES: `pageErrors` empty | pass |
| FM-7 | Soft 404: missing pages return 200 or are indexable | never requested | smoke: unknown URL → 404 + `noindex` | pass |
| FM-8 | Canonical host broken: http or www stops redirecting to https apex | never requested | api project: 301 → `https://uptichospitality.com/` | pass (skip when BASE_URL ≠ production) |
| FM-9 | Sitemap missing, or lists URLs that do not load | never requested | api project: sitemap index → every listed URL 200 | pass |
| FM-10 | Search reflects the query unescaped (XSS) | only plain terms searched | smoke: `"><img src=x onerror=…>` → no injected `img`, no dialog | pass |
| FM-11 | REST API error contract changes (bad params return 200/HTML) | only success responses tested | api: `per_page=101` → 400 JSON `rest_invalid_param` | pass |
| FM-12 | User enumeration via REST exposes login slugs | never requested | api: `/wp/v2/users` not public | **known defect** → FINDINGS #17 |
| FM-13 | Missing security headers (HSTS, nosniff, framing) | never requested | api: required headers present on `/` | **known defect** → FINDINGS #18 |
| FM-14 | Page unusable without JavaScript (blocked/failed JS bundle) | every test runs with JS | e2e: `javaScriptEnabled: false` → home H1, links to key pages, contact form posts natively; header nav | pass; header nav **known defect** → FINDINGS #19 |

## Backlog — not in this round

| ID | Failure mode | Why deferred |
|----|--------------|--------------|
| FM-B1 | Insights page lists exactly the posts the API returns | needs Insights page object; markup not mapped yet |
| FM-B2 | Contact success confirmation | blocked on the real redirect contract (see contact-form fixme) |
| FM-B3 | Performance budget (page weight, LCP) | live-site timing is noisy; needs a tolerant budget first |
| FM-B4 | Contact page in `PAGES` (full SEO/a11y/links/mobile audit) | may surface new defects; do as its own change |
| FM-B5 | Keyboard-only contact form completion | covered partly by axe; worth a dedicated flow later |

## Success metrics

- Capability evals: each new test fails first (RED) against a deliberately broken condition, then passes (GREEN).
- Regression: pass^3 = 100 % for the whole suite with `--retries=0` (no flakes).
- Known defects are `test.fail` with a FINDINGS number, so a site fix turns them red.
