# Manual checks

What the automated suite cannot decide, and why. Run these by hand before a release or every few
months, and log failures in [FINDINGS.md](../FINDINGS.md) like any other finding.

The automated checks are biased towards **no false positives**: they flag only what is certainly
wrong (an alt text that is a file name, a heading level that is skipped, a focused element that
looks exactly like an unfocused one). Everything below needs human judgment.

## Accessibility

| Check | Why it is manual | How |
|---|---|---|
| Alt text describes the image | A tool can see that `alt` exists and is not a file name, not whether it says what the image shows in this context | Read each `alt` next to its image. Content images need a description; a portrait next to a byline should name the person (FINDINGS #3) |
| `alt=""` images are really decorative | The test attaches the list of empty-alt images per page (`decorative-images.json` in the HTML report) but cannot judge them | Open the attachment and look at each image: if removing it loses information, it needs alt text |
| Screen reader announcements | Native validation bubbles and `role="status"` messages are announced differently by each screen reader | VoiceOver (macOS/iOS) and NVDA (Windows): submit the contact form empty and with a bad email, then load `/contact/?uptic_status=sent`; each message must be read out |
| Focus order makes sense | The test checks every Tab stop is on screen and visibly focused, not that the order follows the visual layout | Tab through each page: focus should move left to right, top to bottom, and never into hidden menus |
| Skip link on interior pages | Home has "Skip to content"; article and contact pages do not. WCAG 2.4.1 can also be met with landmarks and headings, so its absence is not automatically a failure | Decide whether interior pages need one; if yes, log it |
| Zoom and text spacing | Reflow at 320 px is automated; 200 % browser zoom and WCAG 1.4.12 text spacing are not | Zoom to 200 % and apply a text-spacing bookmarklet: nothing may be cut off or overlap |
| Contrast over images | axe skips text on background images and gradients | Check hero and card text over photos with a colour picker (4.5:1, 3:1 for large text) |
| Motion | Reduced motion is tested; whether the remaining motion distracts is not (FINDINGS #13) | Turn on the OS "Reduce motion" setting and reload Home |
| Captions and transcripts | Only relevant once video or audio is added | Every video needs captions; audio needs a transcript |

## Security

| Check | Why it is manual | How |
|---|---|---|
| Author slug vs login name | `/?author=1` reveals the author's archive slug (public by WordPress design). The test checks that it no longer derives from an email (FINDINGS #17), but cannot see the login name | wp-admin → Users → Profile: the *Username* must differ from the slug in the author URL |
| Plugin REST namespaces | The REST index lists plugin namespaces (`fluent-smtp`, `litespeed`, `hostinger-tools-plugin`). Calling unknown plugin endpoints could change state, so the suite never does | Review each plugin's routes; confirm write and sensitive routes require a logged-in admin |
| Social links | LinkedIn, Instagram and others block automated requests, so the link checker skips them | Click each one |

## Performance

| Check | Why it is manual | How |
|---|---|---|
| Real-user Core Web Vitals | Lab numbers (`npm run perf`) are a controlled proxy; real users differ | Search Console → Core Web Vitals, or PageSpeed Insights field data (needs enough traffic) |
| INP of real interactions | The lab probe clicks inert text; slow menu or form handlers need a person to use them | Chrome DevTools → Performance: record while opening Services, the mobile menu, and filling in the form |
