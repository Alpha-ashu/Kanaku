import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Shield, Zap, Sparkles, HelpCircle, ChevronDown, ChevronUp, ArrowRight, Lock } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PricingPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onBack,
  onGetStarted,
  onNavigate,
  onLogin,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [isAnnual, setIsAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans = [
    {
      name: 'Free Forever',
      price: '₹0',
      period: 'forever',
      desc: 'Essential personal tracking with total privacy and zero ads.',
      features: [
        'Unlimited Manual Transactions',
        'Up to 3 Bank Accounts',
        'Basic AI Expense Categorization',
        'Target Goal & Budget Tracking',
        'Local-First Offline Storage',
        'Manual PDF & CSV Export',
      ],
      cta: 'Get Started Free',
      popular: false,
      badge: 'Zero Cost',
    },
    {
      name: 'Pro Master',
      price: isAnnual ? '₹159' : '₹199',
      period: '/month',
      desc: 'For earners and professionals seeking automated wealth mastery.',
      features: [
        'Everything in Free Plan',
        'Unlimited Bank & Card Accounts',
        'Autonomous AI Wealth Recommendations',
        'Real-Time 24K Gold Commodity Rates',
        'Automated SMS Transaction Parsing',
        'Receipt OCR Scanner',
        'Multi-Device Background Dexie Sync',
        'Priority Technical Support',
      ],
      cta: 'Start 14-Day Free Trial',
      popular: true,
      badge: 'Most Popular',
    },
    {
      name: 'Family & Group Suite',
      price: isAnnual ? '₹399' : '₹499',
      period: '/month',
      desc: 'Shared budgeting and smart debt minimization for couples & groups.',
      features: [
        'Everything in Pro Master',
        'Up to 5 Family / Friend Accounts',
        'Collaborative Split-Bill Balances',
        'Household Cash Flow Overview',
        'Cooperative Advisor Planning Sessions',
        'Custom Taxonomy & Categories',
        'Dedicated VIP Concierge Support',
      ],
      cta: 'Get Family Suite',
      popular: false,
      badge: 'Best For Households',
    },
  ];

  const faqs = [
    {
      q: 'Is the Free plan truly free forever?',
      a: 'Yes! Our Free Forever tier never expires and requires no credit card. It provides complete offline tracking, unlimited transactions, and core budget management with zero advertising.',
    },
    {
      q: 'Where is my financial data stored?',
      a: 'KANAKU is built on a local-first architecture. Your transaction records live encrypted on your own device. When cloud sync is enabled, all payloads are protected with AES-256 master key encryption.',
    },
    {
      q: 'Can I cancel or switch plans at any time?',
      a: 'Absolutely. You can upgrade, downgrade, or cancel your subscription at any time directly from your account settings with zero cancellation penalties.',
    },
    {
      q: 'Do you offer refunds?',
      a: 'Yes, we provide an unconditional 14-day money-back guarantee on all paid plans. If you are not satisfied, our support team will refund you immediately.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {/* Background Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-violet-100/40 blur-[140px]" />
      </div>

      {/* Navbar */}
      <PublicNavbar
        onNavigate={onNavigate}
        onLogin={onLogin}
        onGetStarted={onGetStarted}
        currentPage="pricing"
      />

      {/* Header */}
      <section className="relative z-10 pt-36 sm:pt-44 lg:pt-48 pb-16 text-center max-w-4xl mx-auto px-4 sm:px-6">
        <span className="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest bg-violet-50 text-violet-700 border border-violet-200 mb-6">
          Transparent Investment in Your Wealth
        </span>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight mb-6 leading-tight">
          Simple, Honest Pricing.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600">
            No Hidden Fees.
          </span>
        </h1>

        <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Invest in tools that pay for themselves in detected savings and disciplined financial growth.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="flex items-center justify-center gap-3 pt-8">
          <span className={`text-xs sm:text-sm font-bold ${!isAnnual ? 'text-slate-900' : 'text-slate-500'}`}>
            Monthly Billing
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className="relative w-14 h-8 bg-slate-200 rounded-full p-1 transition-colors hover:bg-slate-300"
            aria-label="Toggle annual pricing"
          >
            <div
              className={`w-6 h-6 rounded-full bg-violet-600 shadow-md transform transition-transform ${
                isAnnual ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`text-xs sm:text-sm font-bold ${isAnnual ? 'text-slate-900' : 'text-slate-500'}`}>
              Annual Billing
            </span>
            <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              Save 20%
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {plans.map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-[2.5rem] p-8 sm:p-10 flex flex-col justify-between transition-all duration-300 ${
                p.popular
                  ? 'bg-white border-2 border-violet-500 shadow-2xl shadow-violet-500/15 scale-[1.03] z-20 ring-4 ring-violet-100'
                  : 'bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-sm hover:shadow-xl'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                  {p.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-black text-slate-900">{p.name}</h3>
                  {!p.popular && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {p.badge}
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-slate-500 min-h-[40px] mb-6 leading-relaxed">
                  {p.desc}
                </p>

                <div className="flex items-baseline gap-1.5 mb-8 pb-6 border-b border-slate-100">
                  <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">{p.price}</span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-400">{p.period}</span>
                </div>

                <div className="space-y-3.5 mb-10">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Included Features</p>
                  {p.features.map((f, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="mt-0.5 w-4 h-4 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
                      </div>
                      <span className="text-xs sm:text-sm text-slate-700 font-medium">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                data-testid={`pricing-page-button-${i}`}
                onClick={onGetStarted}
                className={`w-full py-4 rounded-2xl font-black text-xs sm:text-sm transition-all duration-200 shadow-md ${
                  p.popular
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:shadow-lg hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:scale-[0.98]'
                }`}
              >
                {p.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Security & Compliance Badges */}
      <section className="relative z-10 bg-slate-50 border-y border-slate-200 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center mx-auto shadow-sm">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Uncompromising Security Architecture</h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
            All tiers feature on-device encryption, biometric unlock authentication, and strictly non-custodial storage. We never touch or hold your money.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
            {['Zero Cloud Leakage', 'AES-256 Encryption', 'Biometric Gate', 'ISO 27001 Ready'].map((b, idx) => (
              <div
                key={idx}
                className="py-3 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-sm"
              >
                ✓ {b}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="relative z-10 max-w-3xl mx-auto px-4 py-24">
        <div className="text-center mb-12 space-y-2">
          <span className="text-xs font-extrabold uppercase tracking-widest text-violet-600">Got Questions?</span>
          <h2 className="text-3xl font-black text-slate-900">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm transition-all"
            >
              <button
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
              >
                <span className="text-sm sm:text-base font-bold text-slate-900">{item.q}</span>
                {openFaq === idx ? (
                  <ChevronUp className="w-4 h-4 text-violet-600 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>
              {openFaq === idx && (
                <div className="px-6 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="relative z-10 border-t border-slate-200 py-10 bg-white text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} KANAKU. Built with pride by Shaik Ashraf K. All prices in Indian Rupee (INR).</p>
      </footer>
    </div>
  );
};
