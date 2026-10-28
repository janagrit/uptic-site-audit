import type { Locator, Page, Response } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  readonly heroHeading: Locator;
  readonly contactCta: Locator;

  constructor(page: Page) {
    super(page);
    this.heroHeading = page.getByRole('heading', { level: 1 });
    this.contactCta = page.getByRole('link', { name: /Start a conversation/ }).first();
  }

  async open(): Promise<Response | null> {
    return super.open('/');
  }
}
