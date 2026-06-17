import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
 Star, Calendar, Clock, MessageSquare, Briefcase, Award, Users,
 CheckCircle, XCircle, AlertCircle, Loader2, ChevronLeft, Search,
 Video, Phone, MessageCircle, ArrowRight, RefreshCw, CheckCircle2,
 Sparkles, Shield, Zap, Info, ArrowUpRight, Plus, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

import '@/styles/premium-transactions.css';

interface Advisor {
 id: string;
 name: string;
 email: string;
 averageRating: number;
 reviewCount: number;
 availability: boolean;
 advisorAvailability: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>;
 advisorApplication?: {
   expertise: string | null;
   experienceYears: number | null;
   bio: string | null;
   organizationName: string | null;
 } | null;
}

interface Booking {
 id: string;
 status: string;
 advisorId: string;
 proposedDate: string;
 proposedTime: string;
 sessionType: string;
 description: string;
 amount: number;
 advisor?: { name: string; email: string };
}

type SessionType = 'video' | 'audio' | 'chat';

const SESSION_TYPES: { id: SessionType; label: string; icon: React.ElementType }[] = [
 { id: 'video', label: 'Video Call', icon: Video },
 { id: 'audio', label: 'Audio Call', icon: Phone },
 { id: 'chat', label: 'Chat', icon: MessageCircle },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getStatusBadge(status: string) {
 const map: Record<string, { color: string; label: string; icon: React.ElementType }> = {
 pending: { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'PENDING', icon: Clock },
 accepted: { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'CONFIRMED', icon: CheckCircle2 },
 rejected: { color: 'bg-rose-500/10 text-rose-600 border-rose-500/20', label: 'DECLINED', icon: XCircle },
 reschedule: { color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20', label: 'RESCHEDULE', icon: RefreshCw },
 cancelled: { color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', label: 'CANCELLED', icon: XCircle },
 completed: { color: 'bg-violet-500/10 text-violet-600 border-violet-500/20', label: 'COMPLETED', icon: CheckCircle },
 };
 const s = map[status] ?? map.pending;
 const Icon = s.icon;
 return (
 <span className={cn('px-2 py-1 rounded-lg text-[8px] font-black tracking-widest flex items-center gap-1 border', s.color)}>
 <Icon size={10} />
 {s.label}
 </span>
 );
}

export const BookAdvisor: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { user } = useAuth();
 const [advisors, setAdvisors] = useState<Advisor[]>([]);
 const [myBookings, setMyBookings] = useState<Booking[]>([]);
 const [loading, setLoading] = useState(true);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [applyingAsAdvisor, setApplyingAsAdvisor] = useState(false);
 const [isOffline, setIsOffline] = useState(false);
 const [showApplyModal, setShowApplyModal] = useState(false);
 const [applyForm, setApplyForm] = useState({
   fullName: '', phone: '', experienceYears: '', expertise: '', bio: '', organizationName: '',
 });
 const [applyFiles, setApplyFiles] = useState<{
   panDocument: File | null; aadhaarDocument: File | null; certDocument: File | null;
 }>({ panDocument: null, aadhaarDocument: null, certDocument: null });

 const [form, setForm] = useState({
 sessionType: 'video' as SessionType,
 topic: '',
 message: '',
 preferredDate: '',
 preferredTime: '',
 });

 const fetchData = useCallback(async () => {
 setLoading(true);
 setIsOffline(false);
 try {
 const [advisorRes, bookingRes] = await Promise.allSettled([
 backendService.api.get('/advisors'),
 backendService.api.get('/bookings'),
 ]);
 
 if (advisorRes.status === 'fulfilled') {
 setAdvisors(Array.isArray(advisorRes.value.data) ? advisorRes.value.data : []);
 } else {
 console.warn('Advisors API failed');
 if ((advisorRes as any).reason?.status >= 500) setIsOffline(true);
 }
 
 if (bookingRes.status === 'fulfilled') {
 setMyBookings(Array.isArray(bookingRes.value.data) ? bookingRes.value.data : []);
 }
 } catch (err) {
 console.error('Data fetch error:', err);
 setIsOffline(true);
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => { fetchData(); }, [fetchData]);

 const filteredAdvisors = advisors.filter(a => {
   if (!searchQuery) return true;
   const q = searchQuery.toLowerCase();
   return a.name.toLowerCase().includes(q) ||
     (a.advisorApplication?.expertise?.toLowerCase().includes(q) ?? false) ||
     (a.advisorApplication?.bio?.toLowerCase().includes(q) ?? false);
 });

 const handleSelectAdvisor = (advisor: Advisor) => {
 setSelectedAdvisor(advisor);
 setForm({ sessionType: 'video', topic: '', message: '', preferredDate: '', preferredTime: '' });
 };

 const handleSubmitBooking = async () => {
 if (!selectedAdvisor || !form.preferredDate || !form.preferredTime || !form.topic) {
 toast.error('Please fill in topic, date, and time');
 return;
 }
 setIsSubmitting(true);
 try {
 await backendService.api.post('/bookings', {
 advisorId: selectedAdvisor.id,
 sessionType: form.sessionType,
 description: [form.topic, form.message].filter(Boolean).join('\n\n'),
 proposedDate: form.preferredDate,
 proposedTime: form.preferredTime,
 duration: 60,
 amount: 0,
 });
 toast.success('Booking request sent!');
 setSelectedAdvisor(null);
 fetchData();
 } catch (err: any) {
 toast.error(err?.response?.data?.error || 'Failed to submit booking');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleApplyAsAdvisor = () => {
   setApplyForm(f => ({ ...f, fullName: (user?.user_metadata?.full_name as string | undefined) ?? (user?.user_metadata?.name as string | undefined) ?? f.fullName }));
   setShowApplyModal(true);
 };

 const handleSubmitApplication = async () => {
   if (!applyFiles.panDocument || !applyFiles.aadhaarDocument) {
     toast.error('PAN card and Aadhaar card documents are required');
     return;
   }
   if (!applyForm.fullName || !applyForm.phone || !applyForm.experienceYears || !applyForm.expertise || !applyForm.bio) {
     toast.error('Please fill all required fields');
     return;
   }
   const panDoc = applyFiles.panDocument;
   const aadhaarDoc = applyFiles.aadhaarDocument;
   setApplyingAsAdvisor(true);
   try {
     const fd = new FormData();
     Object.entries(applyForm).forEach(([k, v]) => { if (v) fd.append(k, v); });
     fd.append('panDocument', panDoc);
     fd.append('aadhaarDocument', aadhaarDoc);
     if (applyFiles.certDocument) fd.append('certDocument', applyFiles.certDocument);
     await backendService.api.post('/advisors/apply', fd);
     toast.success('Application submitted! We will review it within 24–48 hours.');
     setShowApplyModal(false);
   } catch (err: any) {
     toast.error(err?.response?.data?.error || 'Failed to submit application');
   } finally {
     setApplyingAsAdvisor(false);
   }
 };

 const clientBookings = myBookings.filter(b => !b.advisorId || b.advisorId !== user?.id);

 return (
 <div className="flex flex-col min-h-screen bg-white">

 {/* High Density Header */}
 <header className="flex items-center justify-between px-4 lg:px-6 py-4 bg-white border-b border-slate-100 shrink-0">
 <div className="flex items-center gap-3">
 <button type="button" aria-label="Go to dashboard" onClick={() => setCurrentPage('dashboard')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
 <ChevronLeft size={20} />
 </button>
 <div className="flex items-center gap-4">
 <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
 <Briefcase size={20} />
 </div>
 <div>
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Find an Advisor</h1>
 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Professional Financial Consultation</p>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <button 
 onClick={handleApplyAsAdvisor} 
 disabled={applyingAsAdvisor}
 className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-slate-50 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-200"
 data-testid="advisor-become-button"
 >
 {applyingAsAdvisor ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
 Become an Advisor
 </button>
 <button 
 onClick={() => setCurrentPage('dashboard')} 
 className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4"
 >
 Close
 </button>
 </div>
 </header>

 {/* Main Content Area */}
 <main className="flex-1 lg:overflow-hidden flex flex-col lg:flex-row p-3 lg:p-5 gap-4 pb-32 lg:pb-5">
 
 {/* Left Section: Advisor List & Search (lg:w-2/3) */}
 <div className="flex-1 flex flex-col gap-4 lg:overflow-hidden min-w-0">
 
 {/* Search & Stats Bar */}
 <div className="premium-glass-card p-2 flex flex-col sm:flex-row gap-2 items-center">
 <div className="relative flex-1 w-full">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
 <input 
 type="text" 
 value={searchQuery} 
 onChange={e => setSearchQuery(e.target.value)}
 placeholder="Search by name, expertise..." 
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 font-bold text-slate-900 text-xs"
 data-testid="advisor-search-input"
 />
 </div>
 <div className="flex items-center gap-2 px-3">
 <div className="flex -space-x-2">
 {[1,2,3].map(i => (
 <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-slate-200" />
 ))}
 </div>
 <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">{advisors.length} Advisors Online</span>
 </div>
 </div>

 {/* Offline/Error State */}
 {isOffline && (
 <div className="premium-glass-card p-8 flex flex-col items-center text-center bg-rose-50/30 border-rose-100">
 <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-4">
 <AlertCircle size={24} />
 </div>
 <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Database Offline</h3>
 <p className="text-xs text-slate-500 mt-2 max-w-xs">We're having trouble connecting to the advisor network. Please try again in a few minutes.</p>
 <button onClick={fetchData} className="mt-4 flex items-center gap-2 px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all">
 <RefreshCw size={12} /> Retry Connection
 </button>
 </div>
 )}

 {/* Advisor Grid */}
 <div className="flex-1 lg:overflow-y-auto pb-10">
 {loading ? (
 <div className="flex flex-col items-center justify-center py-20 opacity-40">
 <Loader2 size={32} className="animate-spin text-indigo-600 mb-4" />
 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synchronizing Network...</p>
 </div>
 ) : filteredAdvisors.length === 0 && !isOffline ? (
 <div className="premium-glass-card p-12 flex flex-col items-center text-center">
 <Briefcase size={48} className="text-slate-200 mb-4" />
 <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">No Advisors Found</h3>
 <p className="text-xs text-slate-400 mt-1">Try adjusting your search or search for specific tags.</p>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {filteredAdvisors.map(advisor => (
 <motion.div 
 key={advisor.id}
 layoutId={advisor.id}
 onClick={() => handleSelectAdvisor(advisor)}
 className={cn(
"premium-glass-card p-5 cursor-pointer transition-all border-2",
 selectedAdvisor?.id === advisor.id ?"border-indigo-600 shadow-xl shadow-indigo-100" :"border-transparent hover:border-slate-200"
 )}
 data-testid={`advisor-card-${advisor.id}`}
 >
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center text-white text-xl font-black shadow-lg">
 {advisor.name.charAt(0)}
 </div>
 <div className="min-w-0">
 <h3 className="font-bold text-slate-900 text-sm truncate">{advisor.name}</h3>
 {advisor.advisorApplication?.expertise && (
   <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest truncate mt-0.5">{advisor.advisorApplication.expertise}</p>
 )}
 <div className="flex items-center gap-2 mt-1 flex-wrap">
 <div className="flex items-center gap-0.5 text-amber-500">
 <Star size={10} className="fill-current" />
 <span className="text-[10px] font-black">{advisor.averageRating > 0 ? advisor.averageRating.toFixed(1) : 'New'}</span>
 </div>
 <span className="text-[10px] font-bold text-slate-400">({advisor.reviewCount} reviews)</span>
 {advisor.advisorApplication?.experienceYears != null && (
   <span className="text-[9px] font-bold text-slate-400">· {advisor.advisorApplication.experienceYears}y exp</span>
 )}
 </div>
 </div>
 </div>
 <div className={cn(
"px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
 advisor.availability ?"bg-emerald-500/10 text-emerald-600" :"bg-slate-100 text-slate-400"
 )}>
 {advisor.availability ? 'Available' : 'Busy'}
 </div>
 </div>

 <div className="flex gap-1.5 flex-wrap mb-4">
 {DAYS.map((day, idx) => {
 const slot = advisor.advisorAvailability?.find(s => s.dayOfWeek === idx && s.isActive);
 return (
 <div key={day} className={cn(
"w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black uppercase transition-colors border",
 slot ?"bg-indigo-600 text-white border-indigo-600" :"bg-slate-50 text-slate-300 border-transparent"
 )}>
 {day.charAt(0)}
 </div>
 );
 })}
 </div>

 {advisor.advisorApplication?.bio && (
   <p className="text-[10px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">{advisor.advisorApplication.bio}</p>
 )}

 <button className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 group">
 Select Advisor <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
 </button>
 </motion.div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Right Section: Booking Panel or Activity (lg:w-1/3) */}
 <aside className="lg:w-[380px] shrink-0 flex flex-col gap-4 lg:overflow-hidden">
 
 <AnimatePresence mode="wait">
 {selectedAdvisor ? (
 <motion.div 
 key="booking-form"
 initial={{ x: 20, opacity: 0 }}
 animate={{ x: 0, opacity: 1 }}
 exit={{ x: 20, opacity: 0 }}
 className="premium-glass-card h-full flex flex-col bg-white overflow-hidden shadow-2xl"
 >
 <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-black">
 {selectedAdvisor.name.charAt(0)}
 </div>
 <div>
 <p className="text-[8px] font-black uppercase text-white/60 tracking-widest">Booking Request</p>
 <p className="text-[10px] font-black truncate max-w-[150px]">{selectedAdvisor.name}</p>
 </div>
 </div>
 <button type="button" aria-label="Close booking panel" onClick={() => setSelectedAdvisor(null)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
 <X size={16} />
 </button>
 </div>

 <div className="flex-1 lg:overflow-y-auto p-5 space-y-5 no-scrollbar">
 {/* Session Type */}
 <div className="space-y-2">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Session Method</label>
 <div className="grid grid-cols-3 gap-2">
 {SESSION_TYPES.map(st => (
 <button 
 key={st.id} 
 onClick={() => setForm(f => ({ ...f, sessionType: st.id }))}
 className={cn(
"flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all",
 form.sessionType === st.id ?"border-indigo-600 bg-indigo-50 text-indigo-700" :"border-slate-100 text-slate-400 hover:border-slate-200"
 )}
 data-testid={`advisor-booking-session-${st.id}-button`}
 >
 <st.icon size={16} />
 <span className="text-[9px] font-black uppercase">{st.label}</span>
 </button>
 ))}
 </div>
 </div>

 {/* Topic */}
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Topic of Interest</label>
 <div className="relative">
 <Zap className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
 <input 
 type="text" 
 value={form.topic} 
 onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 font-bold text-slate-900 text-xs"
 placeholder="e.g. Tax Review 2024"
 data-testid="advisor-booking-topic-input"
 />
 </div>
 </div>

 {/* Date/Time */}
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1">
 <label htmlFor="booking-preferred-date" className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Preferred Date</label>
 <input
 id="booking-preferred-date"
 type="date"
 value={form.preferredDate}
 onChange={e => setForm(f => ({ ...f, preferredDate: e.target.value }))}
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs"
 data-testid="advisor-booking-date-input"
 />
 </div>
 <div className="space-y-1">
 <label htmlFor="booking-preferred-time" className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Start Time</label>
 <input
 id="booking-preferred-time"
 type="time"
 value={form.preferredTime}
 onChange={e => setForm(f => ({ ...f, preferredTime: e.target.value }))}
 className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs"
 data-testid="advisor-booking-time-input"
 />
 </div>
 </div>

 {/* Note */}
 <div className="space-y-1">
 <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Brief Context</label>
 <textarea 
 rows={3} 
 value={form.message} 
 onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
 className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 text-xs resize-none"
 placeholder="Add any specific details..."
 data-testid="advisor-booking-notes-textarea"
 />
 </div>
 
 {/* Advisor Info Hint */}
 <div className="p-3 bg-indigo-50 rounded-xl flex gap-3 items-start border border-indigo-100">
 <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white shrink-0"><Info size={12} /></div>
 <p className="text-[9px] font-bold text-indigo-700 leading-relaxed">
 Session duration is fixed at 60 mins. The advisor will review and confirm your request within 24 hours.
 </p>
 </div>
 </div>

 <div className="p-5 bg-slate-50 border-t border-slate-100 mt-auto">
 <button 
 onClick={handleSubmitBooking}
 disabled={isSubmitting || !form.preferredDate || !form.preferredTime || !form.topic}
 className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
 data-testid="advisor-booking-submit-button"
 >
 {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
 Confirm Booking Request
 </button>
 </div>
 </motion.div>
 ) : (
 <motion.div 
 key="my-bookings"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 className="flex flex-col h-full gap-4"
 >
 {/* Dashboard Stats */}
 <div className="premium-glass-card p-5 bg-indigo-600 text-white overflow-hidden relative">
 <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 blur-3xl rounded-full" />
 <Sparkles className="absolute top-4 right-4 text-white/20" size={24} />
 <p className="text-[9px] font-black uppercase text-white/60 tracking-widest">My Consultation History</p>
 <h2 className="text-3xl font-black mt-2 tracking-tighter">{clientBookings.length}</h2>
 <p className="text-[10px] font-bold text-white/80 mt-1">Sessions booked so far</p>
 </div>

 {/* Bookings List */}
 <div className="premium-glass-card flex-1 flex flex-col p-4 lg:overflow-hidden">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Activity</h3>
 <button type="button" aria-label="Refresh bookings" onClick={fetchData} className="text-indigo-600 hover:rotate-180 transition-transform duration-500">
 <RefreshCw size={12} />
 </button>
 </div>
 
 <div className="flex-1 lg:overflow-y-auto space-y-3 no-scrollbar pb-6">
 {clientBookings.length === 0 ? (
 <div className="h-full flex flex-col items-center justify-center opacity-30">
 <MessageSquare size={32} className="mb-2" />
 <p className="text-[9px] font-black uppercase tracking-widest">No active sessions</p>
 </div>
 ) : (
 clientBookings.map(b => (
 <div key={b.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
 <div className="flex items-center justify-between mb-2">
 <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
 <Briefcase size={14} />
 </div>
 {getStatusBadge(b.status)}
 </div>
 <p className="text-[10px] font-black text-slate-900 line-clamp-1">{b.description || 'General Consultation'}</p>
 <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50">
 <div className="flex items-center gap-1.5 text-slate-400">
 <Calendar size={10} />
 <span className="text-[9px] font-bold">{new Date(b.proposedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
 </div>
 <div className="flex items-center gap-1.5 text-slate-400">
 <Clock size={10} />
 <span className="text-[9px] font-bold">{b.proposedTime}</span>
 </div>
 </div>
 </div>
 ))
 )}
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 </aside>

 </main>

 {/* Apply as Advisor Modal */}
 <AnimatePresence>
 {showApplyModal && (
   <motion.div
     initial={{ opacity: 0 }}
     animate={{ opacity: 1 }}
     exit={{ opacity: 0 }}
     className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
     onClick={e => { if (e.target === e.currentTarget) setShowApplyModal(false); }}
   >
     <motion.div
       initial={{ scale: 0.95, y: 10 }}
       animate={{ scale: 1, y: 0 }}
       exit={{ scale: 0.95, y: 10 }}
       className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
     >
       <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
         <div>
           <p className="text-[8px] font-black uppercase tracking-widest text-white/60">Join Our Network</p>
           <h3 className="font-black text-lg tracking-tight">Become an Advisor</h3>
         </div>
         <button onClick={() => setShowApplyModal(false)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
           <X size={18} />
         </button>
       </div>

       <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
         {/* Text fields */}
         {([
           { key: 'fullName', label: 'Full Name *', type: 'text', placeholder: 'Your legal name', testId: 'advisor-apply-name-input' },
           { key: 'phone', label: 'Phone Number *', type: 'tel', placeholder: '+91 98765 43210', testId: 'advisor-apply-phone-input' },
           { key: 'expertise', label: 'Area of Expertise *', type: 'text', placeholder: 'e.g. Mutual Funds, Tax Planning', testId: 'advisor-apply-expertise-input' },
           { key: 'experienceYears', label: 'Years of Experience *', type: 'number', placeholder: '5', testId: 'advisor-apply-experience-input' },
           { key: 'organizationName', label: 'Organization (optional)', type: 'text', placeholder: 'e.g. XYZ Financial Advisors', testId: 'advisor-apply-organization-input' },
         ] as { key: keyof typeof applyForm; label: string; type: string; placeholder: string; testId: string }[]).map(f => (
           <div key={f.key} className="space-y-1">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</label>
             <input
               type={f.type}
               value={applyForm[f.key]}
               onChange={e => setApplyForm(p => ({ ...p, [f.key]: e.target.value }))}
               placeholder={f.placeholder}
               className="w-full bg-slate-50 rounded-xl py-2.5 px-4 text-sm font-medium text-slate-900 border-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
               data-testid={f.testId}
             />
           </div>
         ))}
         <div className="space-y-1">
           <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bio *</label>
           <textarea
             rows={3}
             value={applyForm.bio}
             onChange={e => setApplyForm(p => ({ ...p, bio: e.target.value }))}
             placeholder="Briefly describe your background and what clients can expect..."
             className="w-full bg-slate-50 rounded-xl py-2.5 px-4 text-sm font-medium text-slate-900 border-none resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
             data-testid="advisor-apply-bio-textarea"
           />
         </div>

         {/* Document uploads */}
         <div className="pt-2 border-t border-slate-100 space-y-3">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Identity Documents</p>
           {([
             { key: 'panDocument', label: 'PAN Card *', accept: 'image/*,.pdf', testId: 'advisor-apply-pan-upload' },
             { key: 'aadhaarDocument', label: 'Aadhaar Card *', accept: 'image/*,.pdf', testId: 'advisor-apply-aadhaar-upload' },
             { key: 'certDocument', label: 'Professional Certificate (optional)', accept: 'image/*,.pdf', testId: 'advisor-apply-cert-upload' },
           ] as { key: keyof typeof applyFiles; label: string; accept: string; testId: string }[]).map(f => (
             <div key={f.key} className="space-y-1">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</label>
               <div className={cn('flex items-center gap-3 p-3 rounded-xl border-2 border-dashed transition-colors', applyFiles[f.key] ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50')}>
                 <Award size={16} className={applyFiles[f.key] ? 'text-indigo-600' : 'text-slate-300'} />
                 <label className="flex-1 cursor-pointer">
                   <span className="text-[10px] font-bold text-slate-600">{applyFiles[f.key] ? applyFiles[f.key]!.name : 'Click to upload (JPEG, PNG, PDF)'}</span>
                   <input
                     type="file"
                     accept={f.accept}
                     className="hidden"
                     onChange={e => setApplyFiles(p => ({ ...p, [f.key]: e.target.files?.[0] || null }))}
                     data-testid={f.testId}
                   />
                 </label>
               </div>
             </div>
           ))}
         </div>
       </div>

       <div className="p-6 border-t border-slate-100 flex gap-3">
         <button onClick={() => setShowApplyModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors" data-testid="advisor-apply-cancel-button">
           Cancel
         </button>
         <button
           onClick={handleSubmitApplication}
           disabled={applyingAsAdvisor}
           className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
           data-testid="advisor-apply-submit-button"
         >
           {applyingAsAdvisor ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
           Submit Application
         </button>
       </div>
     </motion.div>
   </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
};
