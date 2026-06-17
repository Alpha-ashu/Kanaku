import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AdvisorPage extends BasePage {
  // Selectors
  readonly becomeAdvisorBtn: Locator;
  readonly fullNameInput: Locator;
  readonly phoneInput: Locator;
  readonly expertiseInput: Locator;
  readonly experienceInput: Locator;
  readonly bioInput: Locator;
  readonly submitAppBtn: Locator;
  readonly reviewDocsBtn: Locator;
  readonly approveBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.becomeAdvisorBtn = page.getByRole('button', { name: /Become an Advisor/i });
    this.fullNameInput = page.locator('input[placeholder*="legal name" i]');
    this.phoneInput = page.locator('input[placeholder*="+91" i]');
    this.expertiseInput = page.locator('input[placeholder*="Expertise" i]');
    this.experienceInput = page.locator('input[placeholder*="Experience" i]');
    this.bioInput = page.locator('textarea[placeholder*="background" i]');
    this.submitAppBtn = page.getByRole('button', { name: /Submit Application/i });
    this.reviewDocsBtn = page.getByRole('button', { name: /Review Documents/i });
    this.approveBtn = page.getByRole('button', { name: /Approve Advisor/i });
  }

  async clickBecomeAdvisor() {
    await this.becomeAdvisorBtn.first().click();
    await this.wait(800);
  }

  async submitApplication(options: {
    fullName: string;
    phone: string;
    expertise: string;
    experience: string;
    bio: string;
  }) {
    await this.clickBecomeAdvisor();
    await this.fullNameInput.fill(options.fullName);
    await this.phoneInput.fill(options.phone);
    await this.expertiseInput.fill(options.expertise);
    await this.experienceInput.fill(options.experience);
    await this.bioInput.fill(options.bio);

    // Mock document uploads using hidden file inputs (nth(0) for PAN, nth(1) for Aadhaar)
    const panInput = this.page.locator('input[type="file"]').nth(0);
    const aadhaarInput = this.page.locator('input[type="file"]').nth(1);

    // Generate dummy buffer/files
    await panInput.setInputFiles({
      name: 'pan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('dummy pan content')
    });
    await aadhaarInput.setInputFiles({
      name: 'aadhaar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('dummy aadhaar content')
    });
    await this.wait(500);

    await this.submitAppBtn.first().click();
    await this.wait(2000);
  }

  async reviewAndApprove(advisorName: string) {
    // Expecting we are on /manager-advisor-verification page
    const card = this.page.locator('div, article, li').filter({ hasText: advisorName }).first();
    const reviewBtn = card.getByRole('button', { name: /Review Documents/i }).first();
    await reviewBtn.click();
    await this.wait(1000);

    // Click Approve
    await this.approveBtn.first().click();
    await this.wait(2000);
  }

  async assertBookingExists(topicName: string) {
    const pageText = await this.page.textContent('body');
    expect(pageText, `Booking request "${topicName}" should be visible`).toContain(topicName);
  }
}
