# Findings & Recommendations — uptichospitality.com

Severity: **High** = hurts conversions/SEO/accessibility now · **Medium** = worth fixing soon · **Low** = polish.
Status: `open` · `reported` · `fixed`

## Summary

The three things that matter most:

1. **The article is not set up for Google.** No H1, a 95-character title that gets cut off in search results, and a meta description that ends mid-sentence. All three are quick fixes in WordPress (findings #1, #2, #10).
2. **There is no proof.** No numbers, no case study, no client story anywhere in the article. For a company that sells marketing to hotels, one real result would do more than any other single change here (finding #5).
3. **The article gives the reader nothing to do next.** No takeaways, and a closing question with no comments section. End with one clear step (findings #7, #9).

Start with #1, #2 and #10 (about 15 minutes in WordPress), then #5.

## Platform

- WordPress 7.1.3, theme Twenty Twenty-Five (block theme), custom plugin `uptic-insights`
- PHP 8.3, served via `hcdn` (likely Hostinger CDN)

## Technical / SEO

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 1 | Article | No `<h1>`; article title is an `<h2>` | High | Set the Post Title block to H1 in the single-post template. Why it matters: the H1 is how Google and screen readers know what the page is about | open |
| 2 | Article | Meta description truncated mid-sentence ("…something the brands can") | Medium | Write a custom ≤155-char description that ends cleanly. Why it matters: this text is the ad for the page in Google results, and a sentence cut in half reads careless and costs clicks | open |
| 3 | Article | Author photo has no `alt` | Medium | Add `alt="Tariq Khan"` | open |
| 4 | Article | OG image filename typo `Image_psot_6.png` | Low | Rename to a descriptive slug, e.g. `independent-hotels-think-independently.png` | open |
| 10 | Article | `<title>` is 95 chars; Google truncates around 60 | Medium | Use an SEO title like "Independent Hotels Should Think Independently \| Uptic". Why it matters: a truncated title gets fewer clicks from search | open |

## Content

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 5 | Article | No concrete evidence (data, case, guest story) | High | Add one real "wow moment" from a client hotel; link a case study. Why it matters: hotels buy results, and one concrete outcome is what turns a reader into a call | open |
| 6 | Article | Comparison table has 8 rows with overlap (Recognition/Familiarity vs. Discovery) | Medium | Cut to 4–5 distinct rows | open |
| 7 | Article | No actionable takeaways | Medium | Add "3 ways to act on this" mapped to Digital Presence / Revenue / Guest Journey. Why it matters: a reader who leaves with a next step is far more likely to return or make contact | open |
| 8 | Article | Hamburger analogy runs ~5 paragraphs; health aside distracts | Low | Tighten to 2 paragraphs | open |
| 9 | Article | Closing question but no comments section | Low | Point readers to LinkedIn/email for replies, or drop the question | open |

## Automated results

Run `npm test` and record new findings above.

**Last run: 2026-10-12** — 19 passed, 3 failed (all on the article page; findings #1, #2, #10).

- Passing: canonical, Open Graph, JSON-LD, indexable, axe WCAG 2.2 AA scan, img alt attributes, links, mobile overflow — on both Home and Article.
- Note: axe passed, yet the author photo was flagged as missing alt earlier — verify manually (it may be a CSS background or have an empty `alt=""`).
- Social links (LinkedIn etc.) are skipped by the link checker because they block bots — check them by hand.
