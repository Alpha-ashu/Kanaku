import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowRight, Sparkles } from 'lucide-react';
import { KANAKULogo } from './KANAKULogo';

interface PublicNavbarProps {
  onNavigate: (page: string) => void;
  onLogin: () => void;
  onGetStarted: () => void;
  currentPage: string;
}

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  onNavigate,
  onLogin,
  onGetStarted,
  currentPage,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { name: 'Home', id: 'landing' },
    { name: 'About', id: 'about' },
    { name: 'Features', id: 'features' },
    { name: 'Pricing', id: 'pricing' },
    { name: 'Privacy', id: 'privacy' },
    { name: 'Terms', id: 'terms' },
    { name: 'Support', id: 'contact' },
  ];

  const handleLinkClick = (id: string) => {
    if (id === 'features') {
      if (currentPage === 'landing') {
        const element = document.getElementById('features');
        if (element) {
          const offset = 90;
          const elementPosition = element.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
        }
      } else {
        onNavigate('landing');
        setTimeout(() => {
          const element = document.getElementById('features');
          if (element) {
            const offset = 90;
            const elementPosition = element.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
          }
        }, 120);
      }
    } else {
      onNavigate(id);
    }
    setMenuOpen(false);
  };

  return (
    <header className="fixed top-4 inset-x-3 sm:inset-x-6 z-50 pointer-events-none transition-all duration-300">
      <div
        className={`max-w-6xl mx-auto pointer-events-auto h-16 sm:h-17 rounded-full transition-all duration-300 px-4 sm:px-8 flex items-center justify-between ${
          scrolled
            ? 'bg-white/85 backdrop-blur-2xl border border-white/60 shadow-[0_16px_36px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5'
            : 'bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(15,23,42,0.06)]'
        }`}
      >
        {/* Logo */}
        <div
          data-testid="public-navbar-div"
          className="flex items-center gap-3 cursor-pointer group select-none"
          onClick={() => handleLinkClick('landing')}
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-2xl bg-gradient-to-tr from-violet-500/10 to-indigo-500/10 border border-violet-500/20 group-hover:scale-105 transition-transform duration-300 shadow-sm">
            <KANAKULogo className="w-7 h-7 drop-shadow" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black text-slate-900 tracking-tight leading-tight flex items-center gap-1.5">
              KANAKU
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-600 animate-pulse" />
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-violet-600 hidden sm:inline-block">
              Finance OS
            </span>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/60 p-1.5 rounded-full border border-slate-200/50">
          {navLinks.map((link) => {
            const isActive = currentPage === link.id;
            return (
              <button
                data-testid={`public-navbar-button-${link.id}`}
                key={link.id}
                onClick={() => handleLinkClick(link.id)}
                className={`relative px-3.5 py-1.5 text-xs lg:text-sm font-semibold rounded-full transition-all duration-200 ${
                  isActive
                    ? 'text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-sm shadow-violet-500/25'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                }`}
              >
                {link.name}
              </button>
            );
          })}
        </nav>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          <button
            data-testid="public-navbar-log-in"
            onClick={onLogin}
            className="px-4 py-2 text-xs lg:text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors rounded-full hover:bg-slate-100/70"
          >
            Log In
          </button>
          <button
            data-testid="public-navbar-get-started"
            onClick={onGetStarted}
            className="group inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white text-xs lg:text-sm font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            <span>Get Started</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          data-testid="public-navbar-menu"
          className="md:hidden p-2 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden mt-3 pointer-events-auto bg-white/95 backdrop-blur-2xl border border-slate-200/70 rounded-3xl overflow-hidden p-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {navLinks.map((link) => (
              <button
                data-testid={`public-navbar-button-2-${link.id}`}
                key={link.id}
                onClick={() => handleLinkClick(link.id)}
                className={`text-left px-3.5 py-3 text-xs font-bold rounded-xl transition-all ${
                  currentPage === link.id
                    ? 'text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {link.name}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
            <button
              data-testid="public-navbar-log-in-2"
              onClick={onLogin}
              className="w-full py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-all text-center"
            >
              Sign In to Account
            </button>
            <button
              data-testid="public-navbar-get-started-2"
              onClick={onGetStarted}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white text-xs font-bold text-center shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};


