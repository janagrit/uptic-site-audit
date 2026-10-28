# Findings & Recommendations — uptichospitality.com

Severity: **High** = hurts conversions/SEO/accessibility now · **Medium** = worth fixing soon · **Low** = polish.
Status: `open` · `reported` · `fixed`

## Summary

**Fixed 2026-10-17/18:** the contact form works again (#20); the article now has an H1, a clean title and description (#1, #2, #10); table contrast (#16); search excerpts (#12); the public user list and security headers (#17, #18); the redesigned search page now says "Nothing matched that search" (#21).

What matters most now:

1. **There is no proof.** No numbers or client results anywhere in the article. For a company that sells marketing to hotels, one real result would be the strongest single fix (finding #5).
2. **The article gives the reader nothing to do next.** No takeaways, and a closing question with no comments section. End with one clear step (findings #7, #9).

Next: #5, #14 and #7 (content), then #11 and #19.


## Platform

- WordPress 7.1.3, theme Twenty Twenty-Five (block theme), custom plugin `uptic-insights`
- PHP 8.3, served via `hcdn` (likely Hostinger CDN)
- SEO plugin: Slim SEO (in the REST namespaces). Its per-post meta box sets the title and description; until filled, it falls back to "post title – Uptic Hospitality" and a word-truncated description
- CSS already contains `prefers-reduced-motion` rules
- Since 2026-10-28 the CDN (`hcdn`) has a firewall that answers `403 Forbidden` (plain text) to queries with event handlers or `<img>`/`<svg>` tags, e.g. `/?s="><img src=x onerror=…>`, before WordPress sees them. Plain markup such as `<b>` still reaches WordPress, which escapes it. This is fine; the search tests accept the 403 and test escaping with plain markup

## Technical / SEO

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 1 | Article | No `<h1>`; article title is an `<h2>` | High | Set the Post Title block to H1 in the single-post template | fixed (2026-10-17) |
| 2 | Article | Meta description truncated mid-sentence ("…something the brands can") | Medium | Write a custom ≤155-char description that ends cleanly. Why it matters: this text is the ad for the page in Google results, and a sentence cut in half reads careless and costs clicks | fixed (2026-10-17) |
| 3 | Article | Author photo has no `alt` (it is an Image block, `Profile_image-150x150.png`, with `alt=""`, so axe treats it as decorative and passes; checked 2026-10-28) | Medium | Add `alt="Tariq Khan"` | open |
| 4 | Article | OG image filename typo `Image_psot_6.png` | Low | Rename to a descriptive slug, e.g. `independent-hotels-think-independently.png` | open |
| 10 | Article | `<title>` is 95 chars; Google truncates around 60 | Medium | Use an SEO title like "Independent Hotels Should Think Independently \| Uptic" | fixed (2026-10-17) |
| 11 | Home | No search box on the home page. Partly fixed 2026-10-28: article pages now have one (Search block above the footer), the home page still has none | Low | Add the same Search block to the Home template, or drop search entirely | open |
| 12 | Search | Results template renders full post content instead of excerpts | Medium | In the Search template, replace Post Content with Post Excerpt | fixed (2026-10-17) |
| 16 | Article | Comparison table's "Branded Hotel" labels fail contrast: sage `#8D9B87` on ivory `#F6F2E7` at 11px = 2.62:1 (needs 4.5:1), 8 elements | Medium | Use the palette's `--muted` `#4E5E55` (6.14:1) for those labels | fixed (2026-10-17) |
| 17 | Site | REST API lists user accounts publicly (`/wp-json/wp/v2/users`), exposing the admin login slug `tariqkhanoutlook-com` | High | Restrict the users endpoint to logged-in users (security plugin setting or a `rest_endpoints` filter), and change the author slug so it no longer derives from an email address | fixed (2026-10-18) |
| 18 | Site | No baseline security headers: HSTS, `X-Content-Type-Options: nosniff`, framing protection | Medium | Add them at the host/CDN or via `.htaccess`: `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'self'` | fixed (2026-10-18) |
| 19 | Site | Header and its navigation (desktop and mobile) are injected by JavaScript; with JS blocked or failing, only the footer links remain | Low | Render the header nav in the block template (Navigation block) and let the script only enhance it | open |
| 20 | Contact | The contact form could not be sent. The page cache (LiteSpeed, `hcdn`) serves `/contact/` as stored HTML ~41–45 h old (`x-litespeed-cache: hit`, `age: 146947–163581`), so the form's security nonce is past its 24 h lifetime. Every submit is rejected with "This form has expired. Refresh the page and try again", and refreshing serves the same cached page. Confirmed by one test inquiry on 2026-10-15 | High | Exclude `/contact/` from the LiteSpeed page cache (or render the nonce via ESI), then purge the cache. Why it matters: this is the site's only lead form, and right now visitors who use it get an error | fixed (2026-10-18) |
| 21 | Search | A search with no matches shows no message: only the heading, the search box and a "More posts" list of recent articles, which reads as if those were the matches. The template's "No results" block is gone (likely removed while fixing #12); seen 2026-10-17 | Medium | Add a "No results" block back inside the Search Results query loop, e.g. "Nothing matched your search. Try another word, or browse the articles below." | fixed (2026-10-18) |
| 13 | Home | Glowing background and 01–04 strip appear to animate; also makes visual baselines flaky | Low | Confirm motion stops with OS "Reduce motion" on; mask the strip in the visual test | open |

## Content

| # | Page | Finding | Severity | Recommendation | Status |
|---|------|---------|----------|----------------|--------|
| 5 | Article | No concrete evidence (data, case, guest story) | High | Add one real "wow moment" from a client hotel; link a case study. Why it matters: hotels buy results, and a reader who sees a real one is more likely to call | open |
| 6 | Article | Comparison table has 8 rows with overlap (Recognition/Familiarity vs. Discovery) | Medium | Cut to 4–5 distinct rows | open |
| 7 | Article | No actionable takeaways | Medium | Add "3 ways to act on this" mapped to Digital Presence / Revenue / Guest Journey. Why it matters: a next step gives the reader a reason to come back or get in touch | open |
| 8 | Article | Hamburger analogy runs ~5 paragraphs; health aside distracts | Low | Tighten to 2 paragraphs | open |
| 9 | Article | Closing question but no comments section. Since 2026-10-28 a "Request your free first look" box follows it, but the question itself still has nowhere to be answered | Low | Point readers to LinkedIn/email for replies, or drop the question | open |
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
- **#11 Search box:** article pages already have a Search block above the footer. Appearance → Editor → Templates → Home (or Front Page) → add the same Search block in the same place (or remove the search feature if it isn't wanted).
- **#12 Search results:** Appearance → Editor → Templates → Search Results → select Post Content inside the query loop → replace it with Post Excerpt.
- **#21 No-results message:** Appearance → Editor → Templates → Search Results → select the Query Loop → add the "No results" block inside it → type the message → Save. Check: `/?s=zzqxnomatch` should show the message.
- **#13 Motion:** macOS System Settings → Accessibility → Display → Reduce motion, reload Home. If both elements stop, the site side is done.
- **#16 Table label contrast:** in the comparison table's custom CSS, change the "Branded Hotel" label colour from `#8D9B87` (sage) to `#4E5E55` (the palette's `--muted`).
- **#17 User enumeration:** with a security plugin (e.g. Solid Security, Wordfence) enable "disable REST API user listing", or add a small snippet that unsets `/wp/v2/users` for logged-out visitors. Then Users → Profile → change the nickname/slug so it is not an email address.
- **#18 Security headers:** add the three headers in the hosting panel's header settings, or in `.htaccess` with `Header always set …`. Check with https://securityheaders.com afterwards.
- **#20 Contact form expired:** LiteSpeed Cache → Cache → Excludes → "Do Not Cache URIs" → add `/contact/` → Save, then Toolbox → Purge All. If the host's CDN (`hcdn`) caches separately, purge it in the hosting panel too. Check: `curl -sI https://uptichospitality.com/contact/` should show no `x-litespeed-cache: hit` and no `age`.
- **#19 Header without JS:** a developer task: move the nav markup from the header script into the theme's Header template part.
- **Social links:** click each one by hand; the link checker skips them.

**Content and conversion**

- **#5 Evidence:** after the hamburger section, add one real client story (situation, what changed, result with a number) and link the case study.
- **#7 Takeaways:** before the close, add "3 ways to act on this":
  - Digital presence: show what only your hotel has.
  - Revenue: price on what makes you distinctive.
  - Guest journey: design one moment per stay a chain can't copy.
- **#6 Table:** merge Recognition and Familiarity, drop rows that repeat Discovery; aim for 4–5 rows.
- **#8 Analogy:** keep setup and payoff (~2 paragraphs), cut the health aside.
- **#9 Closing:** add "Tell us on LinkedIn →" with a link, or end on a statement.
- **#14 Proof:** in the Home template, add a logos/number/testimonial row directly under the hero.
- **#15 CTA:** select the button and retype the label.

## Automated results

Run `npm test` and record new findings above. A test for an open finding calls `knownBug()` (`test.fail`): it counts as a known bug while the finding is open and turns red once the site is fixed.

**Last run: 2026-10-28:** 82 tests: 80 passed, 2 known bugs (#11, #19), 0 new failures. The first run that day had 1 new failure: the CDN firewall now blocks the script-like search probe with a 403 (see Platform). The test now accepts the 403, and a new test checks WordPress's escaping with plain markup. #11 is partly fixed (article pages have search; new test). Checked by hand, still open: #3, #4, #5, #6, #7, #8, #9, #14, #15.

**Previous run: 2026-10-18 (2nd):** 80 tests: 78 passed, 2 known bugs (#11, #19), 0 new failures.

- Passing: canonical, Open Graph, JSON-LD, indexable, axe WCAG 2.2 AA scan, img alt attributes, links, mobile overflow, on both Home and Article.
- Note: axe passes even though the author photo has no meaningful alt. It has an empty `alt=""` (verified 2026-10-28), which axe treats as decorative (#3).
- Social links (LinkedIn etc.) are skipped by the link checker because they block bots. Check them by hand.
- axe runs with reduced motion: the site fades sections in on scroll, which gave false contrast failures mid-fade and hid unrevealed text from axe. With motion off, the article's table labels failed for real (#16, fixed 2026-10-17).
