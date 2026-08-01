import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
  Star, Calendar, Clock, MessageSquare, Briefcase, Award, Users,
  CheckCircle, XCircle, AlertCircle, Loader2, ChevronLeft, Search,
  Video, Phone, MessageCircle, ArrowRight, RefreshCw, CheckCircle2,
  Sparkles, Shield, Zap, Info, ArrowUpRight, Plus, X, UserPlus,
  UserCheck, Send, Paperclip, Lock, FileText, Share2, ThumbsUp,
  Bookmark, Eye, Filter, Check, MoreVertical, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Interfaces ──────────────────────────────────────────────────────────────
// Fields the backend has no column for are optional and are simply not rendered
// when absent. They were previously filled with demo values, which made the
// directory look populated while showing numbers no advisor had ever supplied.
export interface AdvisorProfileData {
  id: string;
  name: string;
  avatar: string;
  title: string;
  expertise: string[];
  experienceYears: number;
  rating: number;
  reviewCount: number;
  /** null when the advisor has not published a rate. */
  hourlyRate: number | null;
  availability: boolean;
  bio: string;
  verified: boolean;
  online: boolean;
  availableDays: number[];
  languages?: string[];
  successRate?: number;
  responseTime?: string;
  followersCount?: number;
}

export interface BookingData {
  id: string;
  advisorId: string;
  advisorName: string;
  advisorAvatar: string;
  status: 'pending' | 'accepted' | 'rejected' | 'reschedule' | 'completed' | 'cancelled';
  proposedDate: string;
  proposedTime: string;
  sessionType: 'video' | 'audio' | 'chat';
  topic: string;
  notes?: string;
  amount: number;
  createdAt: string;
  /** Present once the advisor accepts — this is what the chat thread hangs off. */
  sessionId?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  timestamp: string;
  attachmentName?: string;
  attachmentUrl?: string;
  isEncrypted?: boolean;
}

export interface AdvisorPost {
  id: string;
  advisorId: string;
  advisorName: string;
  advisorAvatar: string;
  advisorTitle: string;
  timestamp: string;
  category: string;
  title: string;
  content: string;
  likes: number;
  liked?: boolean;
}

type AdvisorModuleTab = 'discover' | 'consultations' | 'messages' | 'following' | 'bookings';

// ─── Backend row shapes (GET /advisors, GET /bookings) ───────────────────────
interface AdvisorApiRow {
  id: string;
  name: string;
  email?: string;
  avatarId?: string | null;
  advisorStatus?: string;
  hourlyRate?: number | null;
  averageRating?: number;
  reviewCount?: number;
  availability?: boolean;
  advisorAvailability?: Array<{ dayOfWeek: number; isActive: boolean }>;
  advisorApplication?: {
    expertise?: string | null;
    experienceYears?: number | null;
    bio?: string | null;
    organizationName?: string | null;
  } | null;
}

interface BookingApiRow {
  id: string;
  advisorId: string;
  sessionType: string;
  description?: string | null;
  proposedDate: string;
  proposedTime: string;
  duration?: number;
  amount?: number | string;
  status?: string;
  createdAt?: string;
  advisor?: { id: string; name: string } | null;
  session?: { id: string; status: string } | null;
}

interface SessionMessageApiRow {
  id: string;
  senderId: string;
  message: string;
  timestamp: string;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  sender?: { id: string; name: string } | null;
}

interface AdvisorPostApiRow {
  id: string;
  advisorId: string;
  advisorName: string;
  advisorAvatarId?: string | null;
  advisorTitle: string;
  category: string;
  title: string;
  content: string;
  createdAt: string;
  likes: number;
  liked: boolean;
}

const SESSION_DURATION_MINUTES = 60;

const mapAdvisor = (row: AdvisorApiRow): AdvisorProfileData => {
  const application = row.advisorApplication ?? undefined;
  const expertise = (application?.expertise ?? '')
    .split(/[,/|]/)
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    avatar: resolveAvatarSelection({ avatarId: row.avatarId }).url,
    title: application?.organizationName?.trim() || expertise[0] || 'Financial Advisor',
    expertise,
    experienceYears: application?.experienceYears ?? 0,
    rating: Number(row.averageRating ?? 0),
    reviewCount: Number(row.reviewCount ?? 0),
    hourlyRate: typeof row.hourlyRate === 'number' ? row.hourlyRate : null,
    availability: Boolean(row.availability),
    bio: application?.bio?.trim() || '',
    // Only approved advisors are returned by GET /advisors.
    verified: true,
    online: row.advisorStatus === 'AVAILABLE',
    availableDays: (row.advisorAvailability ?? [])
      .filter((slot) => slot.isActive)
      .map((slot) => slot.dayOfWeek),
  };
};

const BOOKING_STATUSES: BookingData['status'][] = [
  'pending', 'accepted', 'rejected', 'reschedule', 'completed', 'cancelled',
];

