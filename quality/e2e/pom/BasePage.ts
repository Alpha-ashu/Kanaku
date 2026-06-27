import { Page, Locator, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { isElementVisible, clickNav, waitForToast, screenshot } from '../helpers';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateTo(label: string) {
    const success = await clickNav(this.page, label);
    if (!success) {
      throw new Error(`Failed to navigate to page: ${label}`);
    }
  }

  async waitForToast(text?: string) {
    await waitForToast(this.page, text);
  }

  async screenshot(name: string) {
    await screenshot(this.page, name);
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  async isVisible(locator: Locator, timeout = 5000): Promise<boolean> {
    return isElementVisible(locator, timeout);
  }
}
