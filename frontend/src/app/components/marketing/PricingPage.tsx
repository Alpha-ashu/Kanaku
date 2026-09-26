import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, X, ChevronDown, Fingerprint, Globe, Lock, EyeOff, Sparkles } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PricingPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

const trustPoints = [
  { icon: Lock, label: 'PIN app lock' },
  { icon: Fingerprint, label: 'Biometric unlock' },
  { icon: Globe, label: 'Encrypted in transit' },
  { icon: EyeOff, label: 'No ads or data selling' },
];

const faqs = [
  {
    q: 'What is included in the Free plan?',
    a: 'The Free plan costs ₹0 forever. It lets you add up to 3 financial accounts and track your basic income, expenses, and transaction history. Advanced features like KAI AI assistance, recurring expense automation, smart budget alerts, and AI insights require a Pro subscription.',
  },
  {
    q: 'How does the Pro annual promotional pricing work?',
    a: 'Pro Annual is available at a special introductory price of ₹99 for your entire first year. From the second year onward, it renews at the regular annual price of ₹299/year. You can also opt for monthly billing at ₹29/month.',
  },
  {
    q: 'Can I cancel or switch my plan anytime?',
    a: 'Yes. You can switch between monthly and annual billing, or cancel anytime from your account settings. If you cancel Pro, your existing accounts and records remain accessible on the Free plan.',
  },
  {
    q: 'Where is my financial data stored?',
    a: 'Your financial data is stored locally on your device first so Kanakku works seamlessly offline. When connected, your encrypted data syncs securely over HTTPS to your personal Kanakku account.',
  },
  {
    q: 'Do I need a credit card to sign up for Free?',
    a: 'No card is needed for the Free plan. Just register with your email, verify it with the OTP code we send, and start tracking your finances immediately.',
  },
];