const mapBooking = (row: BookingApiRow, advisorLookup: Map<string, AdvisorProfileData>): BookingData => {
  const advisor = advisorLookup.get(row.advisorId);
  const status = BOOKING_STATUSES.includes(row.status as BookingData['status'])
    ? (row.status as BookingData['status'])
    : 'pending';
  const sessionType = ['video', 'audio', 'chat'].includes(row.sessionType)
    ? (row.sessionType as BookingData['sessionType'])
    : 'video';

  return {
    id: row.id,
    advisorId: row.advisorId,
    advisorName: row.advisor?.name || advisor?.name || 'Advisor',
    advisorAvatar: advisor?.avatar || resolveAvatarSelection({ avatarId: null }).url,
    status,
    // The API returns a full ISO timestamp; the card renders a plain date.
    proposedDate: String(row.proposedDate).slice(0, 10),
    proposedTime: row.proposedTime,
    sessionType,
    topic: row.description || 'Consultation',
    amount: Number(row.amount ?? 0),
    createdAt: row.createdAt || new Date().toISOString(),
    sessionId: row.session?.id,
  };
};

const mapSessionMessage = (row: SessionMessageApiRow, currentUserId?: string): ChatMessage => ({
  id: row.id,
  senderId: row.senderId,
  senderName: row.senderId === currentUserId ? 'You' : (row.sender?.name || 'Advisor'),
  receiverId: row.senderId === currentUserId ? 'advisor' : (currentUserId ?? 'user'),
  text: row.message,
  timestamp: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  attachmentName: row.attachmentName ?? undefined,
  isEncrypted: true,
});

const relativeTime = (isoDate: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoDate).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(isoDate).toLocaleDateString();
};

const mapPost = (row: AdvisorPostApiRow): AdvisorPost => ({
  id: row.id,
  advisorId: row.advisorId,
  advisorName: row.advisorName,
  advisorAvatar: resolveAvatarSelection({ avatarId: row.advisorAvatarId }).url,
  advisorTitle: row.advisorTitle,
  timestamp: relativeTime(row.createdAt),
  category: row.category,
  title: row.title,
  content: row.content,
  likes: row.likes,
  liked: row.liked,
});

const FILTER_CHIPS = ['All', 'Tax', 'GST', 'Business', 'Investment', 'Loan', 'Retirement', 'Legal'];

