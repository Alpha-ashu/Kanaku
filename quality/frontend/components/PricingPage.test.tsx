// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lucide-react resolves the root React 18 copy; stub icons so only frontend's React renders.
vi.mock('lucide-react', () => ({
  ArrowRight: () => null,
  Check: () => null,
  X: () => null,
  ChevronDown: () => null,
  Fingerprint: () => null,
  Globe: () => null,
  Lock: () => null,
  EyeOff: () => null,
  Sparkles: () => null,
}));

// Stub PublicNavbar to avoid deep router dependencies
vi.mock('@/app/components/ui/PublicNavbar', () => ({
  PublicNavbar: () => <nav data-testid="public-navbar">PublicNavbar</nav>,
}));

import { PricingPage } from '@/app/components/marketing/PricingPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PricingPage Component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders exactly two pricing plans: Free (₹0) and Pro', () => {
    act(() => {
      root.render(
        <PricingPage
          onBack={vi.fn()}
          onGetStarted={vi.fn()}
          onNavigate={vi.fn()}
          onLogin={vi.fn()}
        />
      );
    });

    // Check plan headers
    const freeHeader = container.querySelector('h2');
    expect(freeHeader?.textContent).toBe('Free');

    const headers = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headers).toContain('Free');
    expect(headers).toContain('Pro');

    // Free plan features
    expect(container.textContent).toContain('₹0');
    expect(container.textContent).toContain('3 accounts');
    expect(container.textContent).toContain('No KAI AI financial assistant');
    expect(container.textContent).toContain('No recurring expense tracking');
    expect(container.textContent).toContain('No budget alerts');
    expect(container.textContent).toContain('No AI insights');
    expect(container.textContent).toContain('No notification alerts');

    // Pro plan default annual pricing
    expect(container.textContent).toContain('₹99');
    expect(container.textContent).toContain('for the first year');
    expect(container.textContent).toContain('Renews at ₹299/year from year 2');
    expect(container.textContent).toContain('KAI AI financial assistant');
    expect(container.textContent).toContain('Recurring expenses');
    expect(container.textContent).toContain('Smart budget alerts');
    expect(container.textContent).toContain('AI financial insights');
    expect(container.textContent).toContain('Smart notification alerts');
  });

  it('switches between annual and monthly billing for Pro plan', () => {
    act(() => {
      root.render(
        <PricingPage
          onBack={vi.fn()}
          onGetStarted={vi.fn()}
          onNavigate={vi.fn()}
          onLogin={vi.fn()}
        />
      );
    });

    const monthlyButton = container.querySelector('[data-testid="billing-toggle-monthly"]') as HTMLButtonElement;
    expect(monthlyButton).not.toBeNull();

    act(() => {
      monthlyButton.click();
    });

    expect(container.textContent).toContain('₹29');
    expect(container.textContent).toContain('/ month');
    expect(container.textContent).toContain('Get Pro — ₹29/Month');

    const annualButton = container.querySelector('[data-testid="billing-toggle-annual"]') as HTMLButtonElement;
    expect(annualButton).not.toBeNull();

    act(() => {
      annualButton.click();
    });

    expect(container.textContent).toContain('₹99');
    expect(container.textContent).toContain('for the first year');
    expect(container.textContent).toContain('Renews at ₹299/year from year 2');
    expect(container.textContent).toContain('Get Pro — ₹99 for 1st Year');
  });
});