export const PricingPage: React.FC<PricingPageProps> = ({ onGetStarted, onNavigate, onLogin }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [billingCycle, setBillingCycle] = useState<'annual' | 'monthly'>('annual');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div
      className="relative min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden"
      style={{ '--font-display': DISPLAY_FONT } as React.CSSProperties}
    >
      <PublicNavbar onNavigate={onNavigate} onLogin={onLogin} onGetStarted={onGetStarted} currentPage="pricing" />

      <main>
        {/* Header Section */}
        <section className="relative bg-gradient-to-b from-violet-50/80 via-white to-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-8 text-center">
            <p className="text-sm font-bold text-violet-700 uppercase tracking-wider">Simple & Transparent Pricing</p>
            <h1 className="mt-3 text-4xl sm:text-5xl leading-[1.08] font-extrabold tracking-[-0.035em] text-slate-950">
              Pick the plan that fits your financial journey.
            </h1>
            <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600">
              Start with basic tracking on Free, or upgrade to Pro for AI-powered money management with KAI.
            </p>

            {/* Billing Toggle for Pro Plan */}
            <div className="mt-8 inline-flex items-center gap-1 p-1 bg-slate-100 rounded-full border border-slate-200">
              <button
                type="button"
                data-testid="billing-toggle-annual"
                onClick={() => setBillingCycle('annual')}
                className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${
                  billingCycle === 'annual'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                Annual Billing
                <span className="ml-1.5 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-2xs font-extrabold uppercase">
                  Save 67%
                </span>
              </button>
              <button
                type="button"
                data-testid="billing-toggle-monthly"
                onClick={() => setBillingCycle('monthly')}
                className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                Monthly Billing
              </button>
            </div>
          </div>

          {/* Pricing Cards Grid */}
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-stretch">
              {/* Card 1: Free Plan */}
              <div className="rounded-[28px] border border-slate-200 bg-white p-7 sm:p-9 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">Free</h2>
                      <p className="text-xs text-slate-500 mt-0.5">Essential personal finance tracking</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">₹0 Forever</span>
                  </div>

                  <div className="mt-6 flex items-baseline gap-2">
                    <span className="text-5xl font-extrabold tracking-tight text-slate-950">₹0</span>
                    <span className="text-sm font-medium text-slate-500">free forever</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">No credit card or payment required.</p>

                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Included with Free</p>
                    <ul className="space-y-3.5">
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                        <span>Add up to <strong className="text-slate-900 font-semibold">3 accounts</strong> (bank, card, cash)</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                        <span>Basic expense & income tracking</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                        <span>Transaction categorization & search</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                        <span>Offline-first local encryption</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600 font-bold" />
                        <span>Standard PDF and CSV exports</span>
                      </li>
                    </ul>

                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-6 mb-4">Not Included on Free</p>
                    <ul className="space-y-3">
                      <li className="flex items-start gap-3 text-sm text-slate-400">
                        <X className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" />
                        <span>No KAI AI financial assistant</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-slate-400">
                        <X className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" />
                        <span>No recurring expense tracking</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-slate-400">
                        <X className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" />
                        <span>No budget alerts</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-slate-400">
                        <X className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" />
                        <span>No AI insights</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-slate-400">
                        <X className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" />
                        <span>No notification alerts</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <button
                    type="button"
                    data-testid="pricing-get-started-free"
                    onClick={onGetStarted}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white py-3.5 px-6 text-sm font-bold text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    Get Started Free
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Card 2: Pro Plan */}
              <div className="rounded-[28px] border-2 border-violet-600 bg-white p-7 sm:p-9 shadow-[0_24px_60px_-30px_rgba(124,58,237,0.35)] relative flex flex-col justify-between">
                {/* Popular Badge */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3.5 py-1 text-xs font-bold text-white shadow-sm">
                    <Sparkles className="w-3 h-3" />
                    Recommended
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">Pro</h2>
                      <p className="text-xs text-violet-700 font-semibold mt-0.5">Complete financial intelligence with KAI</p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 border border-violet-100">
                      Premium Features
                    </span>
                  </div>

                  {billingCycle === 'annual' ? (
                    <div>
                      <div className="mt-6 flex items-baseline gap-2">
                        <span className="text-5xl font-extrabold tracking-tight text-slate-950">₹99</span>
                        <span className="text-sm font-semibold text-slate-500">for the first year</span>
                      </div>
                      <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold border border-violet-200/80">
                        Renews at ₹299/year from year 2
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Promotional first-year rate. Subsequent annual renewals are ₹299/year.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="mt-6 flex items-baseline gap-2">
                        <span className="text-5xl font-extrabold tracking-tight text-slate-950">₹29</span>
                        <span className="text-sm font-semibold text-slate-500">/ month</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Billed monthly. Cancel or switch to annual anytime.</p>
                    </div>
                  )}

                  <div className="mt-8 pt-6 border-t border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-700 mb-4">Everything in Free, plus:</p>
                    <ul className="space-y-3.5">
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">Unlimited accounts</strong> (banks, cards, cash & wallets)</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">KAI AI financial assistant</strong> (chat & voice recording)</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">Recurring expenses</strong> & scheduled payment tracking</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">Smart budget alerts</strong> & overspending warnings</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">AI financial insights</strong> & spending trend forecasts</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span><strong className="text-slate-950 font-semibold">Smart notification alerts</strong> for due dates & limits</span>
                      </li>
                      <li className="flex items-start gap-3 text-sm font-medium text-slate-800">
                        <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600 font-bold" />
                        <span>Encrypted multi-device sync</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-4">
                  <button
                    type="button"
                    data-testid="pricing-get-pro-plan"
                    onClick={onGetStarted}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-600 py-3.5 px-6 text-sm font-bold text-white shadow-md shadow-violet-500/20 hover:bg-violet-700 transition-colors"
                  >
                    {billingCycle === 'annual' ? 'Get Pro — ₹99 for 1st Year' : 'Get Pro — ₹29/Month'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust Badges */}
        <section className="border-y border-slate-200 bg-slate-50">
          <ul className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 py-10">
            {trustPoints.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                <span className="w-9 h-9 shrink-0 rounded-[10px] bg-white border border-slate-200 text-violet-700 flex items-center justify-center shadow-2xs">
                  <Icon className="w-4 h-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        {/* FAQs */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
          <h2 className="text-3xl sm:text-4xl leading-[1.1] font-bold tracking-[-0.03em] text-slate-950 text-center">
            Frequently Asked Questions
          </h2>
          <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((item, idx) => {
              const open = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`pricing-faq-${idx}`}
                    onClick={() => setOpenFaq(open ? null : idx)}
                    className="w-full flex items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className="text-base font-semibold text-slate-900">{item.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div id={`pricing-faq-${idx}`} hidden={!open} className="pb-5 pr-10">
                    <p className="text-base leading-relaxed text-slate-600">{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} KANAKU. Built with privacy and clarity in mind.</p>
      </footer>
    </div>
  );
};
