import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Fingerprint, Globe, Lock, EyeOff } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PricingPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

const included = [
  'Unlimited transactions across all your accounts',
  'KAI assistant by voice and chat',
  'Receipt and PDF bill scanning',
  'Budgets with alerts, and savings goals',
  'Group splits and loan tracking',
  'Investments and gold, with live stock and gold prices',
  'Reports with PDF and CSV export',
  'Offline-first, synced across your devices',
  'Bank SMS capture in our Android app',
];

const trustPoints = [
  { icon: Lock, label: 'PIN app lock' },
  { icon: Fingerprint, label: 'Biometric unlock' },
  { icon: Globe, label: 'Encrypted in transit' },
  { icon: EyeOff, label: 'No ads or data selling' },
];

const faqs = [
  {
    q: 'Is KANAKU really free?',
    a: 'Yes. There is one plan and it costs nothing — no card, no trial clock. AI features such as KAI and bill scanning have a fair-use daily limit so the service stays fast for everyone.',
  },
  {
    q: 'Where is my financial data stored?',
    a: 'On your device first, so the app works offline. When you sign in, your records also sync over an encrypted HTTPS connection to your KANAKU account, so they are available on your other devices. In guest mode, data stays on the device only.',
  },
  {
    q: 'Can I export or delete my data?',
    a: 'Yes. Export reports as PDF or CSV from Reports at any time, and delete your account and synced data from your Profile whenever you choose.',
  },
  {
    q: 'Do I need a card to sign up?',
    a: 'No. Create an account with your email, verify it with the code we send, and you are ready to go.',
  },
];

export const PricingPage: React.FC<PricingPageProps> = ({ onGetStarted, onNavigate, onLogin }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div
      className="relative min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden"
      style={{ '--font-display': DISPLAY_FONT } as React.CSSProperties}
    >
      <PublicNavbar onNavigate={onNavigate} onLogin={onLogin} onGetStarted={onGetStarted} currentPage="pricing" />

      <main>
        <section className="relative bg-gradient-to-b from-violet-50/80 via-white to-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-12 text-center">
            <p className="text-sm font-semibold text-violet-700">Pricing</p>
            <h1 className="mt-3 text-[36px] sm:text-[52px] leading-[1.06] font-extrabold tracking-[-0.035em] text-slate-950">
              Free. Every feature.
            </h1>
            <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600">
              KANAKU has a single plan, and it doesn't cost anything. Sign up with your email — no card needed.
            </p>
          </div>

          <div className="max-w-xl mx-auto px-4 sm:px-6 pb-20">
            <div className="rounded-[28px] border border-slate-200 bg-white p-7 sm:p-10 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-semibold text-slate-950">KANAKU</h2>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Free</span>
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight text-slate-950">₹0</span>
                <span className="text-sm text-slate-500">no card, no trial</span>
              </p>

              <ul className="mt-8 space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-slate-700">
                    <Check className="mt-0.5 w-4 h-4 shrink-0 text-violet-600" />
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                data-testid="pricing-page-button-0"
                onClick={onGetStarted}
                className="group mt-9 w-full inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-600 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-violet-700 transition-colors"
              >
                Create free account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <p className="mt-3 text-center text-xs text-slate-500">AI features have a fair-use daily limit.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <ul className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 py-10">
            {trustPoints.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                <span className="w-9 h-9 shrink-0 rounded-[10px] bg-white border border-slate-200 text-violet-700 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
          <h2 className="text-[28px] sm:text-[36px] leading-[1.1] font-bold tracking-[-0.03em] text-slate-950 text-center">
            Questions, answered
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
                    <ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div id={`pricing-faq-${idx}`} hidden={!open} className="pb-5 pr-10">
                    <p className="text-[15px] leading-relaxed text-slate-600">{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} KANAKU. Built by Shaik Ashraf K.</p>
      </footer>
    </div>
  );
};
