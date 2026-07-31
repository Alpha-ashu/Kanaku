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
import { motion, AnimatePresence } from 'framer-motion';

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
  hourlyRate: number;
  availability: boolean;
  languages: string[];
  bio: string;
  successRate: number;
  responseTime: string;
  followersCount: number;
  verified: boolean;
  online: boolean;
  availableDays: number[];
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

// ─── Initial Mock Data ────────────────────────────────────────────────────────
const TOP_ADVISORS: AdvisorProfileData[] = [
  {
    id: 'adv-vikram',
    name: 'Vikram Nair',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    title: 'SEBI Registered Investment Advisor (RIA)',
    expertise: ['Tax Planning', 'Wealth Management', 'Retirement'],
    experienceYears: 12,
    rating: 5.0,
    reviewCount: 42,
    hourlyRate: 1500,
    availability: true,
    languages: ['English', 'Hindi', 'Malayalam'],
    bio: 'Specialized in high-net-worth tax optimization, ITR-2/3/4 filings, and long-term equity wealth building.',
    successRate: 99,
    responseTime: '10 mins',
    followersCount: 1420,
    verified: true,
    online: true,
    availableDays: [1, 2, 3, 4, 5],
  },
  {
    id: 'adv-pooja',
    name: 'CA Pooja Krishnan',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    title: 'Chartered Accountant & Corporate Tax Consultant',
    expertise: ['GST', 'Tax Planning', 'Business'],
    experienceYears: 9,
    rating: 4.9,
    reviewCount: 38,
    hourlyRate: 2000,
    availability: true,
    languages: ['English', 'Kannada', 'Hindi'],
    bio: 'Helping startups and individuals structure business taxes, GST compliance, and audit defense.',
    successRate: 98,
    responseTime: '15 mins',
    followersCount: 980,
    verified: true,
    online: true,
    availableDays: [1, 3, 5],
  },
  {
    id: 'adv-nikhil',
    name: 'Nikhil Desai',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    title: 'Certified Financial Planner (CFP)',
    expertise: ['Investment', 'Loan', 'Retirement'],
    experienceYears: 7,
    rating: 4.8,
    reviewCount: 29,
    hourlyRate: 1200,
    availability: true,
    languages: ['English', 'Marathi', 'Gujarati'],
    bio: 'Expert in home loan restructuring, fixed vs floating rate advisory, and mutual fund asset allocation.',
    successRate: 96,
    responseTime: '20 mins',
    followersCount: 750,
    verified: true,
    online: true,
    availableDays: [2, 4, 6],
  },
  {
    id: 'adv-sameer',
    name: 'Sameer Khan',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    title: 'GST & International Tax Consultant',
    expertise: ['GST', 'Legal', 'Business'],
    experienceYears: 10,
    rating: 4.9,
    reviewCount: 31,
    hourlyRate: 1800,
    availability: true,
    languages: ['English', 'Hindi', 'Urdu'],
    bio: 'Cross-border tax compliance, NRI investments, and GST registration strategy for e-commerce sellers.',
    successRate: 97,
    responseTime: '12 mins',
    followersCount: 1120,
    verified: true,
    online: true,
    availableDays: [1, 2, 4, 5],
  },
  {
    id: 'adv-lakshmi',
    name: 'Adv. Lakshmi Menon',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    title: 'High Court Advocate & Estate Attorney',
    expertise: ['Legal', 'Retirement', 'Business'],
    experienceYears: 14,
    rating: 5.0,
    reviewCount: 56,
    hourlyRate: 2500,
    availability: true,
    languages: ['English', 'Tamil', 'Hindi'],
    bio: 'Estate planning, succession wills, family trust management, and commercial property title verification.',
    successRate: 100,
    responseTime: '25 mins',
    followersCount: 2100,
    verified: true,
    online: true,
    availableDays: [1, 3, 5, 6],
  },
  {
    id: 'adv-arvind',
    name: 'Arvind Reddy',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    title: 'Wealth Management & Crypto Tax Lead',
    expertise: ['Investment', 'Tax Planning', 'Business'],
    experienceYears: 8,
    rating: 4.8,
    reviewCount: 24,
    hourlyRate: 2200,
    availability: true,
    languages: ['English', 'Telugu', 'Hindi'],
    bio: 'VDA (Crypto/NFT) tax reporting under Section 194S and multi-asset portfolio rebalancing.',
    successRate: 95,
    responseTime: '15 mins',
    followersCount: 890,
    verified: true,
    online: true,
    availableDays: [2, 3, 4, 5],
  },
  {
    id: 'adv-meera',
    name: 'Meera Iyer',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    title: 'NRI Taxation & DTAA Advisory Specialist',
    expertise: ['Tax Planning', 'Legal'],
    experienceYears: 11,
    rating: 5.0,
    reviewCount: 40,
    hourlyRate: 3000,
    availability: true,
    languages: ['English', 'Tamil', 'Hindi'],
    bio: 'Double Taxation Avoidance Agreement (DTAA) relief, Form 15CA/CB certificates, and repatriations.',
    successRate: 99,
    responseTime: '8 mins',
    followersCount: 1650,
    verified: true,
    online: true,
    availableDays: [1, 2, 3, 5],
  },
  {
    id: 'adv-ananya',
    name: 'Ananya Sen',
    avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80',
    title: 'Corporate Tax Lead & M&A Strategist',
    expertise: ['Business', 'Tax Planning'],
    experienceYears: 10,
    rating: 4.9,
    reviewCount: 22,
    hourlyRate: 2800,
    availability: true,
    languages: ['English', 'Bengali', 'Hindi'],
    bio: 'M&A tax structuring, MCA filings, employee ESOP taxation, and corporate compliance audit.',
    successRate: 98,
    responseTime: '18 mins',
    followersCount: 720,
    verified: true,
    online: true,
    availableDays: [1, 4, 5],
  },
];

