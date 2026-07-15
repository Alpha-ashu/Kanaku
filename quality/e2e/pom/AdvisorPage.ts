import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AdvisorPage extends BasePage {
  // Selectors — all test IDs taken directly from AdvisorRoleSection.tsx
  readonly becomeAdvisorBtn: Locator;    // "Apply Now" button shown before form
  readonly fullNameInput: Locator;
  readonly phoneInput: Locator;
  readonly expertiseSelect: Locator;    // expertise is a <select>, not an input
  readonly experienceInput: Locator;
  readonly bioInput: Locator;
  readonly confirmCheckbox: Locator;
  readonly submitAppBtn: Locator;
  readonly reviewDocsBtn: Locator;
  readonly approveBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.becomeAdvisorBtn = page.locator('[data-testid="advisor-role-section-apply-now"]');
    this.fullNameInput    = page.locator('[data-testid="advisor-role-section-input"]').first();
    this.phoneInput       = page.locator('[data-testid="advisor-role-section-91-xxxxx-xxxxx"]').first();
    this.expertiseSelect  = page.locator('[data-testid="advisor-role-section-area-of-expertise"]').first();
    this.experienceInput  = page.locator('[data-testid="advisor-role-section-0"]').first();
    this.bioInput         = page.locator('[data-testid="advisor-role-section-describe-your-professional-background"]').first();
    this.confirmCheckbox  = page.locator('[data-testid="advisor-role-section-checkbox"]').first();
    this.submitAppBtn     = page.locator('[data-testid="advisor-role-section-button-5"]').first();
    this.reviewDocsBtn    = page.getByRole('button', { name: /Review Documents/i });
    this.approveBtn       = page.getByRole('button', { name: /Approve Advisor/i });
  }

  async clickBecomeAdvisor() {
    await this.becomeAdvisorBtn.first().waitFor({ state: 'visible', timeout: 15000 });
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

    // Fill full name (pre-populated from user name — clear and retype)
    await this.fullNameInput.clear();
    await this.fullNameInput.fill(options.fullName);

    // Fill phone
    await this.phoneInput.fill(options.phone);

    // Fill experience (years)
    await this.experienceInput.fill(options.experience);

    // Select expertise from dropdown — map free-text to closest option value
    const expertiseValueMap: Record<string, string> = {
      'Financial Planning':  'Financial Planning',
      'Investment Advisory': 'Investment Advisory',
      'Tax Planning':        'Tax Planning',
      'Insurance Advisory':  'Insurance Advisory',
      'Retirement Planning': 'Retirement Planning',
      'Wealth Management':   'Wealth Management',
      'Debt Management':     'Debt Management',
    };
    // Try to find an exact match first, otherwise use 'Other'
    const expertise = options.expertise.toLowerCase();
    let expertiseValue = 'Other';
    for (const [key, val] of Object.entries(expertiseValueMap)) {
      if (expertise.includes(key.toLowerCase())) {
        expertiseValue = val;
        break;
      }
    }
    await this.expertiseSelect.selectOption(expertiseValue);
    await this.wait(300);

    // Fill bio
    await this.bioInput.fill(options.bio);

    // Upload documents via file inputs
    const panInput    = this.page.locator('input[type="file"]').nth(0);
    const aadhaarInput = this.page.locator('input[type="file"]').nth(1);
    await panInput.setInputFiles({
      name: 'pan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('dummy pan content'),
    });
    await aadhaarInput.setInputFiles({
      name: 'aadhaar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('dummy aadhaar content'),
    });
    await this.wait(500);

    // Confirm declaration checkbox
    await this.confirmCheckbox.check();
    await this.wait(300);

    // Submit
    await this.submitAppBtn.click();
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
