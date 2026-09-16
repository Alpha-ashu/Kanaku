import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Sparkles, Globe, Lock, Award, Heart, CheckCircle2, ArrowRight } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface AboutPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({
  onBack,
  onGetStarted,
  onNavigate,
  onLogin,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const values = [
    {
      icon: <Shield className="w-6 h-6 text-violet-600" />,
      title: 'Privacy by Default',
      desc: 'Your records live on your device first and sync to your account over encrypted connections. We never show ads or sell your data.',
      color: 'from-violet-500/10 to-indigo-500/5',
      border: 'border-violet-100',
    },
    {
      icon: <Sparkles className="w-6 h-6 text-pink-600" />,
      title: 'Helpful AI',
      desc: 'KAI logs expenses from plain language, answers questions about your spending, and budget alerts warn you before you overspend.',
      color: 'from-pink-500/10 to-rose-500/5',
      border: 'border-pink-100',
    },
    {
      icon: <Users className="w-6 h-6 text-blue-600" />,
      title: 'Community & Collaboration',
      desc: 'Money management is social. From shared trip splits with flatmates to sessions with verified advisors, KANAKU brings clarity to shared money.',
      color: 'from-blue-500/10 to-cyan-500/5',
      border: 'border-blue-100',
    },
    {
      icon: <Globe className="w-6 h-6 text-emerald-600" />,
      title: 'Offline-First Resilience',
      desc: 'On a flight, in a remote town or on a patchy network, KANAKU keeps working. Add and review entries offline, and they sync when you reconnect.',
      color: 'from-emerald-500/10 to-teal-500/5',
      border: 'border-emerald-100',
    },
  ];

  const milestones = [
    {
      year: 'November 2025',
      title: 'Genesis of KANAKU',
      event:
        'Founded by Shaik Ashraf K in Bangalore, India, to liberate everyday earners from chaotic spreadsheets and privacy-invading cloud trackers.',
    },
    {
      year: 'Early 2026',
      title: 'First Release',
      event:
        'Launched offline-first expense tracking with accounts, budgets and reports, followed by bank SMS capture on Android.',
    },
    {
      year: 'Mid 2026',
      title: 'Scanning, Investments & Advisors',
      event:
        'Added AI bill scanning for receipts and PDFs, investment and live gold price tracking, and sessions with verified financial advisors.',
    },
    {
      year: 'September 2026',
      title: 'Meet KAI',
      event:
        'Launched KAI, the finance assistant you can talk or type to — log expenses, check spending and set budgets in plain language.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[550px] h-[550px] rounded-full bg-violet-100/40 blur-[130px]" />
        <div className="absolute top-1/3 left-0 w-[600px] h-[600px] rounded-full bg-pink-100/30 blur-[140px]" />
      </div>

      {/* Navbar */}
      <PublicNavbar
        onNavigate={onNavigate}
        onLogin={onLogin}
        onGetStarted={onGetStarted}
        currentPage="about"
      />

      {/* Hero */}
      <section className="relative z-10 pt-36 sm:pt-44 lg:pt-48 pb-16 text-center max-w-4xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-xs font-bold mb-6"
        >
          <Award className="w-3.5 h-3.5" />
          <span>Our Vision & Creed</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 leading-tight mb-6"
        >
          Democratizing Financial Freedom with{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600">
            Absolute Privacy.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-base sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto"
        >
          KANAKU was founded in November 2025 by <strong>Shaik Ashraf K</strong> (Founder & CEO) with a singular mission: to eliminate the chaos of personal finance without sacrificing your fundamental right to digital privacy.
        </motion.p>
      </section>

      {/* Founder Spotlight Card */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 mb-24">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center relative z-10">
            <div className="md:col-span-4 flex flex-col items-center text-center border-b md:border-b-0 md:border-r border-slate-700/80 pb-6 md:pb-0 md:pr-8">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-violet-500 to-pink-500 p-1 mb-4 shadow-xl">
                <div className="w-full h-full rounded-[22px] bg-slate-900 flex items-center justify-center">
                  <KANAKULogo className="w-14 h-14" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-white">Shaik Ashraf K</h3>
              <p className="text-xs font-semibold text-violet-300 mt-0.5">Founder & Chief Executive Officer</p>
              <span className="mt-3 inline-block px-3 py-1 rounded-full text-2xs font-extrabold bg-violet-500/20 text-violet-200 border border-violet-400/30">
                Bengaluru, India
              </span>
            </div>

            <div className="md:col-span-8 space-y-4">
              <h4 className="text-xl sm:text-2xl font-black tracking-tight text-violet-100">
                "Why should smart finance require giving up your privacy?"
              </h4>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
                Too many finance apps sell your transaction history to lenders, barrage you with credit card offers, or lock your data away. We built KANAKU on a simple principle: your money data is yours — no ads, no data selling, and you can export or delete it anytime.
              </p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs font-bold text-slate-300">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Offline-First Design</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Zero Ad-Tracking or Data Resale</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">Our Foundations</p>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900">The Principles Guiding Every Line of Code</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((v, i) => (
            <div
              key={i}
              className={`rounded-3xl bg-white border ${v.border} p-7 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${v.color} flex items-center justify-center mb-5 shadow-sm`}>
                {v.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{v.title}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Milestones / Story Timeline */}
      <section className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-16 space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">Company Trajectory</p>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900">Our Journey So Far</h2>
        </div>

        <div className="relative border-l-2 border-slate-200 ml-4 sm:ml-8 space-y-12">
          {milestones.map((m, i) => (
            <div key={i} className="relative pl-8 sm:pl-12 group">
              <div className="absolute left-[-9px] top-1.5 w-4 h-4 rounded-full bg-violet-600 border-4 border-white shadow-md group-hover:scale-125 transition-transform" />
              <span className="text-xs font-black uppercase tracking-wider text-violet-600 bg-violet-50 px-3 py-1 rounded-full border border-violet-200/60">
                {m.year}
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-2">{m.title}</h3>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">{m.event}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-[2.5rem] bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 text-white p-10 sm:p-16 text-center shadow-2xl">
          <KANAKULogo className="w-14 h-14 mx-auto mb-6 drop-shadow-md" />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
            Be Part of the Private Finance Revolution
          </h2>
          <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Track your spending, budgets and net worth in one free app — on the web and on your phone.
          </p>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-slate-900 font-extrabold text-sm hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 shadow-xl"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="relative z-10 border-t border-slate-200 py-10 bg-white text-center text-xs text-slate-400">
        <div className="max-w-4xl mx-auto px-4 space-y-1">
          <p className="font-bold text-slate-600">Created by Shaik Ashraf K • Established November 2025</p>
          <p>© {new Date().getFullYear()} KANAKU. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
