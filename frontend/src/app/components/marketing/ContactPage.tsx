import React, { useEffect, useState } from 'react';
import { ArrowRight, Mail, MapPin, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';
import { SUPPORT_EMAIL, supportMailto } from '@/config/support';

interface ContactPageProps {
  onBack: () => void;
  onGetStarted: () => void;
  onNavigate: (page: string) => void;
  onLogin: () => void;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

const topics = ['General support', 'Bug report', 'Feature idea', 'Account & security', 'Partnership'];

const fieldClass =
  'w-full px-4 py-3 rounded-[12px] bg-slate-50 border border-slate-200 text-slate-900 text-[15px] focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-colors';

export const ContactPage: React.FC<ContactPageProps> = ({ onGetStarted, onNavigate, onLogin }) => {
  const [topic, setTopic] = useState(topics[0]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // There is no support backend: the form drafts an email in the visitor's own
  // mail app, so nothing is lost silently and the reply goes to their address.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = `${message.trim()}\n\n— ${name.trim()} (${email.trim()})`;
    window.location.href = supportMailto(`[${topic}] KANAKU support`, body);
    toast.success('Opening your email app — press send there to reach us.');
  };

  return (
    <div
      className="relative min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden"
      style={{ '--font-display': DISPLAY_FONT } as React.CSSProperties}
    >
      <PublicNavbar onNavigate={onNavigate} onLogin={onLogin} onGetStarted={onGetStarted} currentPage="contact" />

      <main className="bg-gradient-to-b from-violet-50/80 via-white to-white">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-36 pb-12 text-center">
          <p className="text-sm font-semibold text-violet-700">Support</p>
          <h1 className="mt-3 text-[36px] sm:text-[52px] leading-[1.06] font-extrabold tracking-[-0.035em] text-slate-950">
            How can we help?
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600">
            Questions, bugs or ideas — we read every message and reply by email.
          </p>
        </section>

        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-3">
            <a
              data-testid="contact-page-link-0"
              href={supportMailto('KANAKU support')}
              className="block rounded-[20px] border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors"
            >
              <Mail className="w-5 h-5 text-violet-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Email us</p>
              <p className="mt-0.5 text-sm text-violet-700 break-all">{SUPPORT_EMAIL}</p>
            </a>

            <button
              type="button"
              data-testid="contact-page-data-deletion"
              onClick={() => onNavigate('data-deletion')}
              className="group w-full text-left rounded-[20px] border border-slate-200 bg-white p-5 hover:border-slate-300 transition-colors"
            >
              <Trash2 className="w-5 h-5 text-rose-500" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Delete your account or data</p>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                See how deletion works
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </p>
            </button>

            <div className="rounded-[20px] border border-slate-200 bg-white p-5">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <p className="mt-3 text-sm font-semibold text-slate-900">Based in</p>
              <p className="mt-0.5 text-sm text-slate-500">Bengaluru, Karnataka, India</p>
            </div>
          </div>

          <div className="lg:col-span-8 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-10 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
            <form data-testid="contact-page-form" onSubmit={handleSubmit} className="space-y-6">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-700 mb-2">What is this about?</legend>
                <div className="flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={topic === t}
                      onClick={() => setTopic(t)}
                      className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        topic === t ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <label className="block">
                  <span className="block text-sm font-semibold text-slate-700 mb-1.5">Your name</span>
                  <input
                    data-testid="contact-page-jane-doe"
                    required
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm font-semibold text-slate-700 mb-1.5">Email address</span>
                  <input
                    data-testid="contact-page-jane-example-com"
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-sm font-semibold text-slate-700 mb-1.5">Message</span>
                <textarea
                  data-testid="contact-page-how-can-we-help"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what happened or what you'd like to see."
                  className={`${fieldClass} resize-none`}
                />
              </label>

              <div>
                <button
                  data-testid="contact-page-button"
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-600 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-violet-700 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Continue in your email app
                </button>
                <p className="mt-3 text-center text-xs text-slate-500">
                  If nothing opens, email us directly at <span className="font-semibold text-slate-700">{SUPPORT_EMAIL}</span>.
                </p>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} KANAKU. Built by Shaik Ashraf K.</p>
      </footer>
    </div>
  );
};
