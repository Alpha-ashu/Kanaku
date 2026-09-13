import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { backendService } from '@/lib/backend-api';
import {
  Star, Calendar, Clock, MessageSquare, Briefcase, Users,
  CheckCircle, XCircle, Loader2, ChevronLeft, Search,
  Video, Phone, MessageCircle, ArrowRight, RefreshCw, CheckCircle2,
  Sparkles, Shield, Info, Plus, X, UserPlus,
  UserCheck, Send, Paperclip, Lock, FileText, Share2, ThumbsUp,
  CreditCard, Wallet, Banknote, QrCode, ShieldCheck, Download,
  ChevronRight, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/database';
import { applyTransactionAccountImpact } from '@/lib/transactionAggregation';
import { queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { FinancialAmount } from '@/app/components/ui/FinancialAmount';

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface AdvisorProfileData {
  id: string;
  name: string;
  avatar: string;
  title: string;
  expertise: string[];
  experienceYears: number;
  rating: number;
  reviewCount: number;
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
  sessionId?: string;
  payment?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    paymentMethod?: string;
  } | null;
  sessionStatus?: string;
  unsent?: boolean;
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

// ─── Backend row shapes ───────────────────────────────────────────────────────
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
  session?: {
    id: string;
    status: string;
    payment?: {
      id: string;
      status: string;
      amount: number | string;
      currency: string;
      paymentMethod?: string | null;
    } | null;
  } | null;
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
  const payment = row.session?.payment ? {
    id: row.session.payment.id,
    status: row.session.payment.status,
    amount: Number(row.session.payment.amount || row.amount || 0),
    currency: row.session.payment.currency || 'INR',
    paymentMethod: row.session.payment.paymentMethod || undefined,
  } : null;

  return {
    id: row.id,
    advisorId: row.advisorId,
    advisorName: row.advisor?.name || advisor?.name || 'Advisor',
    advisorAvatar: advisor?.avatar || resolveAvatarSelection({ avatarId: null }).url,
    status,
    proposedDate: String(row.proposedDate).slice(0, 10),
    proposedTime: row.proposedTime,
    sessionType,
    topic: row.description || 'Consultation',
    amount: Number(row.amount ?? 0),
    createdAt: row.createdAt || new Date().toISOString(),
    sessionId: row.session?.id,
    payment,
    sessionStatus: row.session?.status,
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
  
  // Booking Modal State (3-step wizard)
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

  // Messages / Chat State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');
  const attachmentInputRef = React.useRef<HTMLInputElement>(null);

  // Payment Settlement State
  const [payingBooking, setPayingBooking] = useState<BookingData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'cash'>('upi');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [userAccounts, setUserAccounts] = useState<Array<{ id: number; name: string; balance: number; currency: string }>>([]);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const openPaymentModal = async (bkg: BookingData) => {
    setPayingBooking(bkg);
    setPaymentMethod('upi');
    try {
      const accs = await db.accounts.filter(a => Boolean(a.isActive) && !a.deletedAt).toArray();
      const validAccs = accs
        .filter((a): a is typeof a & { id: number } => typeof a.id === 'number')
        .map(a => ({
          id: a.id,
          name: a.name,
          balance: Number(a.balance || 0),
          currency: a.currency || 'INR',
        }));
      setUserAccounts(validAccs);
      if (validAccs.length > 0) {
        setSelectedAccountId(validAccs[0].id);
      } else {
        setSelectedAccountId(null);
      }
    } catch {
      setUserAccounts([]);
      setSelectedAccountId(null);
    }
  };

  const handleConfirmPayment = async () => {
    if (!payingBooking) return;
    setIsProcessingPayment(true);
    const amountToPay = Number(payingBooking.payment?.amount || payingBooking.amount || 0);

    try {
      let paymentId = payingBooking.payment?.id;

      if (!paymentId && payingBooking.sessionId) {
        try {
          const initRes = await backendService.api.post('/payments/initiate', {
            sessionId: payingBooking.sessionId,
            paymentMethod,
            description: `Payment for ${payingBooking.topic || 'Consultation'}`,
          });
          paymentId = initRes.data?.payment?.id;
        } catch {
          // If already initiated, proceed
        }
      }

      if (paymentId) {
        await backendService.api.post('/payments/complete', {
          paymentId,
          paymentMethod,
          transactionId: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        });
      }

      if (selectedAccountId !== null && amountToPay > 0) {
        try {
          const newTx = {
            accountId: selectedAccountId,
            type: 'expense' as const,
            amount: amountToPay,
            category: 'Consultation',
            subcategory: 'Financial Advisory',
            description: `Consultation fee for ${payingBooking.advisorName} (${payingBooking.sessionType} session)`,
            date: new Date(),
            tags: ['advisory', 'consultation'],
            expenseMode: 'individual' as const,
            syncStatus: 'pending' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          const txLocalId = await db.transactions.add(newTx);
          await applyTransactionAccountImpact(newTx);
          if (typeof txLocalId === 'number') {
            queueRecordUpsertSync('transactions', txLocalId);
          }
          queueRecordUpsertSync('accounts', selectedAccountId);
        } catch (localErr) {
          console.warn('[BookAdvisor] Local transaction recording warning:', localErr);
        }
      }

      setBookings(prev => prev.map(b => {
        if (b.id === payingBooking.id) {
          return {
            ...b,
            payment: {
              id: paymentId || b.payment?.id || 'completed',
              status: 'completed',
              amount: amountToPay,
              currency: b.payment?.currency || 'INR',
              paymentMethod,
            },
          };
        }
        return b;
      }));

      toast.success(`Payment of ₹${amountToPay.toLocaleString('en-IN')} settled successfully!`);
      setPayingBooking(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to complete payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleJoinCall = (bkg: BookingData) => {
    const sessionId = bkg.sessionId || bkg.id;
    const roomName = `Kanaku-Consultation-${sessionId.slice(0, 12)}`;
    const meetUrl = `https://meet.jit.si/${encodeURIComponent(roomName)}`;
    toast.success('Connecting to encrypted video consultation room...');
    window.open(meetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadIcs = (bkg: BookingData) => {
    try {
      const [year, month, day] = bkg.proposedDate.split('-').map(Number);
      const [hours, minutes] = (bkg.proposedTime || '10:00').split(':').map(Number);
      const startDate = new Date(year || 2026, (month || 1) - 1, day || 1, hours || 10, minutes || 0);
      const endDate = new Date(startDate.getTime() + 45 * 60000);

      const pad = (n: number) => String(n).padStart(2, '0');
      const formatIcsDate = (d: Date) =>
        `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Kanaku//Consultation Appointment//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:kanaku-booking-${bkg.id}@kanaku.app`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(startDate)}`,
        `DTEND:${formatIcsDate(endDate)}`,
        `SUMMARY:Advisor Consultation with ${bkg.advisorName}`,
        `DESCRIPTION:Kanaku Consultation Session\\nAdvisor: ${bkg.advisorName}\\nTopic: ${bkg.topic}\\nFormat: ${bkg.sessionType}`,
        'LOCATION:Kanaku Encrypted Video Meeting',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consultation-${bkg.advisorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Calendar invitation (.ics) downloaded');
    } catch {
      toast.error('Could not download calendar file');
    }
  };

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadAdvisorsAndBookings = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
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

  // Chat threads: one per booking that has reached a session
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

    setFollowedAdvisorIds(prev => wasFollowing ? prev.filter(id => id !== advisorId) : [...prev, advisorId]);

    try {
      if (wasFollowing) {
        await backendService.api.delete(`/advisors/${advisorId}/follow`);
        toast.success('Unfollowed advisor');
      } else {
        await backendService.api.post(`/advisors/${advisorId}/follow`, {});
        toast.success('Following — you will receive real-time updates');
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

      const { liked, likes } = response.data ?? {};
      if (typeof likes === 'number') {
        setPosts(prev => prev.map(item => item.id === postId ? { ...item, liked: Boolean(liked), likes } : item));
      }
    } catch {
      setPosts(prev => prev.map(item => item.id === postId
        ? { ...item, liked: wasLiked, likes: item.likes + (wasLiked ? 1 : -1) }
        : item));
      toast.error('Could not register like. Please try again.');
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
      const description = bookingForm.notes.trim()
        ? `${bookingForm.topic.trim()}\n\n${bookingForm.notes.trim()}`
        : bookingForm.topic.trim();

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
      setBookingAdvisor(null);
      toast.success(`Booking request sent to ${bookingAdvisor.name}. Status: pending approval.`);
      setActiveTab('consultations');
    } catch (error: any) {
      const errMsg =
        error?.response?.data?.error ||
        error?.message ||
        'Could not submit the booking request. Please try again.';
      toast.error(errMsg);
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking request?')) return;
    try {
      await backendService.api.put(`/bookings/${bookingId}/cancel`, {});
      toast.success('Booking cancelled');
      await loadAdvisorsAndBookings();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Could not cancel the booking');
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

  // Metric strip calculations
  const stats = useMemo(() => {
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'accepted' || b.status === 'completed').length;
    const pending = bookings.filter(b => b.status === 'pending').length;
    const totalFees = bookings.reduce((sum, b) => sum + (Number(b.payment?.amount || b.amount) || 0), 0);
    return { total, confirmed, pending, totalFees };
  }, [bookings]);

  return (
    <CenteredLayout className="pb-32">
      <div className="space-y-6 w-full">
        {/* ── Header Navigation ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go to dashboard"
              title="Go to dashboard"
              data-testid="book-advisor-go-back-button"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div>
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">Book Advisor</h1>
              <p className="text-xs text-slate-500 font-medium mt-1">Verified financial planners, chartered accountants & tax advisors</p>
            </div>
          </div>

          {/* 5 Primary Navigation Tabs */}
          <nav className="flex items-center justify-start sm:justify-center gap-1 bg-slate-100/90 backdrop-blur-xl p-1.5 rounded-full border border-slate-200/70 max-w-full overflow-x-auto scrollbar-hide shrink-0 shadow-2xs">
            {[
              { id: 'discover', label: 'Discover', icon: Search },
              { id: 'consultations', label: 'Consultations', icon: Briefcase, badge: bookings.length },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
              { id: 'following', label: 'Following', icon: Users, badge: followedAdvisorIds.length },
              { id: 'bookings', label: 'Bookings', icon: Calendar },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as AdvisorModuleTab)}
                  title={tab.label}
                  aria-label={tab.label}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap px-3.5 sm:px-4 py-2 cursor-pointer',
                    isActive
                      ? 'bg-[#18181B] text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
                  )}
                >
                  <Icon size={14} className="shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={cn(
                        'px-1.5 py-0.2 rounded-full text-[9px] font-black shrink-0',
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200/80 text-slate-700'
                      )}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── TAB 1: DISCOVER ADVISORS ── */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            {/* Search & Hero Toolbar */}
            <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by advisor name, specialization (Tax, GST, Wealth, Legal)..."
                    className="w-full bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/80 rounded-2xl py-3 pl-10 pr-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-slate-900/10 outline-none transition-all shadow-2xs"
                  />
                </div>
                <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200/60 text-xs font-black shrink-0 shadow-2xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{advisors.length} Verified {advisors.length === 1 ? 'Expert' : 'Experts'} Available</span>
                </div>
              </div>

              {/* Top Active Advisors Avatar Carousel */}
              {advisors.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2.5 px-1">
                    Featured & Available Advisors
                  </p>
                  <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide py-1 px-1">
                    {advisors.map(adv => (
                      <div
                        key={adv.id}
                        onClick={() => setViewingProfileAdvisor(adv)}
                        className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer transition-transform active:scale-95"
                      >
                        <div className="relative p-0.5 rounded-full bg-gradient-to-tr from-amber-400 via-indigo-600 to-emerald-500 group-hover:scale-105 transition-transform shadow-xs">
                          <img
                            src={adv.avatar}
                            alt={adv.name}
                            className="w-13 h-13 rounded-full object-cover border-2 border-white"
                          />
                          {adv.online && (
                            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full shadow-xs" />
                          )}
                        </div>
                        <span className="text-[11px] font-extrabold text-slate-800 truncate max-w-[76px] group-hover:text-slate-900 text-center">
                          {adv.name.split(' ')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specialization Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-3 border-t border-slate-100">
                {FILTER_CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => setActiveCategoryFilter(chip)}
                    className={cn(
                      'px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap border',
                      activeCategoryFilter === chip
                        ? 'bg-[#18181B] border-[#18181B] text-white shadow-xs'
                        : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading & Error States */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-[28px] border border-slate-100/80 shadow-xs">
                <Loader2 size={28} className="animate-spin text-slate-700" />
                <p className="text-xs font-bold mt-3 text-slate-600">Loading verified financial advisors…</p>
              </div>
            )}

            {!isLoading && loadError && (
              <div className="bg-white rounded-[28px] border border-rose-200/80 p-8 text-center shadow-xs">
                <XCircle size={32} className="mx-auto text-rose-500" />
                <p className="text-sm font-black text-slate-900 mt-3">Could not load advisors</p>
                <p className="text-xs text-slate-500 font-medium mt-1">{loadError}</p>
                <button
                  onClick={() => void loadAdvisorsAndBookings()}
                  className="mt-4 px-5 py-2.5 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  Retry Loading
                </button>
              </div>
            )}

            {!isLoading && !loadError && filteredAdvisors.length === 0 && (
              <div className="bg-white rounded-[28px] border border-slate-100/80 p-12 text-center shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                <Users size={32} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">
                  {advisors.length === 0 ? 'No advisors are currently listed' : 'No advisors match your search'}
                </p>
                <p className="text-xs text-slate-500 font-medium mt-1 max-w-sm mx-auto">
                  {advisors.length === 0
                    ? 'Accredited advisory partners will appear here once verified.'
                    : 'Try modifying your search term or selecting a different specialization.'}
                </p>
              </div>
            )}

            {/* 4-Column Responsive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {filteredAdvisors.map(adv => {
                const isFollowed = followedAdvisorIds.includes(adv.id);
                return (
                  <motion.div
                    key={adv.id}
                    layoutId={adv.id}
                    className="bg-white rounded-[28px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-xl hover:border-slate-200 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-3.5">
                      {/* Avatar & Follow Action */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="relative">
                          <img
                            src={adv.avatar}
                            alt={adv.name}
                            className="w-14 h-14 rounded-2xl object-cover shadow-xs group-hover:scale-105 transition-transform duration-300"
                          />
                          {adv.online && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-xs" />
                          )}
                        </div>
                        <button
                          onClick={() => void handleToggleFollow(adv.id)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs',
                            isFollowed
                              ? 'bg-slate-100 text-slate-800 border-slate-200'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {isFollowed ? <UserCheck size={12} className="text-emerald-600" /> : <UserPlus size={12} />}
                          <span>{isFollowed ? 'Following' : 'Follow'}</span>
                        </button>
                      </div>

                      {/* Name & Title */}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-extrabold text-slate-900 text-sm truncate">{adv.name}</h3>
                          {adv.verified && <CheckCircle2 size={15} className="text-emerald-600 fill-emerald-100 shrink-0" />}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 line-clamp-1 mt-0.5">{adv.title}</p>
                      </div>

                      {/* Ratings & Rates */}
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-2.5 border-t border-slate-100">
                        <span className="flex items-center gap-1 text-amber-500 font-black">
                          <Star size={12} className="fill-current" />
                          {adv.rating.toFixed(1)} <span className="text-slate-400 font-normal">({adv.reviewCount})</span>
                        </span>
                        <span className="text-slate-400 font-medium">{adv.experienceYears}y exp</span>
                        <span className="text-slate-900 font-black">
                          {adv.hourlyRate !== null ? (
                            <>₹{adv.hourlyRate}<span className="text-[10px] font-normal text-slate-400">/hr</span></>
                          ) : (
                            <span className="text-slate-400 font-semibold">On request</span>
                          )}
                        </span>
                      </div>

                      {/* Expertise Tags */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {adv.expertise.slice(0, 3).map(exp => (
                          <span key={exp} className="px-2.5 py-0.5 bg-slate-50 text-slate-600 rounded-lg text-[9px] font-bold border border-slate-100">
                            {exp}
                          </span>
                        ))}
                        {adv.expertise.length > 3 && (
                          <span className="px-1.5 py-0.5 text-slate-400 text-[9px] font-bold">
                            +{adv.expertise.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-4 mt-3 border-t border-slate-100">
                      <button
                        onClick={() => setViewingProfileAdvisor(adv)}
                        className="py-2.5 px-3 bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 rounded-full text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => handleOpenBookingModal(adv)}
                        className="py-2.5 px-3 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                      >
                        <span>Book</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: MY CONSULTATIONS ── */}
        {activeTab === 'consultations' && (
          <div className="space-y-6">
            {/* Top Metric Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Consultations</span>
                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2">{stats.total}</p>
                <span className="text-[10px] font-semibold text-slate-500 mt-1">Booked sessions</span>
              </div>
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmed</span>
                <p className="text-xl sm:text-2xl font-black text-emerald-600 mt-2">{stats.confirmed}</p>
                <span className="text-[10px] font-semibold text-emerald-700 mt-1">Ready to attend</span>
              </div>
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Approval</span>
                <p className="text-xl sm:text-2xl font-black text-amber-600 mt-2">{stats.pending}</p>
                <span className="text-[10px] font-semibold text-amber-700 mt-1">Awaiting advisor</span>
              </div>
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-5 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Advisory Fees</span>
                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                  <FinancialAmount value={stats.totalFees} />
                </p>
                <span className="text-[10px] font-semibold text-slate-500 mt-1">Settled & scheduled</span>
              </div>
            </div>

            {/* Header Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-[28px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">Consultation Manager</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Track sessions, join encrypted meetings, and settle advisory invoices.</p>
              </div>
              <button
                onClick={() => setActiveTab('discover')}
                className="px-4 py-2.5 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                + Book New Consultation
              </button>
            </div>

            {/* Bookings List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookings.map(bkg => (
                <div key={bkg.id} className="bg-white rounded-[28px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] hover:shadow-md transition-all space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <img src={bkg.advisorAvatar} alt={bkg.advisorName} className="w-10 h-10 rounded-2xl object-cover shadow-2xs" />
                        <div>
                          <h4 className="font-extrabold text-slate-900 text-xs">{bkg.advisorName}</h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{bkg.sessionType} Session</span>
                        </div>
                      </div>
                      {getStatusBadge(bkg.status)}
                    </div>

                    <div>
                      <h5 className="font-black text-slate-900 text-xs line-clamp-1">{bkg.topic}</h5>
                      {bkg.notes && <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 font-medium">{bkg.notes}</p>}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> {bkg.proposedDate}</span>
                      <span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-400" /> {bkg.proposedTime}</span>
                      <span className="text-slate-900 font-black">
                        <FinancialAmount value={bkg.amount} />
                      </span>
                    </div>

                    {/* Consultation Settlement Status */}
                    {bkg.payment?.status === 'completed' ? (
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-emerald-700 text-xs font-bold">
                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-emerald-600" /> Fee Settled</span>
                        <span className="font-black"><FinancialAmount value={bkg.payment.amount} /></span>
                      </div>
                    ) : (bkg.status === 'completed' || bkg.payment?.status === 'pending') ? (
                      <div className="flex items-center justify-between p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Fee Pending</p>
                          <p className="text-xs font-black text-slate-900">
                            <FinancialAmount value={bkg.payment?.amount || bkg.amount} />
                          </p>
                        </div>
                        <button
                          onClick={() => void openPaymentModal(bkg)}
                          className="px-3.5 py-1.5 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                        >
                          <CreditCard size={12} /> Pay Fee
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Actions Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
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
                      className="py-2 bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <MessageSquare size={12} /> Chat
                    </button>
                    {bkg.status === 'pending' || bkg.status === 'accepted' ? (
                      <button
                        onClick={() => void handleCancelBooking(bkg.id)}
                        className="py-2 bg-white border border-rose-200/80 hover:bg-rose-50 text-rose-600 rounded-full text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <XCircle size={12} /> Cancel
                      </button>
                    ) : (
                      <span className="py-2 text-center text-[10px] font-bold text-slate-300">
                        —
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const adv = advisors.find(a => a.id === bkg.advisorId);
                        if (adv) handleOpenBookingModal(adv);
                        else toast.error('This advisor is no longer available');
                      }}
                      className="py-2 bg-[#18181B] hover:bg-black text-white rounded-full text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer shadow-2xs transition-all active:scale-95"
                    >
                      Re-book
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && bookings.length === 0 && (
              <div className="bg-white rounded-[28px] border border-slate-100/80 p-12 text-center shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                <Briefcase size={32} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">No consultations recorded yet</p>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Connect with a verified tax consultant or chartered accountant from Discover.
                </p>
                <button
                  onClick={() => setActiveTab('discover')}
                  className="mt-4 px-5 py-2.5 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  Explore Advisors
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: MESSAGES ── */}
        {activeTab === 'messages' && (
          <div className="bg-white rounded-[32px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] overflow-hidden flex flex-col md:flex-row h-[75vh]">
            {/* Left Thread List */}
            <div className="w-full md:w-80 border-r border-slate-100 flex flex-col bg-white shrink-0">
              <div className="p-4 border-b border-slate-100 bg-white">
                <h3 className="font-extrabold text-slate-900 text-sm">Consultation Chats</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Encrypted Direct Channel</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {chatThreads.length === 0 && (
                  <div className="p-8 text-center">
                    <MessageSquare size={28} className="mx-auto text-slate-300" />
                    <p className="text-xs font-bold text-slate-700 mt-3">No active chats</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                      A direct conversation unlocks automatically once an advisor accepts your booking.
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
                        isSelected ? 'bg-slate-100/90 shadow-2xs border border-slate-200/60' : 'hover:bg-slate-50'
                      )}
                    >
                      <div className="relative shrink-0">
                        <img src={thread.advisorAvatar} alt={thread.advisorName} className="w-10 h-10 rounded-2xl object-cover shadow-2xs" />
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
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  {activeThread && (
                    <img src={activeThread.advisorAvatar} alt={activeThread.advisorName} className="w-10 h-10 rounded-2xl object-cover shadow-2xs" />
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-slate-900 text-sm">
                        {activeThread ? activeThread.advisorName : 'Select a conversation'}
                      </h3>
                      {activeThread && <CheckCircle2 size={14} className="text-emerald-600" />}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{activeThread?.topic ?? ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200/60 text-[10px] font-black uppercase tracking-wider">
                  <Lock size={12} />
                  <span>Encrypted Channel</span>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 bg-slate-50/40">
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
                        'p-3.5 rounded-2xl text-xs font-semibold shadow-2xs',
                        isMe
                          ? 'bg-[#18181B] text-white rounded-br-none'
                          : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-none'
                      )}>
                        {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                        {msg.attachmentName && (
                          <button
                            onClick={() => void handleOpenAttachment(msg.id)}
                            className={cn(
                              'mt-2 p-2 rounded-xl flex items-center gap-2 text-[11px] font-bold border w-full text-left cursor-pointer transition-opacity hover:opacity-80',
                              isMe ? 'bg-slate-800 text-white border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                            )}
                            title="Open document"
                          >
                            <FileText size={14} className="shrink-0" />
                            <span className="truncate">{msg.attachmentName}</span>
                          </button>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  );
                })}
              </div>

              {/* Input Bar */}
              <div className="p-3.5 border-t border-slate-100 flex items-center gap-2 bg-white">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void handleAttachFile(file);
                  }}
                />
                <button
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={!activeThread || isUploadingAttachment}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Share a document (JPG, PNG, PDF up to 5MB)"
                >
                  {isUploadingAttachment ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                </button>
                <input
                  type="text"
                  value={newMessageText}
                  disabled={!activeThread}
                  onChange={e => setNewMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }}
                  placeholder={activeThread ? `Message ${activeThread.advisorName}...` : 'Select a consultation to message'}
                  className="flex-1 bg-slate-50/80 border border-slate-200/80 rounded-2xl py-2.5 px-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-slate-900/10 outline-none disabled:opacity-60"
                />
                <button
                  onClick={() => void handleSendMessage()}
                  disabled={!activeThread || !newMessageText.trim()}
                  className="p-2.5 bg-[#18181B] hover:bg-black disabled:bg-slate-300 text-white rounded-full transition-all shadow-xs active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: FOLLOWING ── */}
        {activeTab === 'following' && (
          <div className="space-y-6">
            <div className="bg-white p-5 sm:p-6 rounded-[28px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">Following ({followedAdvisorIds.length})</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Direct insights on tax saving strategies, GST revisions, and wealth planning.</p>
              </div>
            </div>

            {followedAdvisorIds.length === 0 && (
              <div className="bg-white rounded-[28px] border border-slate-100/80 p-12 text-center shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                <UserPlus size={32} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">You are not following any advisors yet</p>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Follow certified advisors in Discover to receive their articles and updates.
                </p>
                <button
                  onClick={() => setActiveTab('discover')}
                  className="mt-4 px-5 py-2.5 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  Browse Advisors
                </button>
              </div>
            )}

            {/* Followed Advisors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {advisors.filter(a => followedAdvisorIds.includes(a.id)).map(adv => (
                <div key={adv.id} className="bg-white p-4 rounded-[24px] border border-slate-100/80 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={adv.avatar} alt={adv.name} className="w-10 h-10 rounded-2xl object-cover shrink-0 shadow-2xs" />
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-900 text-xs truncate">{adv.name}</h4>
                      <p className="text-[10px] text-slate-400 font-bold line-clamp-1">{adv.title}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleToggleFollow(adv.id)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                    title="Unfollow"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>

            {/* Posts Feed */}
            <div className="max-w-2xl mx-auto space-y-4">
              {followedAdvisorIds.length > 0 && followedPosts.length === 0 && (
                <div className="bg-white rounded-[28px] border border-slate-100/80 p-8 text-center">
                  <MessageSquare size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600 mt-2">
                    No publications yet from the advisors you follow.
                  </p>
                </div>
              )}
              {followedPosts.map(post => (
                <div key={post.id} className="bg-white rounded-[28px] p-5 sm:p-6 border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img src={post.advisorAvatar} alt={post.advisorName} className="w-10 h-10 rounded-2xl object-cover shadow-2xs" />
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{post.advisorName}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{post.advisorTitle} · {post.timestamp}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black uppercase">
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
                        'flex items-center gap-1.5 py-1.5 px-3 rounded-full transition-all cursor-pointer',
                        post.liked ? 'bg-rose-50 text-rose-600 font-black' : 'hover:bg-slate-100'
                      )}
                    >
                      <ThumbsUp size={13} className={post.liked ? 'fill-current' : ''} />
                      <span>{post.likes} Likes</span>
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`${post.title}\n\n${post.content}\n\n— ${post.advisorName}`);
                          toast.success('Update copied to clipboard');
                        } catch {
                          toast.error('Could not copy to clipboard');
                        }
                      }}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-full hover:bg-slate-100 transition-all cursor-pointer text-slate-600"
                    >
                      <Share2 size={13} />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB 5: MY BOOKINGS ── */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="bg-white p-5 sm:p-6 rounded-[28px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">Scheduled Appointments</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Manage upcoming sessions, download calendar invites, or enter meeting rooms.</p>
              </div>
            </div>

            <div className="space-y-3">
              {bookings.map(bkg => (
                <div key={bkg.id} className="bg-white p-5 sm:p-6 rounded-[28px] border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img src={bkg.advisorAvatar} alt={bkg.advisorName} className="w-12 h-12 rounded-2xl object-cover shrink-0 shadow-2xs" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-slate-900 text-sm">{bkg.advisorName}</h4>
                        {getStatusBadge(bkg.status)}
                      </div>
                      <p className="text-xs text-slate-600 font-semibold mt-0.5">{bkg.topic}</p>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2.5 text-xs font-bold text-slate-600 shrink-0">
                    <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200/60">
                      <Calendar size={13} className="text-slate-500" /> {bkg.proposedDate}
                    </span>
                    <span className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200/60">
                      <Clock size={13} className="text-slate-500" /> {bkg.proposedTime}
                    </span>
                    
                    {/* Add to Calendar (.ics) */}
                    {(bkg.status === 'accepted' || bkg.status === 'pending') && (
                      <button
                        type="button"
                        onClick={() => handleDownloadIcs(bkg)}
                        title="Download calendar event file (.ics)"
                        className="px-3 py-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-full transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Download size={13} />
                        <span className="text-[11px] font-bold">.ics</span>
                      </button>
                    )}

                    {bkg.status === 'accepted' && (
                      <button
                        type="button"
                        onClick={() => handleJoinCall(bkg)}
                        className="px-4 py-1.5 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <Video size={13} /> Join Call
                      </button>
                    )}

                    {(bkg.status === 'completed' || bkg.payment?.status === 'pending') && bkg.payment?.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => void openPaymentModal(bkg)}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                      >
                        <CreditCard size={13} /> Settle Fee
                      </button>
                    )}

                    {bkg.payment?.status === 'completed' && (
                      <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> Paid <FinancialAmount value={bkg.payment.amount} />
                      </span>
                    )}

                    {['pending', 'reschedule', 'accepted'].includes(bkg.status) && (
                      <button
                        type="button"
                        onClick={() => void handleCancelBooking(bkg.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-full transition-colors border border-rose-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!isLoading && bookings.length === 0 && (
              <div className="bg-white rounded-[28px] border border-slate-100/80 p-12 text-center shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)]">
                <Calendar size={32} className="mx-auto text-slate-300" />
                <p className="text-sm font-black text-slate-900 mt-3">No scheduled appointments</p>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Once your booking request is confirmed, your appointment schedule appears here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL 1: ADVISOR PROFILE MODAL ── */}
      <AnimatePresence>
        {viewingProfileAdvisor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs"
            onClick={e => { if (e.target === e.currentTarget) setViewingProfileAdvisor(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white relative">
                <button
                  onClick={() => setViewingProfileAdvisor(null)}
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer flex items-center justify-center absolute top-4 right-4"
                >
                  <X size={16} />
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
                    <p className="text-xs text-slate-300 font-medium">{viewingProfileAdvisor.title}</p>
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

              {/* Bio & Details */}
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto text-xs font-medium">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">About & Advisory Practice</h4>
                  <p className="text-slate-700 leading-relaxed font-medium">{viewingProfileAdvisor.bio || 'Accredited advisory partner providing specialized financial planning and statutory compliance services.'}</p>
                </div>

                <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-50/80 rounded-2xl text-center border border-slate-100">
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Rating</p>
                    <p className="font-black text-sm text-emerald-600 mt-0.5">
                      {viewingProfileAdvisor.reviewCount > 0 ? viewingProfileAdvisor.rating.toFixed(1) : '5.0'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Status</p>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {viewingProfileAdvisor.availability ? 'Available' : 'Booked'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Standard Fee</p>
                    <p className="font-black text-slate-900 text-sm mt-0.5">
                      {viewingProfileAdvisor.hourlyRate !== null ? `₹${viewingProfileAdvisor.hourlyRate}/hr` : 'On Request'}
                    </p>
                  </div>
                </div>

                {viewingProfileAdvisor.expertise.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Specializations</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {viewingProfileAdvisor.expertise.map(area => (
                        <span key={area} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-2.5">
                <button
                  onClick={() => void handleToggleFollow(viewingProfileAdvisor.id)}
                  className="py-3 px-4 bg-white border border-slate-200/80 text-slate-700 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                >
                  {followedAdvisorIds.includes(viewingProfileAdvisor.id)
                    ? <><UserCheck size={14} className="text-emerald-600" /> Following</>
                    : <><UserPlus size={14} /> Follow</>}
                </button>
                <button
                  onClick={() => {
                    const thread = chatThreads.find((t) => t.advisorId === viewingProfileAdvisor.id);
                    if (!thread?.sessionId) {
                      toast.info('Book a consultation first — chat opens once the advisor accepts.');
                      return;
                    }
                    setActiveSessionId(thread.sessionId);
                    setViewingProfileAdvisor(null);
                    setActiveTab('messages');
                  }}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-900 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <MessageSquare size={14} /> Message
                </button>
                <button
                  onClick={() => handleOpenBookingModal(viewingProfileAdvisor)}
                  className="flex-1 py-3 px-5 bg-[#18181B] hover:bg-black text-white rounded-full text-xs font-bold flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <Calendar size={14} />
                  <span>Book Consultation</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL 2: 3-STEP BOOKING WIZARD MODAL ── */}
      <AnimatePresence>
        {bookingAdvisor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs"
            onClick={e => { if (e.target === e.currentTarget) setBookingAdvisor(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-300 tracking-wider">Book Consultation</p>
                  <h3 className="font-extrabold text-base truncate">{bookingAdvisor.name}</h3>
                </div>
                <button
                  onClick={() => setBookingAdvisor(null)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Stepper Progress */}
              <div className="px-6 pt-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                {[
                  { step: 1, label: 'Format' },
                  { step: 2, label: 'Schedule' },
                  { step: 3, label: 'Topic & Confirm' },
                ].map(s => (
                  <div key={s.step} className="flex items-center gap-1.5">
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black',
                      bookingStep === s.step
                        ? 'bg-[#18181B] text-white'
                        : bookingStep > s.step
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-400'
                    )}>
                      {bookingStep > s.step ? <Check size={10} /> : s.step}
                    </span>
                    <span className={cn(
                      'text-[10px] font-bold',
                      bookingStep === s.step ? 'text-slate-900' : 'text-slate-400'
                    )}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Step Content */}
              <div className="p-6 space-y-4 text-xs font-semibold">
                {bookingStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Select Meeting Format</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'video', label: 'Video Call', icon: Video },
                          { id: 'audio', label: 'Audio Call', icon: Phone },
                          { id: 'chat', label: 'Live Chat', icon: MessageCircle },
                        ].map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setBookingForm(f => ({ ...f, sessionType: st.id as any }))}
                            className={cn(
                              'flex flex-col items-center gap-2 py-3.5 rounded-2xl border-2 transition-all cursor-pointer',
                              bookingForm.sessionType === st.id
                                ? 'border-[#18181B] bg-slate-50 text-slate-900 shadow-2xs'
                                : 'border-slate-100 text-slate-500 hover:bg-slate-50'
                            )}
                          >
                            <st.icon size={18} className={bookingForm.sessionType === st.id ? 'text-slate-900' : 'text-slate-400'} />
                            <span className="text-[10px] font-extrabold uppercase tracking-wider">{st.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-600 text-[11px] leading-relaxed">
                      <p className="font-bold text-slate-900 mb-0.5">Encrypted Consultation</p>
                      Sessions are protected end-to-end. Video calls use peer-to-peer WebRTC rooms.
                    </div>

                    <button
                      type="button"
                      onClick={() => setBookingStep(2)}
                      className="w-full h-11 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span>Next: Choose Date & Time</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}

                {bookingStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Date</label>
                        <input
                          type="date"
                          value={bookingForm.date}
                          onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2.5 px-3 font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-slate-900/10"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Time</label>
                        <input
                          type="time"
                          value={bookingForm.time}
                          onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))}
                          className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2.5 px-3 font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-slate-900/10"
                        />
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-slate-700 text-xs">
                      <span>Estimated Duration:</span>
                      <span className="font-bold text-slate-900">{SESSION_DURATION_MINUTES} Minutes</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBookingStep(1)}
                        className="py-2.5 px-4 bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 rounded-full font-bold text-xs transition-all cursor-pointer shadow-2xs"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!bookingForm.date || !bookingForm.time) {
                            toast.error('Please specify both date and time');
                            return;
                          }
                          setBookingStep(3);
                        }}
                        className="flex-1 h-11 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <span>Next: Consultation Details</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {bookingStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Consultation Topic *</label>
                      <input
                        type="text"
                        value={bookingForm.topic}
                        onChange={e => setBookingForm(f => ({ ...f, topic: e.target.value }))}
                        placeholder="e.g. FY 2026 Tax Deductions / GST ITC Reconciliation"
                        className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2.5 px-3.5 font-bold text-slate-900 text-xs focus:ring-2 focus:ring-slate-900/10 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Context & Documents (Optional)</label>
                      <textarea
                        rows={2}
                        value={bookingForm.notes}
                        onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="List any questions or documents you'll share..."
                        className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2 px-3 font-bold text-slate-900 text-xs resize-none outline-none focus:ring-2 focus:ring-slate-900/10"
                      />
                    </div>

                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-slate-900 text-xs">
                      <span>Advisory Fee:</span>
                      <span className="font-black text-sm text-slate-900">
                        {bookingAdvisor.hourlyRate !== null ? (
                          `₹${bookingAdvisor.hourlyRate}`
                        ) : (
                          'Settled with advisor'
                        )}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setBookingStep(2)}
                        className="py-2.5 px-4 bg-white border border-slate-200/80 hover:bg-slate-50 text-slate-700 rounded-full font-bold text-xs transition-all cursor-pointer shadow-2xs"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmitBooking()}
                        disabled={isSubmittingBooking}
                        className="flex-1 h-11 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {isSubmittingBooking ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                        <span>Submit Booking Request</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL 3: PAYMENT SETTLEMENT MODAL ── */}
      <AnimatePresence>
        {payingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
            onClick={e => { if (e.target === e.currentTarget && !isProcessingPayment) setPayingBooking(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white relative">
                <button
                  onClick={() => setPayingBooking(null)}
                  disabled={isProcessingPayment}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center absolute top-4 right-4 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <X size={16} />
                </button>

                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
                    <CreditCard size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg tracking-tight">Settle Consultation Fee</h3>
                    <p className="text-xs text-slate-300 font-medium">Direct payment to {payingBooking.advisorName}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Session Card */}
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img src={payingBooking.advisorAvatar} alt={payingBooking.advisorName} className="w-9 h-9 rounded-xl object-cover shadow-2xs" />
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-xs">{payingBooking.advisorName}</h4>
                        <p className="text-[10px] text-slate-400 font-bold">{payingBooking.topic}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Total Due</span>
                      <span className="text-base font-black text-slate-900">
                        <FinancialAmount value={payingBooking.payment?.amount || payingBooking.amount} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Method Selection */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'upi' as const, label: 'UPI QR / App', sub: 'Instant settlement', icon: QrCode },
                      { id: 'credit_card' as const, label: 'Credit Card', sub: 'Visa, Master, RuPay', icon: CreditCard },
                      { id: 'bank_transfer' as const, label: 'Net Banking', sub: 'IMPS / NEFT', icon: Banknote },
                      { id: 'cash' as const, label: 'Cash / Handover', sub: 'In-person receipt', icon: Wallet },
                    ].map(method => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id)}
                        className={cn(
                          'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between',
                          paymentMethod === method.id
                            ? 'bg-slate-50 border-[#18181B] shadow-2xs'
                            : 'bg-white border-slate-200/80 hover:bg-slate-50'
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <method.icon size={15} className={paymentMethod === method.id ? 'text-slate-900' : 'text-slate-400'} />
                          {paymentMethod === method.id && <CheckCircle2 size={13} className="text-emerald-600" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{method.label}</p>
                          <p className="text-[10px] font-medium text-slate-400 mt-0.5">{method.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Account Deduction Leg */}
                {userAccounts.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      Deduct from Kanaku Account
                    </label>
                    <select
                      value={selectedAccountId ?? ''}
                      onChange={e => setSelectedAccountId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2.5 px-3 font-bold text-slate-900 text-xs outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                      <option value="">Settled Externally (No ledger debit)</option>
                      {userAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} — Balance: ₹{acc.balance.toLocaleString('en-IN')}
                        </option>
                      ))}
                    </select>
                    {selectedAccountId !== null && (
                      <p className="text-[10px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                        <ShieldCheck size={12} /> Automatically debits balance and creates consultation expense entry
                      </p>
                    )}
                  </div>
                )}

                {/* Confirm Action Button */}
                <button
                  onClick={() => void handleConfirmPayment()}
                  disabled={isProcessingPayment}
                  className="w-full h-12 bg-[#18181B] hover:bg-black text-white rounded-full font-bold text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isProcessingPayment ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  <span>
                    Confirm & Settle <FinancialAmount value={payingBooking.payment?.amount || payingBooking.amount} />
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </CenteredLayout>
  );
};
