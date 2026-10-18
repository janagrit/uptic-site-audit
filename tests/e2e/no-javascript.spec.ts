import { test, expect, knownBug } from '../../fixtures';

// If the JS bundle fails or is blocked, visitors must still read the page, move around and reach out.
const KEY_PAGES: readonly string[] = ['/about-uptic/', '/case-studies/', '/insights/', '/contact/'];

test.describe('E2E — Without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('home shows its headline', async ({ homePage }) => {
    await homePage.open();

    await expect(homePage.heroHeading).toBeVisible();
  });

  test('home still links to every key page', async ({ homePage, page }) => {
    await homePage.open();

    for (const path of KEY_PAGES) {
      await expect(page.locator(`a[href$="${path}"]`).first(), `no link to ${path}`).toBeVisible();
    }
  });

  test('home renders the header navigation', knownBug('FINDINGS #19: header and its navigation are injected by JavaScript'), async ({ homePage, siteHeader }) => {
    await homePage.open();

    await expect(siteHeader.mainNav).toBeVisible();
  });

  test('contact form is complete and posts without scripts', async ({ contactPage }) => {
    await contactPage.open();

    await expect(contactPage.form).toHaveAttribute('method', 'post');
    await expect(contactPage.form).toHaveAttribute('action', /\/wp-admin\/admin-post\.php$/);
    for (const field of [contactPage.nameInput, contactPage.hotelInput, contactPage.emailInput, contactPage.messageInput]) {
      await expect(field).toBeVisible();
    }
    await expect(contactPage.submitButton).toBeVisible();
  });
});