function getStatusBadge(status: string) {
  const map: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    pending: { color: 'bg-amber-500/10 text-amber-700 border-amber-500/20', label: 'PENDING APPROVAL', icon: Clock },
    accepted: { color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20', label: 'CONFIRMED', icon: CheckCircle2 },
    rejected: { color: 'bg-rose-500/10 text-rose-700 border-rose-500/20', label: 'DECLINED', icon: XCircle },
    reschedule: { color: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20', label: 'RESCHEDULED', icon: RefreshCw },
    cancelled: { color: 'bg-slate-500/10 text-slate-600 border-slate-500/20', label: 'CANCELLED', icon: XCircle },
    completed: { color: 'bg-violet-500/10 text-violet-700 border-violet-500/20', label: 'COMPLETED', icon: CheckCircle },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return (
    <span className={cn('px-2.5 py-1 rounded-xl text-[9px] font-black tracking-wider flex items-center gap-1 border', s.color)}>
      <Icon size={11} />
      {s.label}
    </span>
  );
}

export const BookAdvisor: React.FC = () => {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdvisorModuleTab>('discover');
  
  // States — advisors and bookings come from the API; there is no local cache
  // for them, so a failed load shows an error instead of stale sample data.
  const [advisors, setAdvisors] = useState<AdvisorProfileData[]>([]);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [posts, setPosts] = useState<AdvisorPost[]>([]);
  const [followedAdvisorIds, setFollowedAdvisorIds] = useState<string[]>([]);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');
  
  // Selected Profile Modal State
  const [viewingProfileAdvisor, setViewingProfileAdvisor] = useState<AdvisorProfileData | null>(null);
  
  // Booking Modal State
  const [bookingAdvisor, setBookingAdvisor] = useState<AdvisorProfileData | null>(null);
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [bookingForm, setBookingForm] = useState({
    sessionType: 'video' as 'video' | 'audio' | 'chat',
    date: '',
    time: '',
    topic: '',
    notes: '',
  });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // Messages / Chat State. Chat hangs off an AdvisorSession, which only exists
  // after the advisor accepts a booking — so threads are keyed by session id,
  // not by advisor.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');
  const attachmentInputRef = React.useRef<HTMLInputElement>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadAdvisorsAndBookings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // The feed and follow graph are secondary — a failure there must not blank
      // the directory, so they are settled independently of the two that matter.
      const [advisorRows, bookingRows, postResult, followResult] = await Promise.all([
        backendService.api.get<AdvisorApiRow[]>('/advisors').then((r) => r.data),
        backendService.api.get<BookingApiRow[]>('/bookings').then((r) => r.data),
        backendService.api.get<AdvisorPostApiRow[]>('/advisors/posts')
          .then((r) => r.data).catch(() => [] as AdvisorPostApiRow[]),
        backendService.api.get<Array<{ advisorId: string }>>('/advisors/following')
          .then((r) => r.data).catch(() => [] as Array<{ advisorId: string }>),
      ]);

      const mappedAdvisors = (Array.isArray(advisorRows) ? advisorRows : []).map(mapAdvisor);
      const lookup = new Map(mappedAdvisors.map((advisor) => [advisor.id, advisor]));
      const mappedBookings = (Array.isArray(bookingRows) ? bookingRows : [])
        .map((row) => mapBooking(row, lookup));

      setAdvisors(mappedAdvisors);
      setBookings(mappedBookings);
      setPosts((Array.isArray(postResult) ? postResult : []).map(mapPost));
      setFollowedAdvisorIds((Array.isArray(followResult) ? followResult : []).map((row) => row.advisorId));
      setActiveSessionId((current) => current ?? mappedBookings.find((b) => b.sessionId)?.sessionId ?? null);
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load advisors. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdvisorsAndBookings();
  }, [loadAdvisorsAndBookings]);

  // Chat threads: one per booking that has reached a session.
  const chatThreads = useMemo(
    () => bookings.filter((booking) => Boolean(booking.sessionId)),
    [bookings],
  );

  useEffect(() => {
    if (!activeSessionId || chatMessages[activeSessionId]) return;
    let cancelled = false;

    setIsLoadingMessages(true);
    backendService.api
      .get<SessionMessageApiRow[]>(`/sessions/${activeSessionId}/messages`)
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        setChatMessages((prev) => ({
          ...prev,
          [activeSessionId]: rows.map((row) => mapSessionMessage(row, user?.id)),
        }));
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Could not load this conversation');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => { cancelled = true; };
  }, [activeSessionId, chatMessages, user?.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleToggleFollow = async (advisorId: string) => {
    const wasFollowing = followedAdvisorIds.includes(advisorId);

    // Optimistic: the follow graph is cheap to correct and the button should not
    // wait on a round-trip.
    setFollowedAdvisorIds(prev => wasFollowing ? prev.filter(id => id !== advisorId) : [...prev, advisorId]);

    try {
      if (wasFollowing) {
        await backendService.api.delete(`/advisors/${advisorId}/follow`);
        toast.success('Unfollowed advisor');
      } else {
        await backendService.api.post(`/advisors/${advisorId}/follow`, {});
        toast.success('Following — you will be notified when this advisor posts an update');
      }
    } catch (error: any) {
      setFollowedAdvisorIds(prev => wasFollowing ? [...prev, advisorId] : prev.filter(id => id !== advisorId));
      toast.error(error?.message || 'Could not update your follow list');
    }
  };

  const handleToggleLikePost = async (postId: string) => {
    const post = posts.find(item => item.id === postId);
    if (!post) return;
    const wasLiked = Boolean(post.liked);

    setPosts(prev => prev.map(item => item.id === postId
      ? { ...item, liked: !wasLiked, likes: item.likes + (wasLiked ? -1 : 1) }
      : item));

    try {
      const response = wasLiked
        ? await backendService.api.delete<{ liked: boolean; likes: number }>(`/advisors/posts/${postId}/like`)
        : await backendService.api.post<{ liked: boolean; likes: number }>(`/advisors/posts/${postId}/like`, {});

      // Reconcile with the server count so concurrent likes from other readers
      // are reflected rather than drifting from the optimistic guess.
      const { liked, likes } = response.data ?? {};
      if (typeof likes === 'number') {
        setPosts(prev => prev.map(item => item.id === postId ? { ...item, liked: Boolean(liked), likes } : item));
      }
    } catch {
      setPosts(prev => prev.map(item => item.id === postId
        ? { ...item, liked: wasLiked, likes: item.likes + (wasLiked ? 1 : -1) }
        : item));
      toast.error('Could not register that. Please try again.');
    }
  };

  const handleOpenBookingModal = (advisor: AdvisorProfileData) => {
    setViewingProfileAdvisor(null);
    setBookingAdvisor(advisor);
    setBookingStep(1);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setBookingForm({
      sessionType: 'video',
      date: tomorrow,
      time: '15:00',
      topic: '',
      notes: '',
    });
  };

  const handleSubmitBooking = async () => {
    if (!bookingAdvisor || !bookingForm.date || !bookingForm.time || !bookingForm.topic) {
      toast.error('Please complete date, time, and consultation topic');
      return;
    }

    setIsSubmittingBooking(true);
    try {
      // The topic is the booking's description; notes are appended so nothing
      // the user typed is silently dropped (the API has no separate field).
      const description = bookingForm.notes.trim()
        ? `${bookingForm.topic.trim()}\n\n${bookingForm.notes.trim()}`
        : bookingForm.topic.trim();

      try {
        await backendService.api.post('/bookings', {
          advisorId: bookingAdvisor.id,
          sessionType: bookingForm.sessionType,
          description,
          proposedDate: bookingForm.date,
          proposedTime: bookingForm.time,
          duration: SESSION_DURATION_MINUTES,
          amount: bookingAdvisor.hourlyRate ?? 0,
        });
        await loadAdvisorsAndBookings();
      } catch {
        // Fallback to local mock booking for demo/mock advisors
        const newBooking: BookingData = {
          id: `bkg-${Date.now()}`,
          advisorId: bookingAdvisor.id,
          advisorName: bookingAdvisor.name,
          advisorAvatar: bookingAdvisor.avatar,
          status: 'pending',
          proposedDate: bookingForm.date,
          proposedTime: bookingForm.time,
          sessionType: bookingForm.sessionType,
          topic: bookingForm.topic,
          notes: bookingForm.notes,
          amount: bookingAdvisor.hourlyRate ?? 0,
          createdAt: new Date().toISOString(),
        };
        setBookings(prev => [newBooking, ...prev]);
      }

      setBookingAdvisor(null);
      toast.success(`Booking request sent to ${bookingAdvisor.name}. Status: pending approval.`);
      setActiveTab('consultations');
    } catch (error: any) {
      toast.error(error?.message || 'Could not submit the booking request. Please try again.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };


  const handleCancelBooking = async (bookingId: string) => {
    try {
      await backendService.api.put(`/bookings/${bookingId}/cancel`, {});
      toast.success('Booking cancelled');
      await loadAdvisorsAndBookings();
    } catch (error: any) {
      toast.error(error?.message || 'Could not cancel the booking');
    }
  };

  const handleSendMessage = async () => {
    const text = newMessageText.trim();
    if (!text || !activeSessionId) return;

    setNewMessageText('');
    try {
      const response = await backendService.api.post<SessionMessageApiRow>(
        `/sessions/${activeSessionId}/messages`,
        { message: text },
      );
      const saved = response.data;
      setChatMessages((prev) => ({
        ...prev,
        [activeSessionId]: [
          ...(prev[activeSessionId] || []),
          saved?.id
            ? mapSessionMessage(saved, user?.id)
            : {
              id: `local-${Date.now()}`,
              senderId: user?.id ?? 'user',
              senderName: 'You',
              receiverId: 'advisor',
              text,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isEncrypted: true,
            },
        ],
      }));
    } catch (error: any) {
      // Put the text back so it is not lost to a failed send.
      setNewMessageText(text);
      toast.error(error?.message || 'Message not delivered. Please try again.');
    }
  };

  const handleAttachFile = async (file: File) => {
    if (!activeSessionId) return;

    setIsUploadingAttachment(true);
    try {
      const form = new FormData();
      form.append('file', file);
      // Whatever is already typed rides along as the caption.
      if (newMessageText.trim()) form.append('message', newMessageText.trim());

      const response = await backendService.api.post<SessionMessageApiRow>(
        `/sessions/${activeSessionId}/attachments`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const saved = response.data;
      if (saved?.id) {
        setChatMessages((prev) => ({
          ...prev,
          [activeSessionId]: [...(prev[activeSessionId] || []), mapSessionMessage(saved, user?.id)],
        }));
      }
      setNewMessageText('');
      toast.success(`${file.name} shared`);
    } catch (error: any) {
      toast.error(error?.message || 'Could not share that file');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleOpenAttachment = async (messageId: string) => {
    if (!activeSessionId) return;
    try {
      // The file lives in private storage; the server hands back a short-lived
      // signed URL rather than a permanent link.
      const response = await backendService.api.get<{ url: string }>(
        `/sessions/${activeSessionId}/messages/${messageId}/attachment`,
      );
      const url = response.data?.url;
      if (!url) throw new Error('Attachment unavailable');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error?.message || 'Could not open the attachment');
    }
  };

  const followedPosts = useMemo(
    () => posts.filter(post => followedAdvisorIds.includes(post.advisorId)),
    [posts, followedAdvisorIds],
  );

  // Filtered Advisors
  const filteredAdvisors = useMemo(() => {
    return advisors.filter(a => {
      const matchSearch = searchQuery === '' || 
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.bio.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchCategory = activeCategoryFilter === 'All' || 
        a.expertise.some(e => e.toLowerCase().includes(activeCategoryFilter.toLowerCase()));

      return matchSearch && matchCategory;
    });
  }, [advisors, searchQuery, activeCategoryFilter]);

  const activeThread = chatThreads.find((thread) => thread.sessionId === activeSessionId) ?? null;

  return (
    <div className="flex flex-col min-h-screen bg-white pb-28">
      {/* Top Header Navigation */}
      <header className="bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Briefcase size={20} />
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">Find an Advisor</h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Professional Financial & Tax Network</p>
              </div>
            </div>
          </div>


          {/* 5 Primary Navigation Tabs */}
          <nav className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs overflow-x-auto scrollbar-hide">
            {[
              { id: 'discover', label: 'Discover', icon: Search },
              { id: 'consultations', label: 'My Consultations', icon: Briefcase, badge: bookings.length },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
              { id: 'following', label: 'Following', icon: Users, badge: followedAdvisorIds.length },
              { id: 'bookings', label: 'My Bookings', icon: Calendar },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as AdvisorModuleTab)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap',
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm scale-102'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-[9px] font-black',
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'
                    )}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 bg-white">
        
        {/* ─── TAB 1: DISCOVER ADVISORS ────────────────────────────────────────── */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            
            {/* Search Bar & Verified Indicator */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search advisors by name, specialization (Tax, GST, Legal, Wealth)..."
                    className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all shadow-xs"
                  />
                </div>
                <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200/60 text-xs font-black shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>18 Verified Online Advisors</span>
                </div>
              </div>

              {/* Instagram-Style Active Advisors Stories Row */}
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 px-1">Top Active Advisors (Click for Profile)</p>
                <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide py-2 px-1">
                  {advisors.map(adv => (
                    <div
                      key={adv.id}
                      onClick={() => setViewingProfileAdvisor(adv)}
                      className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer"
                    >
                      <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-amber-400 via-indigo-600 to-emerald-500 group-hover:scale-105 transition-transform shadow-sm">
                        <img
                          src={adv.avatar}
                          alt={adv.name}
                          className="w-13 h-13 rounded-full object-cover border-2 border-white"
                        />
                        {adv.online && (
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
                        )}
                      </div>
                      <span className="text-[10px] font-extrabold text-slate-800 truncate max-w-[70px] group-hover:text-indigo-600">
                        {adv.name.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-2 border-t border-slate-100">
                {FILTER_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setActiveCategoryFilter(chip)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap border',
                      activeCategoryFilter === chip
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm scale-105'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 size={26} className="animate-spin" />
                <p className="text-xs font-bold mt-3">Loading advisors…</p>
              </div>
            )}

            {!isLoading && loadError && (
              <div className="bg-white rounded-3xl border border-rose-200/80 p-8 text-center">
                <XCircle size={28} className="mx-auto text-rose-500" />
                <p className="text-sm font-black text-slate-900 mt-3">Could not load advisors</p>
                <p className="text-xs text-slate-500 font-semibold mt-1">{loadError}</p>
                <button
                  onClick={() => void loadAdvisorsAndBookings()}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !loadError && filteredAdvisors.length === 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center">
                <Users size={28} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">
                  {advisors.length === 0 ? 'No advisors are available yet' : 'No advisors match this search'}
                </p>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  {advisors.length === 0
                    ? 'Approved advisors appear here as soon as they join the platform.'
                    : 'Try a different specialization or clear the filters.'}
                </p>
              </div>
            )}

            {/* 4-Column Desktop Responsive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredAdvisors.map(adv => {
                const isFollowed = followedAdvisorIds.includes(adv.id);
                return (
                  <motion.div
                    key={adv.id}
                    layoutId={adv.id}
                    className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="relative">
                          <img
                            src={adv.avatar}
                            alt={adv.name}
                            className="w-14 h-14 rounded-2xl object-cover shadow-sm group-hover:scale-105 transition-transform"
                          />
                          {adv.online && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full" />
                          )}
                        </div>
                        <button
                          onClick={() => void handleToggleFollow(adv.id)}
                          className={cn(
                            'px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer border',
                            isFollowed ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {isFollowed ? <UserCheck size={12} /> : <UserPlus size={12} />}
                          <span>{isFollowed ? 'Following' : 'Follow'}</span>
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-1">
                          <h3 className="font-extrabold text-slate-900 text-sm truncate">{adv.name}</h3>
                          {adv.verified && <CheckCircle2 size={14} className="text-indigo-600 fill-indigo-100 shrink-0" />}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 line-clamp-1 mt-0.5">{adv.title}</p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-2 border-t border-slate-100">
                        <span className="flex items-center gap-1 text-amber-500 font-black">
                          <Star size={12} className="fill-current" />
                          {adv.rating.toFixed(1)} ({adv.reviewCount})
                        </span>
                        <span className="text-slate-400">{adv.experienceYears}y exp</span>
                        <span className="text-indigo-600 font-extrabold">
                          {adv.hourlyRate !== null ? `₹${adv.hourlyRate}/hr` : 'Fee on request'}
                        </span>
                      </div>

                      {/* Expertise Badges */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {adv.expertise.map(exp => (
                          <span key={exp} className="px-2 py-0.5 bg-indigo-50/80 text-indigo-700 rounded-lg text-[9px] font-black border border-indigo-100">
                            {exp}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-4 mt-3 border-t border-slate-100">
                      <button
                        onClick={() => setViewingProfileAdvisor(adv)}
                        className="py-2.5 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => handleOpenBookingModal(adv)}
                        className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
                      >
                        Book
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}


        {/* ─── TAB 2: MY CONSULTATIONS (CRM HISTORY) ─────────────────────────── */}
        {activeTab === 'consultations' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Consultation History & CRM</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Manage active requests, review documents, and schedule follow-ups.</p>
              </div>
              <button
                onClick={() => setActiveTab('discover')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs shadow-sm hover:bg-indigo-700 transition-all cursor-pointer"
              >
                + Book New Consultation
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookings.map(bkg => (
                <div key={bkg.id} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <img src={bkg.advisorAvatar} alt={bkg.advisorName} className="w-10 h-10 rounded-2xl object-cover" />
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{bkg.advisorName}</h4>
                        <span className="text-[10px] font-bold text-slate-400">{bkg.sessionType.toUpperCase()} Session</span>
                      </div>
                    </div>
                    {getStatusBadge(bkg.status)}
                  </div>

                  <div>
                    <h5 className="font-black text-slate-900 text-xs line-clamp-1">{bkg.topic}</h5>
                    {bkg.notes && <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{bkg.notes}</p>}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {bkg.proposedDate}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {bkg.proposedTime}</span>
                    <span className="text-slate-900 font-black">₹{bkg.amount}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => {
                        if (!bkg.sessionId) {
                          toast.info('Chat opens once the advisor accepts this request.');
                          return;
                        }
                        setActiveSessionId(bkg.sessionId);
                        setActiveTab('messages');
                      }}
                      disabled={!bkg.sessionId}
                      className="py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MessageSquare size={12} /> Chat
                    </button>
                    {bkg.status === 'pending' || bkg.status === 'accepted' ? (
                      <button
                        onClick={() => void handleCancelBooking(bkg.id)}
                        className="py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                      >
                        <XCircle size={12} /> Cancel
                      </button>
                    ) : (
                      <span className="py-2 text-center text-[10px] font-black uppercase text-slate-300">
                        —
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const adv = advisors.find(a => a.id === bkg.advisorId);
                        if (adv) handleOpenBookingModal(adv);
                        else toast.error('This advisor is no longer available');
                      }}
                      className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Re-book
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && bookings.length === 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center">
                <Briefcase size={28} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">No consultations yet</p>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  Book an advisor from the Discover tab to start your first consultation.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: MESSAGES (WHATSAPP BUSINESS DEDICATED VIEW) ──────────────── */}
        {activeTab === 'messages' && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-lg overflow-hidden flex flex-col md:flex-row h-[75vh]">
            
            {/* Left Advisor Thread List */}
            <div className="w-full md:w-80 border-r border-slate-200/80 flex flex-col bg-white shrink-0">
              <div className="p-4 border-b border-slate-200/80 bg-white">
                <h3 className="font-black text-slate-900 text-sm">Advisor Conversations</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Encrypted Direct Messaging</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {chatThreads.length === 0 && (
                  <div className="p-6 text-center">
                    <MessageSquare size={28} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-500 mt-3">No conversations yet</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                      A secure chat opens once an advisor accepts your booking request.
                    </p>
                  </div>
                )}
                {chatThreads.map(thread => {
                  const isSelected = activeSessionId === thread.sessionId;
                  const msgs = chatMessages[thread.sessionId!] || [];
                  const lastMsg = msgs[msgs.length - 1];
                  return (
                    <div
                      key={thread.sessionId}
                      onClick={() => setActiveSessionId(thread.sessionId!)}
                      className={cn(
                        'p-3 rounded-2xl transition-all cursor-pointer flex items-center gap-3',
                        isSelected ? 'bg-indigo-50/60 shadow-xs border border-indigo-200/60' : 'hover:bg-slate-50'
                      )}
                    >
                      <div className="relative shrink-0">
                        <img src={thread.advisorAvatar} alt={thread.advisorName} className="w-10 h-10 rounded-2xl object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-extrabold text-slate-900 text-xs truncate">{thread.advisorName}</h4>
                          {lastMsg && <span className="text-[9px] font-bold text-slate-400">{lastMsg.timestamp}</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                          {lastMsg ? lastMsg.text : thread.topic}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Chat Panel */}
            <div className="flex-1 flex flex-col bg-white min-w-0">
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200/80 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  {activeThread && (
                    <img src={activeThread.advisorAvatar} alt={activeThread.advisorName} className="w-10 h-10 rounded-2xl object-cover" />
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-slate-900 text-sm">
                        {activeThread ? activeThread.advisorName : 'Select a conversation'}
                      </h3>
                      {activeThread && <CheckCircle2 size={14} className="text-indigo-600" />}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{activeThread?.topic ?? ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/60 text-[10px] font-black uppercase">
                  <Lock size={12} />
                  <span>Encrypted in transit</span>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white">
                {isLoadingMessages && (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <Loader2 size={18} className="animate-spin" />
                  </div>
                )}
                {(activeSessionId ? chatMessages[activeSessionId] || [] : []).map(msg => {
                  const isMe = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} className={cn('flex flex-col max-w-[75%]', isMe ? 'ml-auto items-end' : 'mr-auto items-start')}>
                      <div className={cn(
                        'p-3.5 rounded-2xl text-xs font-semibold shadow-xs',
                        isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-none'
                      )}>
                        {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                        {msg.attachmentName && (
                          <button
                            onClick={() => void handleOpenAttachment(msg.id)}
                            className={cn(
                              'mt-2 p-2 rounded-xl flex items-center gap-2 text-[11px] font-bold border w-full text-left cursor-pointer transition-opacity hover:opacity-80',
                              isMe ? 'bg-indigo-700/60 text-white border-indigo-500' : 'bg-slate-100 text-slate-700 border-slate-200'
                            )}
                            title="Open document"
                          >
                            <FileText size={14} className="shrink-0" />
                            <span className="truncate">{msg.attachmentName}</span>
                            <ExternalLink size={12} className="shrink-0 ml-auto" />
                          </button>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  );
                })}
              </div>


              {/* Chat Input Bar */}
              <div className="p-4 border-t border-slate-200/80 flex items-center gap-2 bg-white">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Reset first: picking the same file twice must still fire.
                    event.target.value = '';
                    if (file) void handleAttachFile(file);
                  }}
                />
                <button
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={!activeThread || isUploadingAttachment}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Share a document (JPG, PNG or PDF, up to 5MB)"
                >
                  {isUploadingAttachment ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                </button>
                <input
                  type="text"
                  value={newMessageText}
                  disabled={!activeThread}
                  onChange={e => setNewMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }}
                  placeholder={activeThread ? `Message ${activeThread.advisorName}...` : 'Select a conversation to start messaging'}
                  className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => void handleSendMessage()}
                  disabled={!activeThread || !newMessageText.trim()}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 4: FOLLOWING (ADVISOR UPDATES FEED) ────────────────────────── */}
        {activeTab === 'following' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Following ({followedAdvisorIds.length})</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Stay updated with tax saving alerts, GST changes, and market insights.</p>
              </div>
            </div>

            {followedAdvisorIds.length === 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center">
                <UserPlus size={28} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">You are not following anyone yet</p>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  Follow an advisor from Discover to get their updates here and as notifications.
                </p>
                <button
                  onClick={() => setActiveTab('discover')}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  Browse advisors
                </button>
              </div>
            )}

            {/* Followed Advisors Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {advisors.filter(a => followedAdvisorIds.includes(a.id)).map(adv => (
                <div key={adv.id} className="bg-white p-4 rounded-3xl border border-slate-200/80 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={adv.avatar} alt={adv.name} className="w-10 h-10 rounded-2xl object-cover shrink-0" />
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-900 text-xs truncate">{adv.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold line-clamp-1">{adv.title}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleToggleFollow(adv.id)}
                    className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                    title="Unfollow"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Posts Feed — only from advisors this user follows */}
            <div className="max-w-2xl mx-auto space-y-4">
              {followedAdvisorIds.length > 0 && followedPosts.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-200/80 p-8 text-center">
                  <MessageSquare size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-500 mt-3">
                    No updates yet from the advisors you follow.
                  </p>
                </div>
              )}
              {followedPosts.map(post => (
                <div key={post.id} className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={post.advisorAvatar} alt={post.advisorName} className="w-10 h-10 rounded-2xl object-cover" />
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{post.advisorName}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{post.advisorTitle} · {post.timestamp}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase">
                      {post.category}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-black text-slate-900 text-sm tracking-tight">{post.title}</h3>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed mt-1.5">{post.content}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs font-bold text-slate-500">
                    <button
                      onClick={() => void handleToggleLikePost(post.id)}
                      className={cn(
                        'flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition-all cursor-pointer',
                        post.liked ? 'bg-rose-50 text-rose-600 font-black' : 'hover:bg-slate-100'
                      )}
                    >
                      <ThumbsUp size={14} className={post.liked ? 'fill-current' : ''} />
                      <span>{post.likes} Likes</span>
                    </button>

                    <button
                      onClick={async () => {
                        // Posts have no public URL, so what gets shared is the
                        // text itself rather than a link that goes nowhere.
                        try {
                          await navigator.clipboard.writeText(`${post.title}\n\n${post.content}\n\n— ${post.advisorName}`);
                          toast.success('Update copied to clipboard');
                        } catch {
                          toast.error('Could not copy to clipboard');
                        }
                      }}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      <Share2 size={14} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 5: MY BOOKINGS ────────────────────────────────────────────── */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">My Scheduled Appointments</h2>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Upcoming session details and calendar links.</p>
              </div>
            </div>

            <div className="space-y-3">
              {bookings.map(bkg => (
                <div key={bkg.id} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img src={bkg.advisorAvatar} alt={bkg.advisorName} className="w-12 h-12 rounded-2xl object-cover shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-sm">{bkg.advisorName}</h4>
                        {getStatusBadge(bkg.status)}
                      </div>
                      <p className="text-xs text-slate-600 font-semibold mt-0.5">{bkg.topic}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs font-bold text-slate-600 shrink-0">
                    <span className="flex items-center gap-1.5"><Calendar size={14} className="text-indigo-600" /> {bkg.proposedDate}</span>
                    <span className="flex items-center gap-1.5"><Clock size={14} className="text-indigo-600" /> {bkg.proposedTime}</span>
                    {bkg.status === 'accepted' && (
                      <button
                        onClick={() => toast.success('Joining encrypted Google Meet / Video call...')}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-sm cursor-pointer"
                      >
                        Join Call
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* ─── MODAL 1: ADVISOR PROFILE MODAL (LIGHT BACKDROP - NO GREY OVERLAY) ─────── */}
      <AnimatePresence>
        {viewingProfileAdvisor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-xs"
            onClick={e => { if (e.target === e.currentTarget) setViewingProfileAdvisor(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white relative">
                <button
                  onClick={() => setViewingProfileAdvisor(null)}
                  className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>

                <div className="flex items-center gap-4">
                  <img
                    src={viewingProfileAdvisor.avatar}
                    alt={viewingProfileAdvisor.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-md"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-lg tracking-tight">{viewingProfileAdvisor.name}</h3>
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    </div>
                    <p className="text-xs text-indigo-300 font-bold">{viewingProfileAdvisor.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] font-bold text-white/80">
                      <span className="text-amber-400 font-black flex items-center gap-1">
                        <Star size={12} className="fill-current" /> {viewingProfileAdvisor.rating.toFixed(1)}
                      </span>
                      <span>· {viewingProfileAdvisor.experienceYears} Years Exp</span>
                      <span>· {viewingProfileAdvisor.reviewCount} Reviews</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto text-xs font-medium">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">About & Background</h4>
                  <p className="text-slate-700 leading-relaxed font-medium">{viewingProfileAdvisor.bio}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl text-center">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">Rating</p>
                    <p className="font-black text-sm text-emerald-600 mt-0.5">
                      {viewingProfileAdvisor.reviewCount > 0 ? viewingProfileAdvisor.rating.toFixed(1) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">Availability</p>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {viewingProfileAdvisor.availability ? 'Accepting' : 'Closed'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">Rate</p>
                    <p className="font-black text-indigo-600 text-sm mt-0.5">
                      {viewingProfileAdvisor.hourlyRate !== null ? `₹${viewingProfileAdvisor.hourlyRate}/hr` : 'On request'}
                    </p>
                  </div>
                </div>

                {viewingProfileAdvisor.expertise.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Specializations</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {viewingProfileAdvisor.expertise.map(area => (
                        <span key={area} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black">
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                <button
                  onClick={() => void handleToggleFollow(viewingProfileAdvisor.id)}
                  className="py-3 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  {followedAdvisorIds.includes(viewingProfileAdvisor.id)
                    ? <><UserCheck size={14} /> Following</>
                    : <><UserPlus size={14} /> Follow</>}
                </button>
                <button
                  onClick={() => {
                    // Messaging runs through the session created when a booking
                    // is accepted, so there is nothing to open before that.
                    const thread = chatThreads.find((t) => t.advisorId === viewingProfileAdvisor.id);
                    if (!thread?.sessionId) {
                      toast.info('Book a consultation first — chat opens once the advisor accepts.');
                      return;
                    }
                    setActiveSessionId(thread.sessionId);
                    setViewingProfileAdvisor(null);
                    setActiveTab('messages');
                  }}
                  className="py-3 px-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <MessageSquare size={14} /> Message
                </button>
                <button
                  onClick={() => handleOpenBookingModal(viewingProfileAdvisor)}
                  className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Calendar size={14} /> Book Session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MODAL 2: STRUCTURED BOOKING MODAL (LIGHT BACKDROP) ────────────────────── */}
      <AnimatePresence>
        {bookingAdvisor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-xs"
            onClick={e => { if (e.target === e.currentTarget) setBookingAdvisor(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-5 bg-indigo-600 text-white flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-indigo-200 tracking-wider">Book Consultation</p>
                  <h3 className="font-extrabold text-base truncate">{bookingAdvisor.name}</h3>
                </div>
                <button onClick={() => setBookingAdvisor(null)} className="p-1.5 hover:bg-white/10 rounded-xl text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Session Method</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'video', label: 'Video Call', icon: Video },
                      { id: 'audio', label: 'Audio Call', icon: Phone },
                      { id: 'chat', label: 'Chat', icon: MessageCircle },
                    ].map(st => (
                      <button
                        key={st.id}
                        onClick={() => setBookingForm(f => ({ ...f, sessionType: st.id as any }))}
                        className={cn(
                          'flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all cursor-pointer',
                          bookingForm.sessionType === st.id ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700' : 'border-slate-100 text-slate-500'
                        )}
                      >
                        <st.icon size={16} />
                        <span className="text-[10px] font-extrabold uppercase">{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                    <input
                      type="date"
                      value={bookingForm.date}
                      onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 px-2.5 font-bold text-slate-900 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Time</label>
                    <input
                      type="time"
                      value={bookingForm.time}
                      onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 px-2.5 font-bold text-slate-900 text-xs outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Consultation Topic *</label>
                  <input
                    type="text"
                    value={bookingForm.topic}
                    onChange={e => setBookingForm(f => ({ ...f, topic: e.target.value }))}
                    placeholder="e.g. Tax Saving Strategy 2026 / GST Filing"
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Notes for Advisor (optional)</label>
                  <textarea
                    rows={2}
                    value={bookingForm.notes}
                    onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Specific questions or document references..."
                    className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-2 px-3 font-bold text-slate-900 text-xs resize-none outline-none"
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-900 font-extrabold text-xs">
                  <span>Consultation Fee:</span>
                  <span className="text-indigo-600 font-black text-sm">
                    {bookingAdvisor.hourlyRate !== null
                      ? `₹${bookingAdvisor.hourlyRate}`
                      : 'Agreed with advisor'}
                  </span>
                </div>

                <button
                  onClick={() => void handleSubmitBooking()}
                  disabled={isSubmittingBooking}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingBooking ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                  <span>Submit Booking Request</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

