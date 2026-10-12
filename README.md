# uptic-site-audit

Automated checks and a running list of recommendations for <https://uptichospitality.com>.

## Setup

```bash
npm install
npx playwright install chromium
```

## Run

| Command | Checks |
|---------|--------|
| `npm test` | everything |
| `npm run test:seo` | h1, title, meta description, canonical, Open Graph, JSON-LD, robots |
| `npm run test:a11y` | axe WCAG 2.2 AA scan, image alt text |
| `npm run test:links` | broken links on each page |
| `npm run test:mobile` | horizontal overflow on Pixel 7 + full-page screenshots in `screenshots/` |
| `npm run report` | open the HTML report from the last run |

Failing tests are findings, not bugs in the suite. Log them in [FINDINGS.md](FINDINGS.md).

## Add a page

Append it to `PAGES` in [pages.ts](pages.ts). Every check runs against every listed page.
