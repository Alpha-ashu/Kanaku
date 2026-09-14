import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, MessageSquare, MapPin, Send, Loader2, Globe, Clock, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface ContactPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({
  onBack,
  onGetStarted,
  onNavigate,
  onLogin,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('General Support');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success("Thank you! Your message has been received. We'll reply within 2 hours.");
      onNavigate('landing');
    }, 1200);
  };

  const contactCards = [
    {
      icon: <Mail className="w-5 h-5 text-violet-600" />,
      label: 'Email Support',
      value: import.meta.env.VITE_SUPPORT_EMAIL || 'support@kanaku.in',
      desc: 'Typical response within 2 hours',
      link: `mailto:${import.meta.env.VITE_SUPPORT_EMAIL || 'support@kanaku.in'}`,
    },
    {
      icon: <MessageSquare className="w-5 h-5 text-pink-600" />,
      label: 'In-App Live Chat',
      value: '24/7 AI & Human Concierge',
      desc: 'Instant replies inside your dashboard',
      link: null,
    },
    {
      icon: <MapPin className="w-5 h-5 text-emerald-600" />,
      label: 'Global Headquarters',
      value: 'Bengaluru, Karnataka, India',
      desc: 'Silicon Valley of India',
      link: null,
    },
  ];

  const topics = ['General Support', 'Bug Report', 'Feature Idea', 'Account Security', 'Partnership'];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full bg-violet-100/40 blur-[140px]" />
      </div>

      {/* Navbar */}
      <PublicNavbar
        onNavigate={onNavigate}
        onLogin={onLogin}
        onGetStarted={onGetStarted}
        currentPage="contact"
      />

      {/* Header */}
      <section className="relative z-10 pt-36 sm:pt-44 lg:pt-48 pb-16 text-center max-w-4xl mx-auto px-4 sm:px-6">
        <span className="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest bg-violet-50 text-violet-700 border border-violet-200 mb-6">
          We are Here For You
        </span>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight mb-6 leading-tight">
          How Can We{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600">
            Help You?
          </span>
        </h1>

        <p className="text-base sm:text-xl text-slate-600 max-w-xl mx-auto leading-relaxed">
          Whether you have questions about offline security, budgeting features, or enterprise advisory, our team is standing by.
        </p>
      </section>

      {/* Content Grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Cards */}
          <div className="lg:col-span-4 space-y-4">
            {contactCards.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-sm hover:shadow-lg transition-all"
              >
                <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                  {c.icon}
                </div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{c.label}</p>
                {c.link ? (
                  <a
                    data-testid={`contact-page-link-${i}`}
                    href={c.link}
                    className="text-base font-bold text-slate-900 hover:text-violet-600 transition-colors block mt-0.5"
                  >
                    {c.value}
                  </a>
                ) : (
                  <p className="text-base font-bold text-slate-900 mt-0.5">{c.value}</p>
                )}
                <p className="text-xs text-slate-500 mt-1">{c.desc}</p>
              </motion.div>
            ))}

            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 shadow-lg space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Clock className="w-4 h-4" />
                <span>Rapid SLA Response</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                All inquiries submitted through this form are logged directly to our priority support desk with guaranteed response within 2 hours.
              </p>
            </div>
          </div>

          {/* Right Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-8 rounded-[2.5rem] bg-white border border-slate-200/80 p-8 sm:p-12 shadow-xl"
          >
            <form data-testid="contact-page-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Topic Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  What is this regarding?
                </label>
                <div className="flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedTopic(t)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                        selectedTopic === t
                          ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/25'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Your Name
                  </label>
                  <input
                    data-testid="contact-page-jane-doe"
                    required
                    type="text"
                    placeholder="e.g. Shaik Ashraf"
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Email Address
                  </label>
                  <input
                    data-testid="contact-page-jane-example-com"
                    required
                    type="email"
                    placeholder="shaik@example.com"
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Your Message
                </label>
                <textarea
                  data-testid="contact-page-how-can-we-help"
                  required
                  rows={5}
                  placeholder="Describe your question or feedback in detail..."
                  className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all resize-none"
                />
              </div>

              <button
                data-testid="contact-page-button"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-indigo-500/25 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Transmitting Message...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Message to KANAKU Team</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 py-10 bg-white text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} KANAKU. Built with pride by Shaik Ashraf K. All rights reserved.</p>
      </footer>
    </div>
  );
};
