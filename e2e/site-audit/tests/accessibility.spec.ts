import AxeBuilder from '@axe-core/playwright';
import { test, expect, expectKnownIssue } from '../fixtures';
import { altTextProblem, decorativeImageProblem, fieldName, headingLevels, headingOrderProblems, imageFacts, walkTabOrder } from '../audits/accessibility';
import { PAGES } from '../targets';

// WCAG 2.2 AA = every A and AA criterion from 2.0, 2.1 and 2.2.
const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
/** axe rules for WCAG 4.1.2 / 2.4.4 / 3.3.2: every control has an accessible name. */
const NAME_RULES = ['button-name', 'link-name', 'input-button-name', 'label', 'select-name', 'aria-command-name', 'aria-input-field-name', 'summary-name', 'frame-title'];
/** Enough Tab presses to pass the header and reach the main content on every audited page. */
const MAX_TAB_STOPS = 40;

// What these tests cannot judge (does an alt text describe its image, is an alt="" image really
// decorative, does a screen reader announce errors) is listed in docs/MANUAL-CHECKS.md.

for (const target of PAGES) {
  test.describe(`Accessibility — ${target.name}`, () => {
    // The home page fades sections in on scroll (opacity 0 → 1) unless reduced motion is on.
    // Mid-fade text gives axe false contrast failures, and unrevealed text is skipped entirely,
    // so audit the final, resting page.
    test.use({ reducedMotion: 'reduce' });

    test.beforeEach(async ({ basePage }) => {
      await basePage.open(target.path);
    });

    test('no WCAG 2.2 AA violations (axe)', async ({ page }) => {
      expectKnownIssue(target, 'axe');
      const results = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();

      const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} element(s))`);
      expect(results.violations, summary.join('\n')).toEqual([]);
    });

    test('BUG-R2 regression: audits run with reduced motion', async ({ page }) => {
      const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

      expect(reduced, 'axe would measure mid-fade text again').toBe(true);
    });

    test('every image has alt text', async ({ page }) => {
      const missing = await page.locator('img:not([alt])').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src));
      expect(missing, `images without alt:\n${missing.join('\n')}`).toEqual([]);
    });

    test('image alt text is not a file name or placeholder', async ({ page }) => {
      expectKnownIssue(target, 'image-alt-quality');
      const images = await imageFacts(page);

      const problems = images.flatMap(({ alt, src }) => {
        const problem = alt ? altTextProblem(alt, src) : null;
        return problem ? [`alt="${alt}" ${problem} (${src})`] : [];
      });
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('decorative images are marked consistently', async ({ page }, testInfo) => {
      const images = await imageFacts(page);
      // Evidence for the manual review: which images claim to be decorative.
      const decorative = images.filter((image) => image.alt === '').map((image) => image.src);
      await testInfo.attach('decorative-images.json', { body: JSON.stringify(decorative, null, 2), contentType: 'application/json' });

      const problems = images.flatMap((image) => {
        const problem = decorativeImageProblem(image);
        return problem ? [`${problem} (${image.src})`] : [];
      });
      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('every interactive element has an accessible name', async ({ page }) => {
      const results = await new AxeBuilder({ page }).withRules(NAME_RULES).analyze();

      const unnamed = results.violations.flatMap((v) => v.nodes.map((node) => `${v.id}: ${node.target.join(' ')}`));
      expect(unnamed, unnamed.join('\n')).toEqual([]);
    });

    test('headings descend one level at a time from a single h1', async ({ page }) => {
      expectKnownIssue(target, 'heading-order');
      const problems = headingOrderProblems(await headingLevels(page));

      expect(problems, problems.join('\n')).toEqual([]);
    });

    test('keyboard: Tab moves through the page and every stop shows focus', async ({ page }) => {
      expectKnownIssue(target, 'focus-visible');
      const stops = await walkTabOrder(page, MAX_TAB_STOPS);

      expect(stops.length, 'Tab reaches no focusable element').toBeGreaterThan(0);
      const offscreen = stops.filter((stop) => !stop.inViewport).map((stop) => stop.description);
      const noIndicator = stops.filter((stop) => !stop.focusIndicator).map((stop) => stop.description);
      expect.soft(offscreen, `focused but off screen (WCAG 2.4.11):\n${offscreen.join('\n')}`).toEqual([]);
      expect.soft(noIndicator, `no visible focus indicator (WCAG 2.4.7):\n${noIndicator.join('\n')}`).toEqual([]);
    });
  });
}

test.describe('Accessibility — Contact form', () => {
  test.use({ reducedMotion: 'reduce' });

  test.beforeEach(async ({ contactPage }) => {
    await contactPage.open();
  });

  test('every visible field has a programmatic label', async ({ contactPage }) => {
    // Hidden inputs and the aria-hidden honeypot are not for people.
    const fields = contactPage.form.locator('input:not([type="hidden"]), textarea, select').filter({ visible: true });
    const count = await fields.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const field = fields.nth(i);
      if (await field.evaluate((el) => el.closest('[aria-hidden="true"]') !== null)) continue;
      expect.soft(await fieldName(field), `field ${await field.getAttribute('name')} has no label`).not.toBe('');
    }
  });

  test('required fields are required in code and marked in their label', async ({ contactPage }) => {
    for (const field of [contactPage.nameInput, contactPage.hotelInput, contactPage.emailInput, contactPage.messageInput]) {
      const name = await field.getAttribute('name');
      await expect.soft(field, `${name} is not required in code`).toHaveJSProperty('required', true);
      expect.soft(await fieldName(field), `${name}: label does not say it is required`).toMatch(/\*|required/i);
    }
  });

  test('an invalid submit moves focus to the first invalid field and explains the error', async ({ page, contactPage, blockedWrites }) => {
    await contactPage.submit();

    await expect(contactPage.nameInput).toBeFocused();
    expect(await contactPage.nameInput.evaluate((el) => (el as HTMLInputElement).validationMessage)).not.toBe('');
    expect(blockedWrites, 'an invalid form must not even try to submit').toEqual([]);
    await expect(page).toHaveURL(/\/contact\/$/);
  });

  test('server responses are announced in a live region', async ({ basePage, contactPage }) => {
    // The handler redirects to ?uptic_status=…; a GET of that URL renders the message (read-only).
    await basePage.open('/contact/?uptic_status=invalid#uptic-contact-page');

    await expect(contactPage.status).toHaveText(/valid email address/);
    const live = await contactPage.status.evaluate((el) => ({ role: el.getAttribute('role'), live: el.getAttribute('aria-live') }));
    expect(['status', 'alert'].includes(live.role ?? '') || ['polite', 'assertive'].includes(live.live ?? ''), JSON.stringify(live)).toBe(true);
  });
});
