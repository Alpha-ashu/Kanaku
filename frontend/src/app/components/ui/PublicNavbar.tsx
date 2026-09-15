import React, { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { KANAKULogo } from './KANAKULogo';

interface PublicNavbarProps {
  onNavigate: (page: string) => void;
  onLogin: () => void;
  onGetStarted: () => void;
  currentPage: string;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

// Entries marked `section` are anchors on the landing page; the rest are public pages.
const navLinks: { name: string; id: string; section?: boolean }[] = [
  { name: 'Features', id: 'features', section: true },
  { name: 'Security', id: 'security', section: true },
  { name: 'Pricing', id: 'pricing' },
  { name: 'About', id: 'about' },
  { name: 'Support', id: 'contact' },
];

export const scrollToSection = (id: string) => {
  const element = document.getElementById(id);
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top, behavior: 'smooth' });
};

export const KanakuWordmark: React.FC<{ className?: string; logoClassName?: string }> = ({
  className = 'text-lg',
  logoClassName = 'w-8 h-8',
}) => (
  <span className="inline-flex items-center gap-2.5 select-none">
    <KANAKULogo className={`${logoClassName} flex-shrink-0`} />
    <span
      className={`${className} font-extrabold tracking-[0.02em] text-slate-950 leading-none`}
      style={{ fontFamily: DISPLAY_FONT }}
    >
      KANAKU
    </span>
  </span>
);

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  onNavigate,
  onLogin,
  onGetStarted,
  currentPage,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleLinkClick = (id: string, section?: boolean) => {
    setMenuOpen(false);
    if (!section) {
      if (id === 'landing' && currentPage === 'landing') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      onNavigate(id);
      return;
    }
    if (currentPage === 'landing') {
      scrollToSection(id);
    } else {
      onNavigate('landing');
      setTimeout(() => scrollToSection(id), 120);
    }
  };

  const solid = scrolled || menuOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-200 border-b ${
        solid
          ? 'bg-white/90 backdrop-blur-xl border-slate-200/80 shadow-[0_1px_12px_rgba(15,23,42,0.05)]'
          : 'bg-white/0 border-transparent'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
        <button
          type="button"
          data-testid="public-navbar-div"
          className="rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
          onClick={() => handleLinkClick('landing')}
          aria-label="KANAKU home"
        >
          <KanakuWordmark />
        </button>

        <nav className="hidden md:flex items-center gap-1" aria-label="Main">
          {navLinks.map((link) => {
            const isActive = currentPage === link.id;
            return (
              <button
                type="button"
                data-testid={`public-navbar-button-${link.id}`}
                key={link.id}
                onClick={() => handleLinkClick(link.id, link.section)}
                aria-current={isActive ? 'page' : undefined}
                className={`px-3 py-2 text-sm font-medium rounded-[10px] transition-colors ${
                  isActive
                    ? 'text-slate-950 bg-slate-100'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
                }`}
              >
                {link.name}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            data-testid="public-navbar-log-in"
            onClick={onLogin}
            className="px-3.5 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950 rounded-[10px] hover:bg-slate-100/70 transition-colors"
          >
            Log in
          </button>
          <button
            type="button"
            data-testid="public-navbar-get-started"
            onClick={onGetStarted}
            className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-slate-950 text-white text-sm font-semibold hover:bg-violet-700 transition-colors shadow-sm"
          >
            Get started
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <button
          type="button"
          data-testid="public-navbar-menu"
          className="md:hidden -mr-1 p-2 rounded-[10px] text-slate-700 hover:bg-slate-100 transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-200/80 bg-white px-4 pt-2 pb-4 shadow-lg">
          <nav className="flex flex-col" aria-label="Mobile">
            {navLinks.map((link) => (
              <button
                type="button"
                data-testid={`public-navbar-button-2-${link.id}`}
                key={link.id}
                onClick={() => handleLinkClick(link.id, link.section)}
                className={`text-left px-2 py-3 text-[15px] font-medium border-b border-slate-100 transition-colors ${
                  currentPage === link.id ? 'text-violet-700' : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {link.name}
              </button>
            ))}
          </nav>

          <div className="pt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="public-navbar-log-in-2"
              onClick={onLogin}
              className="py-2.5 text-sm font-semibold text-slate-800 border border-slate-200 rounded-[10px] hover:bg-slate-50 transition-colors"
            >
              Log in
            </button>
            <button
              type="button"
              data-testid="public-navbar-get-started-2"
              onClick={onGetStarted}
              className="py-2.5 rounded-[10px] bg-slate-950 text-white text-sm font-semibold hover:bg-violet-700 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              Get started
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