const INITIAL_BOOKINGS: BookingData[] = [
  {
    id: 'bkg-101',
    advisorId: 'adv-vikram',
    advisorName: 'Vikram Nair',
    advisorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    status: 'accepted',
    proposedDate: '2026-08-05',
    proposedTime: '16:00',
    sessionType: 'video',
    topic: 'Tax Optimization & ITR 2026 Strategy Review',
    notes: 'Please review last year ITR V and capital gains statement.',
    amount: 1500,
    createdAt: '2026-07-30T10:00:00Z',
  },
  {
    id: 'bkg-102',
    advisorId: 'adv-pooja',
    advisorName: 'CA Pooja Krishnan',
    advisorAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    status: 'pending',
    proposedDate: '2026-08-08',
    proposedTime: '11:30',
    sessionType: 'video',
    topic: 'GST Input Tax Credit & Quarter 2 Filing',
    amount: 2000,
    createdAt: '2026-07-31T14:30:00Z',
  },
  {
    id: 'bkg-103',
    advisorId: 'adv-nikhil',
    advisorName: 'Nikhil Desai',
    advisorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    status: 'completed',
    proposedDate: '2026-07-26',
    proposedTime: '14:00',
    sessionType: 'audio',
    topic: 'Home Loan Fixed vs Floating Interest Advisory',
    notes: 'Recommended switching to SBI repo-linked rate (8.40%). Saved ₹1.2L in interest.',
    amount: 1200,
    createdAt: '2026-07-25T09:15:00Z',
  },
];

