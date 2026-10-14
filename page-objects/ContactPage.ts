import type { Locator, Page, Response } from '@playwright/test';
import { BasePage } from './BasePage';

export type InquiryService = 'Digital Presence' | 'Revenue Strategy' | 'Guest Journey' | 'Not sure yet';

export interface Inquiry {
  readonly name: string;
  readonly hotel: string;
  readonly email: string;
  readonly website?: string;
  readonly services?: readonly InquiryService[];
  readonly message: string;
}

export class ContactPage extends BasePage {
  readonly form: Locator;
  readonly nameInput: Locator;
  readonly hotelInput: Locator;
  readonly emailInput: Locator;
  readonly websiteInput: Locator;
  readonly messageInput: Locator;
  readonly submitButton: Locator;
  readonly status: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('form.cp-form');
    this.nameInput = this.form.getByLabel('Your name');
    this.hotelInput = this.form.getByLabel('Hotel / property');
    this.emailInput = this.form.getByLabel('Email address');
    this.websiteInput = this.form.getByLabel('Hotel website');
    this.messageInput = this.form.getByLabel('What would you like to improve?');
    // Not matched by name: the label switches to "Sending…" while submitting.
    this.submitButton = this.form.locator('button[type="submit"]');
    this.status = page.locator('#uptic-contact-page .cp-status');
  }

  async open(): Promise<Response | null> {
    return super.open('/contact/');
  }

  async fill(inquiry: Inquiry): Promise<void> {
    await this.nameInput.fill(inquiry.name);
    await this.hotelInput.fill(inquiry.hotel);
    await this.emailInput.fill(inquiry.email);
    await this.websiteInput.fill(inquiry.website ?? '');
    for (const service of inquiry.services ?? []) {
      await this.form.getByRole('checkbox', { name: service }).check();
    }
    await this.messageInput.fill(inquiry.message);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
