# TDD evidence: failure-modes (FM-1 … FM-14)

Source plan: [.claude/evals/failure-modes.md](../evals/failure-modes.md). Branch `feat/failure-modes`, 2026-10-14.

The system under test is the live production site, which this repo cannot change. So:

- **RED** = the new test fails when its condition is deliberately broken (a probe copy of the spec
  with one injected sabotage, run with `--retries=0`, then deleted). For real defects the live site
  is the RED.
- **GREEN** = the unmodified test passes against the live site.

## User journeys

- As a visitor whose inquiry hits a server error, I can go back and resend (FM-1).
- As a visitor, I never see or tab into the spam trap (FM-2).
- As the site owner, view stats count only real, visible reads and never break the page (FM-3, FM-4).
- As a visitor, every page loads fully without errors, and broken links give a real 404 (FM-5–7).
- As the site owner, the domain, sitemap, search and API behave correctly and safely (FM-8–13).
- As a visitor with JavaScript blocked, I can still read, navigate and get in touch (FM-14).

## Test specification

| # | What is guaranteed | Test | RED probe (sabotage → result) | GREEN |
|---|--------------------|------|-------------------------------|-------|
| FM-1 | Restoring the contact page re-enables the submit button | `e2e/contact-form` › re-enables the button… | block `pageshow` listeners → `toBeEnabled` failed | pass |
| FM-1 (v1, dropped) | — | `goBack()` after a 500 | same sabotage → **still passed**: Playwright disables bfcache, so the test proved nothing; rewritten as above | — |
| FM-2 | Honeypot is off-screen, `tabindex=-1`, `aria-hidden` | `e2e/contact-form` › keeps the spam honeypot… | un-hide `.cp-trap` via CSS → `not.toBeInViewport` failed | pass |
| FM-3 | No view beacon from a background tab | `e2e/article-views` › sends no view from a background tab | report `visible` → `Expected length: 0` failed | pass |
| FM-4 | A failed beacon raises no page error | `e2e/article-views` › a failed view request… | strip `.catch()` from views.js → `Failed to fetch` page error | pass |
| FM-5 | No same-origin asset ≥ 400 or failed | `page-health` › every same-origin asset loads | 404 the emoji script → `404 script /wp-includes/js/wp-emoji-release.min.js` | pass |
| FM-6 | No uncaught JS errors on every audited page | `page-health` › throws no uncaught… | throw on `load` → `probe: boom` | pass |
| FM-7 | Unknown URL → 404 + `noindex` | `smoke/not-found` | serve 200 → `Expected: 404` | pass |
| FM-8 | http and www → 301 to `https://uptichospitality.com/` | `api/site` › … redirects permanently… | request the apex itself → `Received: 200` | pass (skipped off production) |
| FM-9 | Every sitemap URL loads | `api/site` › sitemap lists only URLs that load | add `/zzqx-missing/` → `Received: 404` | pass |
| FM-10 | Search query is shown as text, not executed | `smoke/search` › shows a script-like query… | inject `#xss-probe` → `toHaveCount(0)` failed | pass |
| FM-11 | `per_page=101` → JSON 400 `rest_invalid_param` | `api/posts` › rejects an out-of-range page size… | `per_page=100` → `Received: 200` | pass |
| FM-12 | REST API lists no users | `api/security` › REST API does not list user accounts | live site → `1 user(s) exposed` | known defect #17 |
| FM-13 | HSTS, nosniff, framing protection present | `api/security` › … baseline security headers | live site → all three missing | known defect #18 |
| FM-14 | Without JS: headline, links to key pages, native contact POST | `e2e/no-javascript` | serve a JS-only shell → `no link to /about-uptic/` | pass |
| FM-14 | Without JS: header navigation renders | `e2e/no-javascript` › home renders the header navigation | live site → nav not found (injected by JS) | known defect #19 |

## Regression run

`npx playwright test --retries=0 --repeat-each=3` → 198 passed, 27 known defects, 3 skipped (contact
success `fixme`), 0 failed, 0 flaky (pass^3 = 100 %). Type-check `npx tsc -p .` clean.

Also fixed during the starting verification: `e2e/article-views` paused the fake clock (it ticked in
real time; reproduced with a 6 s delay, then 60/60 under load). Commit `b014644`.

## Gaps

- Coverage % does not apply: the code under test is the live site.
- Backlog FM-B1…B5 in the eval file; contact success confirmation still `fixme`.