const INITIAL_POSTS: AdvisorPost[] = [
  {
    id: 'post-1',
    advisorId: 'adv-vikram',
    advisorName: 'Vikram Nair',
    advisorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    advisorTitle: 'SEBI Registered RIA',
    timestamp: '2 hours ago',
    category: 'Tax Alert',
    title: 'Important Tax Saving Deadlines for Q3 2026',
    content: 'Ensure your advance tax estimates for Q2/Q3 are calculated before Sept 15th to avoid Section 234C interest penalties. Book a quick 15-min session if you had major capital gains!',
    likes: 42,
    liked: false,
  },
  {
    id: 'post-2',
    advisorId: 'adv-pooja',
    advisorName: 'CA Pooja Krishnan',
    advisorAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    advisorTitle: 'Chartered Accountant',
    timestamp: 'Yesterday',
    category: 'GST Update',
    title: 'New E-Invoicing Threshold Rules Introduced',
    content: 'CBIC has updated GST e-invoicing requirements for businesses with annual turnover exceeding ₹5 Cr. Download the official compliance guide in my profile resources.',
    likes: 28,
    liked: true,
  },
];

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
  
  // States
  const [advisors] = useState<AdvisorProfileData[]>(TOP_ADVISORS);
  const [bookings, setBookings] = useState<BookingData[]>(INITIAL_BOOKINGS);
  const [posts, setPosts] = useState<AdvisorPost[]>(INITIAL_POSTS);
  const [followedAdvisorIds, setFollowedAdvisorIds] = useState<string[]>(['adv-vikram', 'adv-pooja']);
  
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

  // Messages / Chat State
  const [activeChatAdvisorId, setActiveChatAdvisorId] = useState<string>('adv-vikram');
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({
    'adv-vikram': [
      {
        id: 'msg-1',
        senderId: 'adv-vikram',
        senderName: 'Vikram Nair',
        receiverId: 'user',
        text: 'Hello! I noticed your booking for Tax Optimization & ITR 2026. Please share your Form 16 or capital gain statements whenever convenient.',
        timestamp: '10:30 AM',
        isEncrypted: true,
      },
      {
        id: 'msg-2',
        senderId: 'user',
        senderName: 'You',
        receiverId: 'adv-vikram',
        text: 'Sure Vikram, I have uploaded the Form 16 PDF from Zerodha. Let me know if you need AIS/TIS summary as well.',
        timestamp: '10:35 AM',
        attachmentName: 'Zerodha_Tax_Statement_2026.pdf',
        isEncrypted: true,
      },
    ],
    'adv-pooja': [
      {
        id: 'msg-3',
        senderId: 'adv-pooja',
        senderName: 'CA Pooja Krishnan',
        receiverId: 'user',
        text: 'Hi! Looking forward to reviewing your GST Input Tax Credit query on Aug 8th.',
        timestamp: 'Yesterday',
        isEncrypted: true,
      },
    ],
  });
  const [newMessageText, setNewMessageText] = useState('');

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleToggleFollow = (advisorId: string) => {
    if (followedAdvisorIds.includes(advisorId)) {
      setFollowedAdvisorIds(prev => prev.filter(id => id !== advisorId));
      toast.success('Unfollowed advisor');
    } else {
      setFollowedAdvisorIds(prev => [...prev, advisorId]);
      toast.success('Now following advisor! You will receive tax & webinar updates.');
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

  const handleSubmitBooking = () => {
    if (!bookingAdvisor || !bookingForm.date || !bookingForm.time || !bookingForm.topic) {
      toast.error('Please complete date, time, and consultation topic');
      return;
    }
    setIsSubmittingBooking(true);
    setTimeout(() => {
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
        amount: bookingAdvisor.hourlyRate,
        createdAt: new Date().toISOString(),
      };
      setBookings(prev => [newBooking, ...prev]);
      setIsSubmittingBooking(false);
      setBookingAdvisor(null);
      toast.success(`Booking request submitted to ${bookingAdvisor.name}! Status: Pending Approval.`);
      setActiveTab('consultations');
    }, 600);
  };

  const handleSendMessage = () => {
    if (!newMessageText.trim() || !activeChatAdvisorId) return;
    const currentChat = chatMessages[activeChatAdvisorId] || [];
    
    // Check 5-message free restriction if no accepted booking exists
    const hasAcceptedBooking = bookings.some(b => b.advisorId === activeChatAdvisorId && b.status === 'accepted');
    const userSentCount = currentChat.filter(m => m.senderId === 'user').length;
    
    if (!hasAcceptedBooking && userSentCount >= 5) {
      toast.error('Free tier message limit reached (5 messages). Confirm a consultation booking to unlock unlimited messaging!');
      return;
    }

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: 'user',
      senderName: 'You',
      receiverId: activeChatAdvisorId,
      text: newMessageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEncrypted: true,
    };

    setChatMessages(prev => ({
      ...prev,
      [activeChatAdvisorId]: [...(prev[activeChatAdvisorId] || []), newMsg],
    }));
    setNewMessageText('');
  };

  const handleToggleLikePost = (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const liked = !p.liked;
        return { ...p, liked, likes: liked ? p.likes + 1 : p.likes - 1 };
      }
      return p;
    }));
  };

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

  const activeChatAdvisor = advisors.find(a => a.id === activeChatAdvisorId) || advisors[0];

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
                          onClick={() => handleToggleFollow(adv.id)}
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
                        <span className="text-indigo-600 font-extrabold">₹{adv.hourlyRate}/hr</span>
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
                        setActiveChatAdvisorId(bkg.advisorId);
                        setActiveTab('messages');
                      }}
                      className="py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                    >
                      <MessageSquare size={12} /> Chat
                    </button>
                    <button
                      onClick={() => toast.info('Consultation Notes: Shared tax worksheet attached.')}
                      className="py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                    >
                      <FileText size={12} /> Notes
                    </button>
                    <button
                      onClick={() => {
                        const adv = advisors.find(a => a.id === bkg.advisorId);
                        if (adv) handleOpenBookingModal(adv);
                      }}
                      className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Re-book
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
                {advisors.map(adv => {
                  const isSelected = activeChatAdvisorId === adv.id;
                  const msgs = chatMessages[adv.id] || [];
                  const lastMsg = msgs[msgs.length - 1];
                  return (
                    <div
                      key={adv.id}
                      onClick={() => setActiveChatAdvisorId(adv.id)}
                      className={cn(
                        'p-3 rounded-2xl transition-all cursor-pointer flex items-center gap-3',
                        isSelected ? 'bg-indigo-50/60 shadow-xs border border-indigo-200/60' : 'hover:bg-slate-50'
                      )}
                    >
                      <div className="relative shrink-0">
                        <img src={adv.avatar} alt={adv.name} className="w-10 h-10 rounded-2xl object-cover" />
                        {adv.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="font-extrabold text-slate-900 text-xs truncate">{adv.name}</h4>
                          {lastMsg && <span className="text-[9px] font-bold text-slate-400">{lastMsg.timestamp}</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                          {lastMsg ? lastMsg.text : 'Tap to start consultation chat'}
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
                  <img src={activeChatAdvisor.avatar} alt={activeChatAdvisor.name} className="w-10 h-10 rounded-2xl object-cover" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-black text-slate-900 text-sm">{activeChatAdvisor.name}</h3>
                      <CheckCircle2 size={14} className="text-indigo-600" />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{activeChatAdvisor.title}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200/60 text-[10px] font-black uppercase">
                  <Lock size={12} />
                  <span>AES-256 Encrypted</span>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white">
                {(chatMessages[activeChatAdvisorId] || []).map(msg => {
                  const isMe = msg.senderId === 'user';
                  return (
                    <div key={msg.id} className={cn('flex flex-col max-w-[75%]', isMe ? 'ml-auto items-end' : 'mr-auto items-start')}>
                      <div className={cn(
                        'p-3.5 rounded-2xl text-xs font-semibold shadow-xs',
                        isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-none'
                      )}>
                        <p className="leading-relaxed">{msg.text}</p>
                        {msg.attachmentName && (
                          <div className={cn(
                            'mt-2 p-2 rounded-xl flex items-center gap-2 text-[11px] font-bold border',
                            isMe ? 'bg-indigo-700/60 text-white border-indigo-500' : 'bg-slate-100 text-slate-700 border-slate-200'
                          )}>
                            <FileText size={14} />
                            <span className="truncate">{msg.attachmentName}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  );
                })}
              </div>


              {/* Chat Input Bar */}
              <div className="p-4 border-t border-slate-200/80 flex items-center gap-2 bg-white">
                <button
                  onClick={() => toast.info('Selected document attached for tax review.')}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
                  title="Attach document"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={newMessageText}
                  onChange={e => setNewMessageText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSendMessage(); }}
                  placeholder={`Message ${activeChatAdvisor.name}...`}
                  className="flex-1 bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-4 font-semibold text-slate-900 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
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
                    onClick={() => handleToggleFollow(adv.id)}
                    className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                    title="Unfollow"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Posts Feed */}
            <div className="max-w-2xl mx-auto space-y-4">
              {posts.map(post => (
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
                      onClick={() => handleToggleLikePost(post.id)}
                      className={cn(
                        'flex items-center gap-1.5 py-1.5 px-3 rounded-xl transition-all cursor-pointer',
                        post.liked ? 'bg-rose-50 text-rose-600 font-black' : 'hover:bg-slate-100'
                      )}
                    >
                      <ThumbsUp size={14} className={post.liked ? 'fill-current' : ''} />
                      <span>{post.likes} Likes</span>
                    </button>

                    <button
                      onClick={() => toast.success('Link copied to clipboard!')}
                      className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      <Share2 size={14} />
                      <span>Share</span>
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
                      <span>· {viewingProfileAdvisor.followersCount} Followers</span>
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
                    <p className="text-[9px] font-black uppercase text-slate-400">Success Rate</p>
                    <p className="font-black text-slate-900 text-sm text-emerald-600 mt-0.5">{viewingProfileAdvisor.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">Response Time</p>
                    <p className="font-black text-slate-900 text-sm mt-0.5">{viewingProfileAdvisor.responseTime}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-400">Rate</p>
                    <p className="font-black text-indigo-600 text-sm mt-0.5">₹{viewingProfileAdvisor.hourlyRate}/hr</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Languages Spoken</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {viewingProfileAdvisor.languages.map(lang => (
                      <span key={lang} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex gap-2">
                <button
                  onClick={() => handleToggleFollow(viewingProfileAdvisor.id)}
                  className="py-3 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-all cursor-pointer"
                >
                  <UserPlus size={14} /> Follow
                </button>
                <button
                  onClick={() => {
                    setActiveChatAdvisorId(viewingProfileAdvisor.id);
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
                  <span className="text-indigo-600 font-black text-sm">₹{bookingAdvisor.hourlyRate}</span>
                </div>

                <button
                  onClick={handleSubmitBooking}
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

