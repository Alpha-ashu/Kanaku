import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
 Briefcase, Clock, CheckCircle, XCircle,
 RotateCw, Power, Users, IndianRupee, Calendar, Loader2, ChevronLeft,
 Star, CheckCircle2, TrendingUp, Bell
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type WorkspaceTab = 'bookings' | 'clients' | 'schedule' | 'earnings';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getStatusBadge(status: string) {
 const map: Record<string, { color: string; label: string }> = {
 pending: { color: 'bg-amber-50 text-amber-700 border border-amber-200', label: 'Pending' },
 accepted: { color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Confirmed' },
 scheduled: { color: 'bg-blue-50 text-blue-700 border border-blue-200', label: 'Scheduled' },
 rejected: { color: 'bg-red-50 text-red-600 border border-red-200', label: 'Declined' },
 reschedule: { color: 'bg-violet-50 text-violet-700 border border-violet-200', label: 'Rescheduling' },
 cancelled: { color: 'bg-gray-100 text-gray-500 border border-gray-200', label: 'Cancelled' },
 completed: { color: 'bg-slate-100 text-slate-600 border border-slate-200', label: 'Completed' },
 };
 const s = map[status] ?? map.pending;
 return <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold', s.color)}>{s.label}</span>;
}

export const AdvisorWorkspace: React.FC = () => {
 const { setCurrentPage } = useApp();
 const { user, role } = useAuth();
 const [activeTab, setActiveTab] = useState<WorkspaceTab>('bookings');
 const [bookings, setBookings] = useState<any[]>([]);
 const [sessions, setSessions] = useState<any[]>([]);
 const [availability, setAvailability] = useState<any[]>([]);
 const [advisorProfile, setAdvisorProfile] = useState<any>(null);
 const [loading, setLoading] = useState(true);
 const [processingId, setProcessingId] = useState<string | null>(null);
 const [isTogglingAvail, setIsTogglingAvail] = useState(false);
 const [rescheduleModal, setRescheduleModal] = useState<{ id: string; date: string; time: string } | null>(null);

 // Only advisors can access this
 if (role !== 'advisor') {
 return (
 <div className="flex items-center justify-center min-h-screen bg-white">
 <div className="text-center py-12 px-6">
 <Briefcase size={48} className="mx-auto text-gray-300 mb-4" />
 <h2 className="text-2xl font-bold text-gray-900 mb-2">Advisor Access Only</h2>
 <p className="text-gray-500 mb-6">This workspace is for approved financial advisors.</p>
 <button data-testid="advisor-workspace-apply-as-advisor" onClick={() => setCurrentPage('book-advisor')} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm">Apply as Advisor</button>
 </div>
 </div>
 );
 }

 const fetchData = useCallback(async () => {
 setLoading(true);
 try {
 const [profileRes, bookingsRes, sessionsRes, availRes] = await Promise.allSettled([
 backendService.api.get(`/advisors/${user?.id}`),
 backendService.api.get('/bookings?role=advisor'),
 backendService.api.get('/advisors/me/sessions'),
 backendService.api.get(`/advisors/${user?.id}/availability`),
 ]);
 if (profileRes.status === 'fulfilled') setAdvisorProfile(profileRes.value.data);
 if (bookingsRes.status === 'fulfilled') setBookings(Array.isArray(bookingsRes.value.data) ? bookingsRes.value.data : []);
 if (sessionsRes.status === 'fulfilled') setSessions(Array.isArray(sessionsRes.value.data) ? sessionsRes.value.data : []);
 if (availRes.status === 'fulfilled') setAvailability(Array.isArray(availRes.value.data) ? availRes.value.data : []);
 } catch { toast.error('Failed to load workspace data'); }
 finally { setLoading(false); }
 }, [user?.id]);

 useEffect(() => { fetchData(); }, [fetchData]);

 const handleAccept = async (id: string) => {
 setProcessingId(id);
 try { await backendService.api.put(`/bookings/${id}/accept`, {}); toast.success('Booking accepted!'); fetchData(); }
 catch (err: any) { toast.error(err?.response?.data?.error || 'Failed to accept'); }
 finally { setProcessingId(null); }
 };

 const handleReject = async (id: string) => {
 setProcessingId(id);
 try { await backendService.api.put(`/bookings/${id}/reject`, { reason: 'Unable to accommodate.' }); toast.success('Booking declined.'); fetchData(); }
 catch { toast.error('Failed to decline'); }
 finally { setProcessingId(null); }
 };

 const handleReschedule = async () => {
 if (!rescheduleModal || !rescheduleModal.date || !rescheduleModal.time) return;
 setProcessingId(rescheduleModal.id);
 try {
 await backendService.api.put(`/bookings/${rescheduleModal.id}/reschedule`, { proposedDate: rescheduleModal.date, proposedTime: rescheduleModal.time });
 toast.success('Reschedule proposed.'); setRescheduleModal(null); fetchData();
 } catch { toast.error('Failed to reschedule'); }
 finally { setProcessingId(null); }
 };

 const toggleAvailability = async () => {
 setIsTogglingAvail(true);
 try {
 await backendService.api.put('/advisors/availability/status', { available: !advisorProfile?.availability });
 toast.success('Availability updated'); fetchData();
 } catch { toast.error('Failed to update'); }
 finally { setIsTogglingAvail(false); }
 };

 const updateDaySlot = async (idx: number, isActive: boolean) => {
 const startEl = document.getElementById(`avail-start-${idx}`) as HTMLInputElement;
 const endEl = document.getElementById(`avail-end-${idx}`) as HTMLInputElement;
 try {
 await backendService.api.post('/advisors/availability', {
 dayOfWeek: idx, startTime: startEl?.value ?? '09:00',
 endTime: endEl?.value ?? '17:00', isActive,
 });
 toast.success('Schedule saved'); fetchData();
 } catch { toast.error('Failed to save'); }
 };

 const pending = bookings.filter(b => b.status === 'pending');
 const confirmed = bookings.filter(b => ['accepted', 'scheduled'].includes(b.status));
 const totalEarnings = sessions.filter(s => s.status === 'completed').reduce((s: number, sess: any) => s + (Number(sess.amount) || 0), 0);

 const TABS: { id: WorkspaceTab; label: string; icon: React.ElementType; badge?: number }[] = [
 { id: 'bookings', label: 'Bookings', icon: Calendar, badge: pending.length || undefined },
 { id: 'clients', label: 'Clients', icon: Users },
 { id: 'schedule', label: 'Schedule', icon: Clock },
 { id: 'earnings', label: 'Earnings', icon: IndianRupee },
 ];

 return (
 <div className="min-h-screen bg-white">
 {/* Header */}
 <div className="bg-transparent border-b border-gray-100 px-4 lg:px-8 py-4 sticky top-0 z-10">
 <div className="max-w-5xl mx-auto flex items-center gap-3">
 <button data-testid="advisor-workspace-button" onClick={() => setCurrentPage('dashboard')} className="p-2 hover:bg-gray-100 rounded-xl md:!hidden"><ChevronLeft size={20} className="text-gray-600" /></button>
 <div className="flex items-center gap-4">
 <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Advisor Workspace</h1>
 </div>
 <button onClick={toggleAvailability} disabled={isTogglingAvail}
 className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all',
 advisorProfile?.availability ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-white text-gray-600')}
 data-testid="advisor-ws-avail-status-button"
 >
 {isTogglingAvail ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
 {advisorProfile?.availability ? 'Available' : 'Unavailable'}
 </button>
 </div>
 </div>

 {/* Tab Bar */}
 <div className="bg-white border-b border-gray-100">
 <div className="max-w-5xl mx-auto px-4 lg:px-8 flex overflow-x-auto scrollbar-hide">
 {TABS.map(tab => (
 <button key={tab.id} onClick={() => setActiveTab(tab.id)}
 className={cn('relative flex items-center gap-1.5 px-5 py-4 text-sm font-bold whitespace-nowrap border-b-2 transition-all',
 activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700')}
 data-testid={`advisor-ws-tab-${tab.id}-button`}
 >
 <tab.icon size={15} />{tab.label}
 {tab.badge ? <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white rounded-full text-[10px] font-black leading-none">{tab.badge}</span> : null}
 </button>
 ))}
 </div>
 </div>

 <div className="max-w-5xl mx-auto px-4 lg:px-8 py-6">
 {loading ? (
 <div className="flex items-center justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
 ) : (
 <>
 {/* BOOKINGS */}
 {activeTab === 'bookings' && (
 <div className="space-y-6">
 {pending.length > 0 && (
 <section>
 <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-600 mb-3 flex items-center gap-2"><Bell size={13} /> Pending Review ({pending.length})</h2>
 <div className="space-y-3">
 {pending.map(b => (
 <div key={b.id} className="bg-white rounded-2xl border-2 border-amber-200 p-5 shadow-sm">
 <div className="flex items-start gap-3 mb-4">
 <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center font-black text-amber-700 shrink-0">{b.client?.name?.charAt(0)?.toUpperCase() ?? '?'}</div>
 <div className="flex-1">
 <p className="font-bold text-gray-900">{b.client?.name ?? 'Client'}</p>
 <p className="text-xs text-gray-500">{b.client?.email}</p>
 <p className="text-sm text-gray-700 mt-1">{b.description}</p>
 <p className="text-xs text-gray-400 mt-1">{b.sessionType} {new Date(b.proposedDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} at {b.proposedTime}</p>
 </div>
 </div>
 <div className="flex gap-2">
 <button onClick={() => handleAccept(b.id)} disabled={processingId === b.id}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-emerald-700"
 data-testid={`advisor-ws-booking-accept-${b.id}`}
 >
 {processingId === b.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Accept
 </button>
 <button onClick={() => setRescheduleModal({ id: b.id, date: '', time: '' })} disabled={processingId === b.id}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm font-bold disabled:opacity-50"
 data-testid={`advisor-ws-booking-reschedule-toggle-${b.id}`}
 >
 <RotateCw size={13} /> Reschedule
 </button>
 <button onClick={() => handleReject(b.id)} disabled={processingId === b.id}
 className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-bold disabled:opacity-50"
 data-testid={`advisor-ws-booking-reject-${b.id}`}
 >
 <XCircle size={13} /> Decline
 </button>
 </div>
 </div>
 ))}
 </div>
 </section>
 )}
 <section>
 <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Upcoming Sessions ({confirmed.length})</h2>
 {confirmed.length === 0 ? (
 <div className="text-center py-10 bg-white rounded-2xl border border-gray-100"><Calendar size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-gray-500 text-sm">No confirmed sessions</p></div>
 ) : confirmed.map(b => (
 <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 mb-2">
 <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center font-black text-indigo-600 text-sm shrink-0">{b.client?.name?.charAt(0) ?? '?'}</div>
 <div className="flex-1 min-w-0">
 <p className="font-bold text-gray-900 text-sm">{b.client?.name ?? 'Client'}</p>
 <p className="text-xs text-gray-500">{b.sessionType} {new Date(b.proposedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} at {b.proposedTime}</p>
 </div>
 {getStatusBadge(b.status)}
 </div>
 ))}
 </section>
 </div>
 )}

 {/* CLIENTS */}
 {activeTab === 'clients' && (
 <div className="space-y-4">
 <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">All Clients ({[...new Set(sessions.map((s: any) => s.clientId))].length})</h2>
 {sessions.length === 0 ? (
 <div className="text-center py-16 bg-white rounded-2xl border border-gray-100"><Users size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500">No clients yet</p></div>
 ) : (
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {[...new Map(sessions.map((s: any) => [s.clientId, s])).values()].map((s: any) => (
 <div key={s.clientId} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
 <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black">
 {s.client?.name?.charAt(0)?.toUpperCase() ?? '?'}
 </div>
 <div className="flex-1 min-w-0">
 <p className="font-bold text-gray-900">{s.client?.name ?? `Client ${s.clientId?.slice(-6)}`}</p>
 <p className="text-xs text-gray-500 truncate">{s.client?.email}</p>
 </div>
 <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[11px] font-bold border border-indigo-100">
 {sessions.filter((ss: any) => ss.clientId === s.clientId).length} sessions
 </span>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* SCHEDULE */}
 {activeTab === 'schedule' && (
 <div className="space-y-4">
 <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
 <p className="text-sm text-blue-700">Set which days and hours you're available. Enable a day, set times, and save.</p>
 </div>
 {DAYS.map((day, idx) => {
 const slot = availability.find((a: any) => a.dayOfWeek === idx);
 return (
 <div key={day} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
 <div className="flex items-center gap-4 flex-wrap">
 <div className="w-14 text-center shrink-0">
 <p className="text-sm font-black text-gray-800">{DAYS_SHORT[idx]}</p>
 </div>
 <div className="flex gap-2 flex-1">
 <div className="flex-1">
 <label className="text-[10px] font-bold text-gray-400 block mb-1">From</label>
 <input type="time" id={`avail-start-${idx}`} defaultValue={slot?.startTime ?? '09:00'}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid={`advisor-ws-sched-start-${idx}`} />
 </div>
 <div className="flex-1">
 <label className="text-[10px] font-bold text-gray-400 block mb-1">To</label>
 <input type="time" id={`avail-end-${idx}`} defaultValue={slot?.endTime ?? '17:00'}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid={`advisor-ws-sched-end-${idx}`} />
 </div>
 </div>
 <button onClick={() => updateDaySlot(idx, !(slot?.isActive))}
 className={cn('px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all whitespace-nowrap shrink-0',
 slot?.isActive ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300')}
 data-testid={`advisor-ws-sched-active-toggle-${idx}`}
 >
 {slot?.isActive ? ' Active' : 'Set Active'}
 </button>
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* EARNINGS */}
 {activeTab === 'earnings' && (
 <div className="space-y-5">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
 <TrendingUp size={20} className="mb-2 opacity-80" />
 <p className="text-2xl font-black">{totalEarnings.toLocaleString('en-IN')}</p>
 <p className="text-sm text-emerald-100 mt-0.5">Total Earnings</p>
 </div>
 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
 <CheckCircle2 size={20} className="mb-2 text-indigo-500" />
 <p className="text-2xl font-black text-gray-900">{sessions.filter((s: any) => s.status === 'completed').length}</p>
 <p className="text-sm text-gray-500 mt-0.5">Sessions Done</p>
 </div>
 </div>
 <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Session History</h2>
 {sessions.length === 0 ? (
 <div className="text-center py-10 bg-white rounded-2xl border border-gray-100"><IndianRupee size={32} className="mx-auto text-gray-300 mb-2" /><p className="text-gray-500 text-sm">No sessions yet</p></div>
 ) : sessions.map((s: any) => (
 <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 mb-2 shadow-sm">
 <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><IndianRupee size={16} className="text-emerald-600" /></div>
 <div className="flex-1 min-w-0">
 <p className="font-bold text-gray-900 text-sm">{s.client?.name ?? 'Client'}</p>
 <p className="text-xs text-gray-500">{s.sessionType} {s.startTime ? new Date(s.startTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'TBD'}</p>
 </div>
 <div className="text-right shrink-0">
 {s.amount ? <p className="font-black text-emerald-700 text-sm">{Number(s.amount).toLocaleString('en-IN')}</p> : <p className="text-xs text-gray-400"></p>}
 {s.rating && <span className="flex items-center gap-0.5 text-amber-500 text-xs justify-end"><Star size={10} className="fill-amber-400" />{s.rating}</span>}
 </div>
 {getStatusBadge(s.status)}
 </div>
 ))}
 </div>
 )}
 </>
 )}
 </div>

 {/* Reschedule Modal */}
 <AnimatePresence>
 {rescheduleModal && (
 <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
 className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
 <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><RotateCw size={18} className="text-indigo-600" /> Propose New Time</h3>
 <div className="space-y-3">
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-1">New Date</label>
 <input type="date" value={rescheduleModal.date} min={new Date().toISOString().slice(0, 10)}
 onChange={e => setRescheduleModal(m => m ? { ...m, date: e.target.value } : null)}
 className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid="advisor-ws-resched-date-input" />
 </div>
 <div>
 <label className="block text-sm font-bold text-gray-700 mb-1">New Time</label>
 <input type="time" value={rescheduleModal.time}
 onChange={e => setRescheduleModal(m => m ? { ...m, time: e.target.value } : null)}
 className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid="advisor-ws-resched-time-input" />
 </div>
 </div>
 <div className="flex gap-3 mt-5">
 <button onClick={() => setRescheduleModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-700" data-testid="advisor-ws-resched-cancel-button">Cancel</button>
 <button onClick={handleReschedule} disabled={!rescheduleModal.date || !rescheduleModal.time || processingId !== null}
 className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
 data-testid="advisor-ws-resched-submit-button"
 >
 {processingId ? <Loader2 size={14} className="animate-spin" /> : null} Send
 </button>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 </div>
 );
};
