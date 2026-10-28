import type { Response } from '@playwright/test';
import { BasePage } from './BasePage';

/** Config the `uptic-insights` plugin prints inline for its view counter (views.js). */
export interface ViewTrackingConfig {
  readonly url: string;
  readonly id: string;
  readonly day: string;
  readonly token: string;
}

/** Delay in views.js before a visible article counts as viewed. */
export const VIEW_DELAY_MS = 5_000;

export class ArticlePage extends BasePage {
  async openBySlug(slug: string): Promise<Response | null> {
    return super.open(`/${slug}/`);
  }

  async viewTrackingConfig(): Promise<ViewTrackingConfig> {
    return this.page.evaluate(() => (window as unknown as { upticView: ViewTrackingConfig }).upticView);
  }
}
