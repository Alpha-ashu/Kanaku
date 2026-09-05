import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
  Briefcase, Clock, CheckCircle, XCircle,
  RotateCw, Power, Users, IndianRupee, Calendar, Loader2, ChevronLeft,
  Star, CheckCircle2, TrendingUp, Bell, MessageSquare, Send, Play, X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type WorkspaceTab = 'bookings' | 'clients' | 'schedule' | 'earnings' | 'updates';

interface AdvisorPostRow {
  id: string;
  category: string;
  title: string;
  content: string;
  createdAt: string;
  likes: number;
}

const POST_CATEGORIES = ['Tax Alert', 'GST Update', 'Market Insight', 'Investment', 'Compliance', 'Update'];

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
 const [posts, setPosts] = useState<AdvisorPostRow[]>([]);
 const [postForm, setPostForm] = useState({ category: POST_CATEGORIES[0], title: '', content: '' });
 const [isPublishing, setIsPublishing] = useState(false);

 const [consultationModal, setConsultationModal] = useState<{
    booking: any;
    sessionId: string;
    status: string;
  } | null>(null);
  const [consultationMessages, setConsultationMessages] = useState<any[]>([]);
  const [newConsultationMsg, setNewConsultationMsg] = useState('');
  const [isSendingConsultationMsg, setIsSendingConsultationMsg] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [consultationNotes, setConsultationNotes] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const openConsultation = async (b: any) => {
    const sess = b.session || sessions.find((s: any) => s.bookingId === b.id);
    const sessId = sess?.id || b.sessionId;
    if (!sessId) {
      toast.error('Consultation session ID is not available for this booking');
      return;
    }
    const currentStatus = sess?.status || 'scheduled';
    setConsultationModal({
      booking: b,
      sessionId: sessId,
      status: currentStatus,
    });
    setIsLoadingMessages(true);
    try {
      const res = await backendService.api.get(`/sessions/${sessId}/messages`);
      setConsultationMessages(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Could not load session messages');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleStartSession = async () => {
    if (!consultationModal) return;
    setIsStartingSession(true);
    try {
      await backendService.api.post(`/sessions/${consultationModal.sessionId}/start`);
      toast.success('Consultation started! Chat is active.');
      setConsultationModal(prev => prev ? { ...prev, status: 'in-progress' } : null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to start session');
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleSendConsultationMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!consultationModal || !newConsultationMsg.trim() || isSendingConsultationMsg) return;
    const text = newConsultationMsg.trim();
    setNewConsultationMsg('');
    setIsSendingConsultationMsg(true);
    try {
      const res = await backendService.api.post(`/sessions/${consultationModal.sessionId}/messages`, {
        message: text,
      });
      setConsultationMessages(prev => [...prev, res.data]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to send message');
      setNewConsultationMsg(text);
    } finally {
      setIsSendingConsultationMsg(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!consultationModal) return;
    setIsCompletingSession(true);
    try {
      await backendService.api.post(`/sessions/${consultationModal.sessionId}/complete`, {
        notes: consultationNotes.trim() || undefined,
      });
      toast.success('Consultation completed! Payment logged.');
      setConsultationModal(prev => prev ? { ...prev, status: 'completed' } : null);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to complete session');
    } finally {
      setIsCompletingSession(false);
    }
  };

 const isAdvisor = role === 'advisor';

 const fetchData = useCallback(async () => {
 // Never fetch advisor-scoped data for a non-advisor.
 if (!isAdvisor) return;
 setLoading(true);
 try {
 const [profileRes, bookingsRes, sessionsRes, availRes, postsRes] = await Promise.allSettled([
 backendService.api.get(`/advisors/${user?.id}`),
 backendService.api.get('/bookings?role=advisor'),
 backendService.api.get('/advisors/me/sessions'),
 backendService.api.get(`/advisors/${user?.id}/availability`),
 backendService.api.get(`/advisors/posts?advisorId=${user?.id}`),
 ]);
 if (profileRes.status === 'fulfilled') setAdvisorProfile(profileRes.value.data);
 if (bookingsRes.status === 'fulfilled') setBookings(Array.isArray(bookingsRes.value.data) ? bookingsRes.value.data : []);
 if (sessionsRes.status === 'fulfilled') setSessions(Array.isArray(sessionsRes.value.data) ? sessionsRes.value.data : []);
 if (availRes.status === 'fulfilled') setAvailability(Array.isArray(availRes.value.data) ? availRes.value.data : []);
 if (postsRes.status === 'fulfilled') setPosts(Array.isArray(postsRes.value.data) ? postsRes.value.data : []);
 } catch { toast.error('Failed to load workspace data'); }
 finally { setLoading(false); }
 }, [user?.id, isAdvisor]);

 useEffect(() => { fetchData(); }, [fetchData]);

 if (!isAdvisor) {
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

 const handlePublishPost = async () => {
 if (!postForm.title.trim() || !postForm.content.trim()) {
 toast.error('Add a title and the update text');
 return;
 }
 setIsPublishing(true);
 try {
 await backendService.api.post('/advisors/posts', {
 category: postForm.category,
 title: postForm.title.trim(),
 content: postForm.content.trim(),
 });
 setPostForm({ category: POST_CATEGORIES[0], title: '', content: '' });
 toast.success('Update published — your followers have been notified');
 fetchData();
 } catch (err: any) {
 toast.error(err?.response?.data?.error || 'Could not publish the update');
 } finally {
 setIsPublishing(false);
 }
 };

 const handleDeletePost = async (id: string) => {
 try {
 await backendService.api.delete(`/advisors/posts/${id}`);
 setPosts(prev => prev.filter(post => post.id !== id));
 toast.success('Update removed');
 } catch (err: any) {
 toast.error(err?.response?.data?.error || 'Could not remove the update');
 }
 };

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
  const settledEarnings = sessions
    .filter(s => s.status === 'completed' && s.payment?.status === 'completed')
    .reduce((acc: number, sess: any) => acc + (Number(sess.amount) || Number(sess.payment?.amount) || 0), 0);
  const pendingEarnings = sessions
    .filter(s => s.status === 'completed' && s.payment?.status !== 'completed')
    .reduce((acc: number, sess: any) => acc + (Number(sess.amount) || Number(sess.payment?.amount) || 0), 0);

 const TABS: { id: WorkspaceTab; label: string; icon: React.ElementType; badge?: number }[] = [
 { id: 'bookings', label: 'Bookings', icon: Calendar, badge: pending.length || undefined },
 { id: 'clients', label: 'Clients', icon: Users },
 { id: 'schedule', label: 'Schedule', icon: Clock },
 { id: 'earnings', label: 'Earnings', icon: IndianRupee },
 { id: 'updates', label: 'Updates', icon: Bell },
 ];

 return (
 <div className="min-h-screen bg-white">
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
 <div className="flex items-center gap-2">
    {getStatusBadge(b.status)}
    <button
      onClick={() => void openConsultation(b)}
      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
      data-testid={`advisor-ws-open-consultation-${b.id}`}
    >
      <MessageSquare size={13} /> Consultation
    </button>
  </div>
 </div>
 ))}
 </section>
 </div>
 )}

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

 {activeTab === 'earnings' && (
 <div className="space-y-5">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
 <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
 <TrendingUp size={20} className="mb-2 opacity-80" />
 <p className="text-2xl font-black">₹{settledEarnings.toLocaleString('en-IN')}</p>
 <p className="text-sm text-emerald-100 mt-0.5">Settled Earnings</p>
 </div>
 <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5">
 <Clock size={20} className="mb-2 text-amber-500" />
 <p className="text-2xl font-black text-amber-700">₹{pendingEarnings.toLocaleString('en-IN')}</p>
 <p className="text-sm text-gray-500 mt-0.5">Pending Settlement</p>
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
 {s.amount ? <p className="font-black text-emerald-700 text-sm">₹{Number(s.amount).toLocaleString('en-IN')}</p> : <p className="text-xs text-gray-400"></p>}
 {s.rating && <span className="flex items-center gap-0.5 text-amber-500 text-xs justify-end"><Star size={10} className="fill-amber-400" />{s.rating}</span>}
 </div>
 <div className="flex items-center gap-1.5 shrink-0">
    {getStatusBadge(s.status)}
    {s.status === 'completed' && (
      s.payment?.status === 'completed' ? (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Paid</span>
      ) : (
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Pending</span>
      )
    )}
  </div>
 </div>
 ))}
 </div>
 )}

 {activeTab === 'updates' && (
 <div className="space-y-5">
 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
 <div>
 <h2 className="text-sm font-black text-gray-900">Publish an update</h2>
 <p className="text-xs text-gray-500 mt-0.5">
 Appears in the client Discover feed. Everyone following you gets a notification.
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <select
 title="Category"
 value={postForm.category}
 onChange={e => setPostForm(f => ({ ...f, category: e.target.value }))}
 className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid="advisor-ws-post-category"
 >
 {POST_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
 </select>
 <input
 type="text"
 placeholder="Headline"
 maxLength={160}
 value={postForm.title}
 onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
 className="sm:col-span-2 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid="advisor-ws-post-title"
 />
 </div>

 <textarea
 rows={4}
 maxLength={5000}
 placeholder="What should your clients know?"
 value={postForm.content}
 onChange={e => setPostForm(f => ({ ...f, content: e.target.value }))}
 className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
 data-testid="advisor-ws-post-content"
 />

 <div className="flex justify-end">
 <button
 onClick={() => void handlePublishPost()}
 disabled={isPublishing}
 className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center gap-2"
 data-testid="advisor-ws-post-publish"
 >
 {isPublishing ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
 Publish
 </button>
 </div>
 </div>

 <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Your updates</h2>
 {posts.length === 0 ? (
 <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
 <Bell size={32} className="mx-auto text-gray-300 mb-2" />
 <p className="text-gray-500 text-sm">You have not published anything yet</p>
 </div>
 ) : posts.map(post => (
 <div key={post.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black uppercase">{post.category}</span>
 <h3 className="font-bold text-gray-900 text-sm mt-2">{post.title}</h3>
 <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{post.content}</p>
 <p className="text-[11px] text-gray-400 mt-2">
 {new Date(post.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
 {' · '}{post.likes} like{post.likes === 1 ? '' : 's'}
 </p>
 </div>
 <button
 onClick={() => void handleDeletePost(post.id)}
 className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl shrink-0"
 title="Remove update"
 >
 <XCircle size={16} />
 </button>
 </div>
 </div>
 ))}
 </div>
 )}
 </>
 )}
 </div>

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

  {consultationModal && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl max-w-2xl w-full h-[85vh] max-h-[750px] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-base shadow-sm">
              {consultationModal.booking?.client?.name?.charAt(0)?.toUpperCase() ?? 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-base">{consultationModal.booking?.client?.name ?? 'Client Consultation'}</h3>
                {getStatusBadge(consultationModal.status)}
              </div>
              <p className="text-xs text-gray-500">
                {consultationModal.booking?.sessionType} • {consultationModal.booking?.proposedTime} • ₹{consultationModal.booking?.amount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {consultationModal.status === 'scheduled' && (
              <button
                onClick={handleStartSession}
                disabled={isStartingSession}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                data-testid="advisor-ws-start-session-button"
              >
                {isStartingSession ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Start Session
              </button>
            )}
            {consultationModal.status === 'in-progress' && (
              <button
                onClick={handleCompleteSession}
                disabled={isCompletingSession}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                data-testid="advisor-ws-complete-session-button"
              >
                {isCompletingSession ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Complete
              </button>
            )}
            <button
              onClick={() => setConsultationModal(null)}
              className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
              data-testid="advisor-ws-consultation-close-button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {consultationModal.booking?.description && (
          <div className="px-6 py-2.5 bg-indigo-50/60 border-b border-indigo-100/50 flex items-center justify-between text-xs text-indigo-900">
            <span className="font-medium truncate"><strong>Topic:</strong> {consultationModal.booking.description}</span>
          </div>
        )}

        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/30">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin text-indigo-500" />
            </div>
          ) : consultationMessages.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={24} />
              </div>
              <p className="text-gray-700 font-bold text-sm">No messages yet</p>
              <p className="text-gray-400 text-xs mt-1">
                {consultationModal.status === 'scheduled'
                  ? 'Click "Start Session" above to begin consultation with your client.'
                  : 'Type a message below to consult with your client.'}
              </p>
            </div>
          ) : (
            consultationMessages.map((msg: any) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id || `${msg.timestamp}-${msg.message}`} className={cn('flex flex-col', isMe ? 'items-end' : 'items-start')}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-gray-400">
                      {isMe ? 'You (Advisor)' : (msg.sender?.name || 'Client')}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'px-4 py-2.5 rounded-2xl max-w-[80%] text-sm font-medium shadow-xs leading-relaxed',
                      isMe ? 'bg-indigo-600 text-white rounded-tr-xs' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-xs'
                    )}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          {consultationModal.status === 'in-progress' && (
            <div className="mb-2">
              <input
                type="text"
                value={consultationNotes}
                onChange={e => setConsultationNotes(e.target.value)}
                placeholder="Optional advisory notes or summary..."
                className="w-full px-3.5 py-1.5 border border-gray-100 rounded-xl text-xs text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                data-testid="advisor-ws-session-notes-input"
              />
            </div>
          )}
          {consultationModal.status === 'completed' ? (
            <div className="text-center py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100">
              ✓ This consultation session has been successfully completed and recorded.
            </div>
          ) : consultationModal.status === 'scheduled' ? (
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-2xl border border-amber-100">
              <p className="text-xs text-amber-700 font-medium">Session is scheduled. Start the session to begin live messaging.</p>
              <button
                onClick={handleStartSession}
                disabled={isStartingSession}
                className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Play size={12} /> Start
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendConsultationMessage} className="flex gap-2">
              <input
                type="text"
                value={newConsultationMsg}
                onChange={e => setNewConsultationMsg(e.target.value)}
                placeholder="Type your advisory advice or answer..."
                disabled={isSendingConsultationMsg}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                data-testid="advisor-ws-chat-input"
              />
              <button
                type="submit"
                disabled={!newConsultationMsg.trim() || isSendingConsultationMsg}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                data-testid="advisor-ws-send-msg-button"
              >
                {isSendingConsultationMsg ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )}
  </AnimatePresence>
 </div>
 );
};
