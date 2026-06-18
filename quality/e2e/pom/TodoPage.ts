import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class TodoPage extends BasePage {
  // Selectors
  readonly createListBtn: Locator;
  readonly listNameInput: Locator;
  readonly shareMemberInput: Locator;
  readonly saveListBtn: Locator;
  readonly addTaskBtn: Locator;
  readonly taskTitleInput: Locator;
  readonly taskSubmitBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.createListBtn = page.getByRole('button', { name: /create list|new list|\+ list|add list/i });
    this.listNameInput = page.locator('input[name="name"], input[name="title"], input[placeholder*="list" i], input[placeholder*="name" i]');
    this.shareMemberInput = page.locator('input[placeholder*="share" i], input[placeholder*="member" i], input[placeholder*="invite" i], input[placeholder*="email" i]');
    this.saveListBtn = page.locator('div.fixed button').filter({ hasText: /create list/i });
    this.addTaskBtn = page.getByRole('button', { name: /Add Task|Add First Task/i });
    this.taskTitleInput = page.locator('[data-testid="tododetail-new-title-input"], input[placeholder*="done" i], input[placeholder*="task" i]');
    this.taskSubmitBtn = page.locator('[data-testid="tododetail-add-task-submit-button"], button:has-text("Add Task")');
  }

  async clickCreateList() {
    await this.createListBtn.first().click();
    await this.wait(800);
  }

  async createPersonalList(name: string) {
    await this.clickCreateList();
    await this.listNameInput.first().fill(name);
    
    const submitBtn = this.saveListBtn.first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      const saveBtn = this.page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
      await saveBtn.click();
    }
    await this.wait(2000);
  }

  async createSharedList(name: string, inviteEmail: string) {
    await this.clickCreateList();
    await this.listNameInput.first().fill(name);
    if (await this.shareMemberInput.first().isVisible()) {
      await this.shareMemberInput.first().fill(inviteEmail);
      await this.shareMemberInput.first().press('Enter');
      await this.wait(400);
    }

    const submitBtn = this.saveListBtn.first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      const saveBtn = this.page.locator('button:not([disabled])').filter({ hasText: /create list|save|confirm/i }).first();
      await saveBtn.click();
    }
    await this.wait(2000);
  }

  async openList(name: string) {
    const listTitle = this.page.getByText(name).first();
    await listTitle.waitFor({ state: 'visible', timeout: 10000 });
    
    const listCard = this.page.locator('div, article, li').filter({ hasText: name })
      .filter({ has: this.page.getByRole('button', { name: /^open$/i }) }).first();
    const openBtn = listCard.getByRole('button', { name: /^open$/i }).first();
    
    if (await openBtn.isVisible()) {
      await openBtn.click();
    } else {
      await listTitle.click();
    }

    await this.addTaskBtn.first().waitFor({ state: 'visible', timeout: 12000 });
    await this.wait(1000);
  }

  async addTask(title: string) {
    await this.addTaskBtn.first().click();
    await this.wait(400);
    await this.taskTitleInput.first().fill(title);
    await this.taskSubmitBtn.last().click();
    await this.wait(1000);
  }

  async toggleTaskCompletion() {
    const markAsDone = this.page.getByRole('button', { name: 'Mark as done' }).first();
    const markAsActive = this.page.getByRole('button', { name: 'Mark as active' }).first();

    if (await markAsDone.isVisible()) {
      await markAsDone.click();
    } else if (await markAsActive.isVisible()) {
      await markAsActive.click();
      await this.page.getByRole('button', { name: 'Mark as done' }).first().waitFor({ state: 'visible', timeout: 5000 });
      await this.page.getByRole('button', { name: 'Mark as done' }).first().click();
    } else {
      throw new Error('No checkbox/complete button found for tasks');
    }
    await this.page.getByRole('button', { name: 'Mark as active' }).first().waitFor({ state: 'visible', timeout: 5000 });
    await this.wait(1000);
  }

  async assertListExists(name: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `List "${name}" should exist`).toContain(name);
  }

  async assertTaskExists(title: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Task "${title}" should exist inside list`).toContain(title);
  }
}
