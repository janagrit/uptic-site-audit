# Findings & Recommendations — uptichospitality.com

Severity: **High** = hurts conversions/SEO/accessibility now · **Medium** = worth fixing soon · **Low** = polish.
Status: `open` · `reported` · `fixed`

## Platform

- WordPress 7.1.3, theme Twenty Twenty-Five (block theme), custom plugin `uptic-insights`
- PHP 8.3, served via `hcdn` (likely Hostinger CDN)
- No SEO plugin: `<title>` is "post title – Uptic Hospitality"; meta description is auto-generated and word-truncated
- CSS already contains `prefers-reduced-motion` rules

## Technical / SEO

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 1 | Article | No `<h1>`; article title is an `<h2>` | High | Set the Post Title block to H1 in the single-post template | open |
| 2 | Article | Meta description truncated mid-sentence ("…something the brands can") | Medium | Write a custom ≤155-char description that ends cleanly | open |
| 3 | Article | Author photo has no `alt` | Medium | Add `alt="Tariq Khan"` | open |
| 4 | Article | OG image filename typo `Image_psot_6.png` | Low | Rename to a descriptive slug, e.g. `independent-hotels-think-independently.png` | open |
| 10 | Article | `<title>` is 95 chars; Google truncates around 60 | Medium | Use an SEO title like "Independent Hotels Should Think Independently \| Uptic" | open |
| 13 | Home | Glowing background and 01–04 strip appear to animate; also makes visual baselines flaky | Low | Confirm motion stops with OS "Reduce motion" on; mask the strip in the visual test | open |

## Content

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 5 | Article | No concrete evidence (data, case, guest story) | High | Add one real "wow moment" from a client hotel; link a case study | open |
| 6 | Article | Comparison table has 8 rows with overlap (Recognition/Familiarity vs. Discovery) | Medium | Cut to 4–5 distinct rows | open |
| 7 | Article | No actionable takeaways | Medium | Add "3 ways to act on this" mapped to Digital Presence / Revenue / Guest Journey | open |
| 8 | Article | Hamburger analogy runs ~5 paragraphs; health aside distracts | Low | Tighten to 2 paragraphs | open |
| 9 | Article | Closing question but no comments section | Low | Point readers to LinkedIn/email for replies, or drop the question | open |
| 11 | Home | No proof above the fold (logos, numbers, testimonial) | High | Add one row under the hero: 4–6 client logos, one headline number, or a one-line testimonial | open |
| 12 | Home | Hero CTA "Discover more" is vague | Medium | Use a specific label: "See how we work" (scrolls) or "View case studies" (links) | open |

## How to fix

All fixes are made in WordPress admin, not in this repo.

**Technical**

- **#1 H1:** Appearance → Editor → Templates → Single Posts → select Post Title → change level to H1 → Save. Applies to every post. The three `h2.uf-heading` come from a plugin and can stay H2.
- **#2, #10 Title and description:** install Rank Math or Yoast and set per post:
  - SEO title: `Independent Hotels Should Think Independently | Uptic` (54 chars)
  - Meta description: `Brands win on consistency. Independent hotels win by being different. Here's why your hotel should stop copying the chains.` (~125 chars)
  - Without a plugin: write a manual Excerpt in the post sidebar; the description is likely built from it — verify in page source.
- **#3 Author alt:** inspect the photo first to see what it is. Image block → set "Alternative text" to `Tariq Khan`. Avatar block → alt comes from the user's display name (Users → Profile).
- **#4 Image filename:** WordPress can't rename media. Re-upload as `independent-hotels-think-independently.png`, set as featured image, delete the old one. Skip if the post was widely shared (old social previews point to the old file).
- **#13 Motion:** macOS System Settings → Accessibility → Display → Reduce motion, reload Home. If both elements stop, the site side is done.
- **Social links:** click each one by hand; the link checker skips them.

**Content and conversion**

- **#5 Evidence:** after the hamburger section, add one real client story — situation, what changed, result (with a number) — and link the case study.
- **#7 Takeaways:** before the close, add "3 ways to act on this":
  - Digital presence: show what only your hotel has, not shared amenities.
  - Revenue: price on what makes you distinctive, not by matching the brand next door.
  - Guest journey: design one moment per stay a chain can't copy.
- **#6 Table:** merge Recognition and Familiarity, drop rows that repeat Discovery; aim for 4–5 rows.
- **#8 Analogy:** keep setup and payoff (~2 paragraphs), cut the health aside.
- **#9 Closing:** add "Tell us on LinkedIn →" with a link, or end on a statement.
- **#11 Proof:** in the Home template, add a logos/number/testimonial row directly under the hero.
- **#12 CTA:** select the button and retype the label.

## Automated results

Run `npm test` and record new findings above.

**Last run: 2026-10-12** — 19 passed, 3 failed (all on the article page; findings #1, #2, #10).

- Passing: canonical, Open Graph, JSON-LD, indexable, axe WCAG 2.2 AA scan, img alt attributes, links, mobile overflow — on both Home and Article.
- Note: axe passed, yet the author photo was flagged as missing alt earlier — verify manually (it may be a CSS background or have an empty `alt=""`).
- Social links (LinkedIn etc.) are skipped by the link checker because they block bots — check them by hand.
