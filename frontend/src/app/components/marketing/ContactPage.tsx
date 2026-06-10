import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, MessageSquare, MapPin, Send, Loader2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface ContactPageProps {
 onBack: () => void;
 onGetStarted: () => void;
 onNavigate: (page: string) => void;
 onLogin: () => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onBack, onGetStarted, onNavigate, onLogin }) => {
 const [isSubmitting, setIsSubmitting] = useState(false);

 useEffect(() => {
 window.scrollTo(0, 0);
 }, []);

 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();
 setIsSubmitting(true);
 setTimeout(() => {
 setIsSubmitting(false);
 toast.success("Message sent! We'll get back to you soon.");
 onNavigate('landing');
 }, 1500);
 };

 const contactInfo = [
 {
 icon: <Mail className="w-5 h-5 text-violet-600" />,
 label:"Email",
 value:"support@KANAKU.app",
 link:"mailto:support@KANAKU.app"
 },
 {
 icon: <MessageSquare className="w-5 h-5 text-pink-600" />,
 label:"Live Chat",
 value:"Available 24/7 in-app",
 link: null
 },
 {
 icon: <Globe className="w-5 h-5 text-blue-600" />,
 label:"Office",
 value:"Bangalore, India",
 link: null
 }
 ];

 return (
 <div className="min-h-screen bg-white font-sans text-gray-900 select-none pb-20">
 {/* Navbar */}
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 currentPage="contact"
 />

 <section className="pt-40 lg:pt-52 relative overflow-hidden">
 <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-violet-50/50 to-white -z-10" />

 <div className="max-w-7xl mx-auto px-6 lg:px-8">
 <div className="text-center mb-16">
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6"
 >
 How can we <br />
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-500">
 help you?
 </span>
 </motion.h1>
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className="text-lg text-gray-500 max-w-xl mx-auto"
 >
 Have questions about KANAKU? Our team is here to help you navigate your financial journey.
 </motion.p>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
 {/* Contact Info */}
 <div className="space-y-6">
 {contactInfo.map((info, i) => (
 <motion.div
 key={i}
 initial={{ opacity: 0, x: -20 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.1 }}
 className="p-6 bg-white rounded-3xl border border-gray-100 flex items-center gap-4 group hover:bg-white hover:shadow-xl hover:shadow-gray-200/40 transition-all cursor-default"
 >
 <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
 {info.icon}
 </div>
 <div>
 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{info.label}</p>
 {info.link ? (
 <a href={info.link} className="text-sm font-bold text-gray-900 hover:text-violet-600 transition-colors">{info.value}</a>
 ) : (
 <p className="text-sm font-bold text-gray-900">{info.value}</p>
 )}
 </div>
 </motion.div>
 ))}
 </div>

 {/* Form */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.3 }}
 className="lg:col-span-2 bg-white p-8 lg:p-12 rounded-[3rem] shadow-2xl shadow-gray-200/60 border border-gray-100"
 >
 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="space-y-2">
 <label className="text-sm font-bold text-gray-700 ml-1">Full Name</label>
 <input
 required
 type="text"
 placeholder="Jane Doe"
 className="w-full px-6 py-4 rounded-2xl bg-white border border-gray-100 focus:bg-white focus:ring-4 focus:ring-violet-50 focus:border-violet-300 transition-all outline-none text-sm font-medium"
 />
 </div>
 <div className="space-y-2">
 <label className="text-sm font-bold text-gray-700 ml-1">Email Address</label>
 <input
 required
 type="email"
 placeholder="jane@example.com"
 className="w-full px-6 py-4 rounded-2xl bg-white border border-gray-100 focus:bg-white focus:ring-4 focus:ring-violet-50 focus:border-violet-300 transition-all outline-none text-sm font-medium"
 />
 </div>
 </div>
 <div className="space-y-2">
 <label className="text-sm font-bold text-gray-700 ml-1">Message</label>
 <textarea
 required
 rows={5}
 placeholder="How can we help you?"
 className="w-full px-6 py-4 rounded-2xl bg-white border border-gray-100 focus:bg-white focus:ring-4 focus:ring-violet-50 focus:border-violet-300 transition-all outline-none text-sm font-medium resize-none"
 />
 </div>
 <button
 disabled={isSubmitting}
 className="w-full py-5 rounded-2xl bg-gray-900 text-white font-bold text-sm lg:text-base hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-xl shadow-gray-200"
 >
 {isSubmitting ? (
 <>
 <Loader2 className="w-5 h-5 animate-spin" />
 Sending...
 </>
 ) : (
 <>
 <Send className="w-5 h-5" />
 Send Message
 </>
 )}
 </button>
 </form>
 </motion.div>
 </div>
 </div>
 </section>

 {/* Footer Minimal */}
 <footer className="py-10 border-t border-gray-100 text-center">
 <p className="text-xs text-gray-400"> {new Date().getFullYear()} KANAKU. All rights reserved.</p>
 </footer>
 </div>
 );
};


