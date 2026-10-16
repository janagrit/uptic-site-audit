# Findings & Recommendations — uptichospitality.com

Severity: **High** = hurts conversions/SEO/accessibility now · **Medium** = worth fixing soon · **Low** = polish.
Status: `open` · `reported` · `fixed`

## Summary

Fix first: **the contact form does not work.** Visitors get a cached page whose form has expired, so every inquiry is rejected (finding #20, one setting in LiteSpeed Cache).

Then the three things that matter most:

1. **The article is not set up for Google.** No H1, a 95-character title that gets cut off in search results, and a meta description that ends mid-sentence. All three are quick fixes in WordPress (findings #1, #2, #10).
2. **There is no proof.** No numbers, no case study, no client story anywhere in the article. For a company that sells marketing to hotels, one real result would do more than any other single change here (finding #5).
3. **The article gives the reader nothing to do next.** No takeaways, and a closing question with no comments section. End with one clear step (findings #7, #9).

Start with #1, #2 and #10 (about 15 minutes in WordPress), then #5.


## Platform

- WordPress 7.1.3, theme Twenty Twenty-Five (block theme), custom plugin `uptic-insights`
- PHP 8.3, served via `hcdn` (likely Hostinger CDN)
- SEO plugin: Slim SEO (in the REST namespaces). Its per-post meta box sets the title and description; until filled, it falls back to "post title – Uptic Hospitality" and a word-truncated description
- CSS already contains `prefers-reduced-motion` rules

## Technical / SEO

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 1 | Article | No `<h1>`; article title is an `<h2>` | High | Set the Post Title block to H1 in the single-post template. Why it matters: the H1 is how Google and screen readers know what the page is about | open |
| 2 | Article | Meta description truncated mid-sentence ("…something the brands can") | Medium | Write a custom ≤155-char description that ends cleanly. Why it matters: this text is the ad for the page in Google results, and a sentence cut in half reads careless and costs clicks | open |
| 3 | Article | Author photo has no `alt` | Medium | Add `alt="Tariq Khan"` | open |
| 4 | Article | OG image filename typo `Image_psot_6.png` | Low | Rename to a descriptive slug, e.g. `independent-hotels-think-independently.png` | open |
| 10 | Article | `<title>` is 95 chars; Google truncates around 60 | Medium | Use an SEO title like "Independent Hotels Should Think Independently \| Uptic". Why it matters: a truncated title gets fewer clicks from search | open |
| 11 | Home | No search box outside the results page | Low | Add a Search block to the header or footer, or drop search entirely | open |
| 12 | Search | Results template renders full post content instead of excerpts | Medium | In the Search template, replace Post Content with Post Excerpt | open |
| 16 | Article | Comparison table's "Branded Hotel" labels fail contrast: sage `#8D9B87` on ivory `#F6F2E7` at 11px = 2.62:1 (needs 4.5:1), 8 elements | Medium | Use the palette's `--muted` `#4E5E55` (6.14:1) for those labels | open |
| 17 | Site | REST API lists user accounts publicly (`/wp-json/wp/v2/users`), exposing the admin login slug `tariqkhanoutlook-com` | High | Restrict the users endpoint to logged-in users (security plugin setting or a `rest_endpoints` filter), and change the author slug so it no longer derives from an email address | open |
| 18 | Site | No baseline security headers: HSTS, `X-Content-Type-Options: nosniff`, framing protection | Medium | Add them at the host/CDN or via `.htaccess`: `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'self'` | open |
| 19 | Site | Header and its navigation (desktop and mobile) are injected by JavaScript; with JS blocked or failing, only the footer links remain | Low | Render the header nav in the block template (Navigation block) and let the script only enhance it | open |
| 20 | Contact | **The contact form cannot be sent.** The page cache (LiteSpeed, `hcdn`) serves `/contact/` as stored HTML ~41–45 h old (`x-litespeed-cache: hit`, `age: 146947–163581`), so the form's security nonce is past its 24 h lifetime. Every submit is rejected with "This form has expired. Refresh the page and try again", and refreshing serves the same cached page. Confirmed by one test inquiry on 2026-10-15 | High | Exclude `/contact/` from the LiteSpeed page cache (or render the nonce via ESI), then purge the cache. Why it matters: this is the site's only lead form, and right now visitors who use it get an error | open |
| 13 | Home | Glowing background and 01–04 strip appear to animate; also makes visual baselines flaky | Low | Confirm motion stops with OS "Reduce motion" on; mask the strip in the visual test | open |

## Content

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 5 | Article | No concrete evidence (data, case, guest story) | High | Add one real "wow moment" from a client hotel; link a case study. Why it matters: hotels buy results, and one concrete outcome is what turns a reader into a call | open |
| 6 | Article | Comparison table has 8 rows with overlap (Recognition/Familiarity vs. Discovery) | Medium | Cut to 4–5 distinct rows | open |
| 7 | Article | No actionable takeaways | Medium | Add "3 ways to act on this" mapped to Digital Presence / Revenue / Guest Journey. Why it matters: a reader who leaves with a next step is far more likely to return or make contact | open |
| 8 | Article | Hamburger analogy runs ~5 paragraphs; health aside distracts | Low | Tighten to 2 paragraphs | open |
| 9 | Article | Closing question but no comments section | Low | Point readers to LinkedIn/email for replies, or drop the question | open |
| 14 | Home | No proof above the fold (logos, numbers, testimonial) | High | Add one row under the hero: 4–6 client logos, one headline number, or a one-line testimonial | open |
| 15 | Home | Hero CTA "Discover more" is vague | Medium | Use a specific label: "See how we work" (scrolls) or "View case studies" (links) | open |

## How to fix

All fixes are made in WordPress admin, not in this repo.

**Technical**

- **#1 H1:** Appearance → Editor → Templates → Single Posts → select Post Title → change level to H1 → Save. Applies to every post. The three `h2.uf-heading` come from a plugin and can stay H2.
- **#2, #10 Title and description:** Slim SEO is already installed. Open the post, scroll to the Slim SEO box under the editor, and set:
  - SEO title: `Independent Hotels Should Think Independently | Uptic` (54 chars)
  - Meta description: `Brands win on consistency. Independent hotels win by being different. Here's why your hotel should stop copying the chains.` (~125 chars)
- **#3 Author alt:** inspect the photo first to see what it is. Image block → set "Alternative text" to `Tariq Khan`. Avatar block → alt comes from the user's display name (Users → Profile).
- **#4 Image filename:** WordPress can't rename media. Re-upload as `independent-hotels-think-independently.png`, set as featured image, delete the old one. Skip if the post was widely shared (old social previews point to the old file).
- **#11 Search box:** Appearance → Editor → Patterns → Header → add a Search block (or remove the search feature if it isn't wanted).
- **#12 Search results:** Appearance → Editor → Templates → Search Results → select Post Content inside the query loop → replace it with Post Excerpt.
- **#13 Motion:** macOS System Settings → Accessibility → Display → Reduce motion, reload Home. If both elements stop, the site side is done.
- **#16 Table label contrast:** in the comparison table's custom CSS, change the "Branded Hotel" label colour from `#8D9B87` (sage) to `#4E5E55` (the palette's `--muted`).
- **#17 User enumeration:** with a security plugin (e.g. Solid Security, Wordfence) enable "disable REST API user listing", or add a small snippet that unsets `/wp/v2/users` for logged-out visitors. Then Users → Profile → change the nickname/slug so it is not an email address.
- **#18 Security headers:** add the three headers in the hosting panel's header settings, or in `.htaccess` with `Header always set …`. Check with https://securityheaders.com afterwards.
- **#20 Contact form expired:** LiteSpeed Cache → Cache → Excludes → "Do Not Cache URIs" → add `/contact/` → Save, then Toolbox → Purge All. If the host's CDN (`hcdn`) caches separately, purge it in the hosting panel too. Check: `curl -sI https://uptichospitality.com/contact/` should show no `x-litespeed-cache: hit` and no `age`.
- **#19 Header without JS:** a developer task: move the nav markup from the header script into the theme's Header template part.
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
- **#14 Proof:** in the Home template, add a logos/number/testimonial row directly under the hero.
- **#15 CTA:** select the button and retype the label.

## Automated results

Run `npm test` and record new findings above.

**Last run: 2026-10-16** — 80 tests: 70 passed, 10 known site defects still present (#1, #2, #10, #11, #12, #16, #17, #18, #19, #20), none fixed, no new failures, baseline check passed.

- Passing: canonical, Open Graph, JSON-LD, indexable, axe WCAG 2.2 AA scan, img alt attributes, links, mobile overflow — on both Home and Article.
- Note: axe passed, yet the author photo was flagged as missing alt earlier — verify manually (it may be a CSS background or have an empty `alt=""`).
- Social links (LinkedIn etc.) are skipped by the link checker because they block bots — check them by hand.
- axe runs with reduced motion: the site fades sections in on scroll, which gave false contrast failures mid-fade and hid unrevealed text from axe. With motion off, the article's table labels fail for real (#16).
