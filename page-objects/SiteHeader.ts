import type { Locator, Page } from '@playwright/test';

export type ServiceItem = 'Digital Presence' | 'Revenue Strategy' | 'Guest Journey';
export type NavItem = 'About Uptic' | ServiceItem | 'Case Studies' | 'Insights';

const SERVICE_ITEMS: readonly NavItem[] = ['Digital Presence', 'Revenue Strategy', 'Guest Journey'];

export class SiteHeader {
  readonly mainNav: Locator;
  readonly servicesToggle: Locator;
  readonly menuButton: Locator;
  readonly mobileDrawer: Locator;

  constructor(private readonly page: Page) {
    this.mainNav = page.getByRole('navigation', { name: 'Main', exact: true });
    // Services is a <details>/<summary> dropdown, not a link.
    this.servicesToggle = this.mainNav.locator('summary', { hasText: 'Services' });
    this.menuButton = page.getByRole('button', { name: 'Menu' });
    this.mobileDrawer = page.locator('#uhn-drawer');
  }

  /** Clicks a desktop nav item, opening the Services dropdown first when needed. */
  async navigateTo(item: NavItem): Promise<void> {
    if (SERVICE_ITEMS.includes(item)) {
      await this.servicesToggle.click();
    }
    // Service links include a description in their accessible name, so match by prefix.
    const link = this.mainNav.getByRole('link', { name: new RegExp(`^${item}`) }).first();
    await Promise.all([this.page.waitForURL((url) => url.pathname !== '/'), link.click()]);
  }

  async openMobileMenu(): Promise<void> {
    await this.menuButton.click();
  }
}
