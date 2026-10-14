import { test, expect } from '../../fixtures';
import { ADMIN_POST, CONTACT_ACTION, formBody } from '../../network/endpoints';
import { interceptAction } from '../../network/mocks';
import type { Inquiry } from '../../page-objects/ContactPage';

// The form posts to production's admin-post.php, so every test intercepts it. Nothing is ever sent.
const INQUIRY: Inquiry = {
  name: 'Playwright Test',
  hotel: 'Test Hotel (automated)',
  email: 'qa@example.com',
  website: 'example.com',
  services: ['Digital Presence', 'Guest Journey'],
  message: 'Automated test inquiry. Intercepted by the test suite and never delivered.',
};

test.describe('E2E — Contact form', () => {
  test.beforeEach(async ({ contactPage }) => {
    await contactPage.open();
  });

  test('posts every field, the nonce and an empty honeypot to admin-post', async ({ page, contactPage }) => {
    const inquiry = await interceptAction(page, ADMIN_POST, CONTACT_ACTION);

    await contactPage.fill(INQUIRY);
    await contactPage.submit();

    await expect.poll(() => inquiry.requests.length).toBe(1);
    const body = formBody(inquiry.requests[0]);
    expect(Object.fromEntries(body)).toMatchObject({
      action: CONTACT_ACTION,
      contact_name: INQUIRY.name,
      hotel: INQUIRY.hotel,
      email: INQUIRY.email,
      website: INQUIRY.website,
      message: INQUIRY.message,
      uptic_company_fax: '',
    });
    expect(body.getAll('services[]')).toEqual(INQUIRY.services);
    expect(body.get('uptic_nonce')).toMatch(/^[0-9a-f]{10}$/);
    expect(body.get('return_url')).toMatch(/\/contact\/$/);
  });

  test('locks the button and shows "Sending…" on submit', async ({ page, contactPage }) => {
    // The submit is a full-page POST navigation, during which Playwright cannot query the old page.
    // So read the button from inside the page: a window listener runs right after the site's form handler.
    const states: { disabled: boolean; text: string }[] = [];
    await page.exposeFunction('__recordSubmitButton', (state: { disabled: boolean; text: string }) => states.push(state));
    await page.evaluate(() => {
      window.addEventListener('submit', (event) => {
        const button = (event.target as HTMLFormElement).querySelector<HTMLButtonElement>('button[type="submit"]');
        (window as unknown as { __recordSubmitButton: (s: object) => void }).__recordSubmitButton({
          disabled: button?.disabled ?? false,
          text: button?.textContent?.trim() ?? '',
        });
      });
    });
    await interceptAction(page, ADMIN_POST, CONTACT_ACTION);
    await expect(contactPage.submitButton).toHaveText(/Request your free first look/);

    await contactPage.fill(INQUIRY);
    await contactPage.submit();

    await expect.poll(() => states).toEqual([{ disabled: true, text: 'Sending…' }]);
  });

  test('blocks submission when required fields are empty', async ({ page, contactPage, blockedWrites }) => {
    const inquiry = await interceptAction(page, ADMIN_POST, CONTACT_ACTION);

    await contactPage.submit();

    await expect(contactPage.nameInput).toHaveJSProperty('validity.valueMissing', true);
    await expect(page).toHaveURL(/\/contact\/$/);
    expect(inquiry.requests).toHaveLength(0);
    expect(blockedWrites).toHaveLength(0);
  });

  test('blocks submission with an invalid email address', async ({ page, contactPage }) => {
    const inquiry = await interceptAction(page, ADMIN_POST, CONTACT_ACTION);

    await contactPage.fill({ ...INQUIRY, email: 'not-an-email' });
    await contactPage.submit();

    await expect(contactPage.emailInput).toHaveJSProperty('validity.typeMismatch', true);
    expect(inquiry.requests).toHaveLength(0);
  });

  test('re-enables the button when the user comes back after a failed submit', async ({ contactPage }) => {
    // After a server error the user presses Back and the browser restores the page from the
    // back/forward cache, button still locked. Playwright disables that cache, so replay the
    // events instead: a synthetic submit runs the site's handler without navigating, then a
    // persisted pageshow is what a cache restore fires.
    await contactPage.fill(INQUIRY);
    await contactPage.form.evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
    await expect(contactPage.submitButton).toBeDisabled();

    await contactPage.form.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

    await expect(contactPage.submitButton).toBeEnabled();
    await expect(contactPage.submitButton).toHaveText(/Request your free first look/);
  });

  test('keeps the spam honeypot out of sight and out of the tab order', async ({ contactPage }) => {
    const trapWrapper = contactPage.form.locator('.cp-trap');

    await contactPage.honeypot.scrollIntoViewIfNeeded();

    await expect(contactPage.honeypot).not.toBeInViewport();
    await expect(contactPage.honeypot).toHaveAttribute('tabindex', '-1');
    await expect(trapWrapper).toHaveAttribute('aria-hidden', 'true');
  });

  test('shows a confirmation after a successful submit', async () => {
    test.fixme(true, 'Needs the real success redirect (URL/params) from admin-post.php; capture it from one consented live submission, then mock it here.');
  });
});
