import React, { useState, useEffect } from 'react';
import { Menu, X, Star, MessageSquare, Shield, FileText } from 'lucide-react';
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
 currentPage
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
 { name: 'Support', id: 'contact' }
 ];

 const handleLinkClick = (id: string) => {
 if (id === 'features') {
 if (currentPage === 'landing') {
 const element = document.getElementById('features');
 if (element) {
 const offset = 80;
 const elementPosition = element.getBoundingClientRect().top + window.scrollY;
 window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
 }
 } else {
 onNavigate('landing');
 setTimeout(() => {
 const element = document.getElementById('features');
 if (element) {
 const offset = 80;
 const elementPosition = element.getBoundingClientRect().top + window.scrollY;
 window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
 }
 }, 100);
 }
 } else {
 onNavigate(id);
 }
 setMenuOpen(false);
 };

 const logoIcon = <KANAKULogo className="w-8 h-8 drop-shadow-md" />;

 return (
 <header className="fixed top-6 inset-x-4 z-50 pointer-events-none">
 <div className="max-w-6xl mx-auto pointer-events-auto h-16 rounded-full bg-white/10 backdrop-blur-2xl border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.1)] px-6 lg:px-10 flex items-center justify-between transition-all duration-300 ring-1 ring-black/5">
 {/* Logo */}
 <div className="flex items-center gap-3 cursor-pointer group" onClick={() => handleLinkClick('landing')}>
 <div className="w-10 h-10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
 {logoIcon}
 </div>
 <span className="text-xl font-extrabold text-gray-900 tracking-tight">KANAKU</span>
 </div>

 {/* Desktop nav */}
 <nav className="hidden md:flex items-center gap-9">
 {navLinks.map((link) => (
 <button
 key={link.id}
 onClick={() => handleLinkClick(link.id)}
 className={`text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${currentPage === link.id
 ? 'text-blue-600'
 : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 {link.name}
 </button>
 ))}
 </nav>

 {/* CTA buttons */}
 <div className="hidden md:flex items-center gap-4">
 <button
 onClick={onLogin}
 className="px-5 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
 >
 Log In
 </button>
 <button
 onClick={onGetStarted}
 className="px-6 py-2.5 rounded-full bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 group"
 >
 Get Started
 </button>
 </div>

 {/* Mobile hamburger */}
 <button
 className="md:hidden p-2 rounded-full hover:bg-black/5 transition-colors"
 onClick={() => setMenuOpen(!menuOpen)}
 aria-label="Menu"
 >
 {menuOpen ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
 </button>
 </div>

 {/* Mobile menu */}
 {menuOpen && (
 <div className="md:hidden mt-3 pointer-events-auto bg-white/70 backdrop-blur-2xl border border-white/20 rounded-3xl overflow-hidden p-3 shadow-2xl animate-in fade-in zoom-in duration-200">
 {navLinks.map((link) => (
 <button
 key={link.id}
 onClick={() => handleLinkClick(link.id)}
 className={`block w-full text-left px-4 py-4 text-sm font-semibold rounded-2xl transition-all ${currentPage === link.id
 ? 'text-blue-600 bg-blue-50'
 : 'text-gray-600 hover:text-gray-900 hover:bg-black/5'
 }`}
 >
 {link.name}
 </button>
 ))}
 <div className="border-t border-black/5 mt-2 pt-2 gap-2 flex flex-col">
 <button
 onClick={onLogin}
 className="w-full py-3 text-sm font-semibold text-gray-600 hover:bg-black/5 rounded-xl transition-all"
 >
 Log In
 </button>
 <button
 onClick={onGetStarted}
 className="w-full py-4 px-4 rounded-2xl bg-blue-600 text-white text-sm font-bold text-center shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-transform"
 >
 Get Started
 </button>
 </div>
 </div>
 )}
 </header>
 );
};

