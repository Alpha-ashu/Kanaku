import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  MoreHorizontal,
  Plus,
  Send,
  Mic,
  MicOff,
  Sparkles,
  Clock,
  Target,
  BarChart3,
  Receipt,
  RotateCcw,
  Camera,
  Image as ImageIcon,
  TrendingDown,
  TrendingUp,
  MessageSquare,
  Volume2,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { AIOrb } from './ai/AIOrb';
import { PendingBreakdownCard } from './ai/PendingBreakdownCard';
import { NLQService, QueryResult } from '@/services/nlqService';
import {
  startSpeechRecognition,
  SpeechSession,
} from '@/services/speechRecognitionAdapter';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  timeLabel?: string;
  showBreakdownCard?: boolean;
  transactions?: QueryResult['transactions'];
  source?: 'backend' | 'local';
  isTyping?: boolean;
}

interface AIAssistantPageProps {
  defaultMode?: 'voice' | 'chat';
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  defaultMode = 'voice',
}) => {
  const { setCurrentPage, currency } = useApp();

  // Mode: 'voice' (AI Orb Hub - center reference screen) or 'chat' (Conversational - right reference screen)
  const [mode, setMode] = useState<'voice' | 'chat'>(defaultMode);

  // Input state
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);

  // Initial seed conversation matching the reference screen
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'seed-1',
      role: 'user',
      content: 'Hi Money AI, can you analyze my spending this month?',
      timestamp: new Date(Date.now() - 1000 * 60 * 3),
      timeLabel: '8:45 AM',
    },
    {
      id: 'seed-2',
      role: 'assistant',
      content: "Hello! Sure, I've analyzed your spending for this month.",
      timestamp: new Date(Date.now() - 1000 * 60 * 2),
      timeLabel: '8:45 AM',
    },
    {
      id: 'seed-3',
      role: 'user',
      content: 'Great! Show me where most of my money goes.',
      timestamp: new Date(Date.now() - 1000 * 60 * 1),
      timeLabel: '8:46 AM',
    },
    {
      id: 'seed-4',
      role: 'assistant',
      content: "Here's your detailed spending breakdown for this month.",
      timestamp: new Date(),
      timeLabel: '8:47 AM',
      showBreakdownCard: true,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const speechSessionRef = useRef<SpeechSession | null>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (mode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, mode, isLoading]);

  // Clean up speech session on unmount
  useEffect(() => {
    return () => {
      if (speechSessionRef.current) {
        void speechSessionRef.current.stop();
        speechSessionRef.current = null;
      }
    };
  }, []);

  // ─── Speech Recognition ───────────────────────────────────────────────────────

  const stopListening = useCallback(async () => {
    if (speechSessionRef.current) {
      await speechSessionRef.current.stop();
      speechSessionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const handleSpeechFinal = useCallback(
    (finalText: string) => {
      const trimmed = finalText.trim();
      if (!trimmed) return;
      setLiveTranscript('');
      // Switch to chat mode and process query
      setMode('chat');
      void executeQuery(trimmed);
    },
    [],
  );

  const startListening = useCallback(async () => {
    if (isListening) {
      await stopListening();
      return;
    }

    try {
      setIsListening(true);
      setLiveTranscript('');

      const session = await startSpeechRecognition({
        onPartial: (partial) => {
          setLiveTranscript(partial);
        },
        onFinal: (final) => {
          handleSpeechFinal(final);
        },
        onEnd: () => {
          setIsListening(false);
        },
        onError: (reason, message) => {
          console.warn('[AI Assistant Speech Error]', reason, message);
          setIsListening(false);
          if (reason !== 'no-speech') {
            toast.error(message || 'Speech recognition unavailable');
          }
        },
      });

      speechSessionRef.current = session;
    } catch (err: any) {
      console.error('[AI Assistant Speech Exception]', err);
      setIsListening(false);
      toast.error('Could not start microphone');
    }
  }, [isListening, stopListening, handleSpeechFinal]);

  // ─── NLQ Query Execution ──────────────────────────────────────────────────────

  const executeQuery = async (queryText: string) => {
    const text = queryText.trim();
    if (!text || isLoading) return;

    setInputText('');

    // Append user message
    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      timeLabel: formatTime(new Date()),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Add typing placeholder
    const typingId = uid();
    setMessages((prev) => [
      ...prev,
      {
        id: typingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isTyping: true,
      },
    ]);

    setIsLoading(true);

    // Detect if the user query is asking about spending / budget breakdown
    const isBreakdownQuery =
      /breakdown|where.*money|spending|category|categories|budget/i.test(text);

    try {
      const result = await NLQService.executeQuery(text);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? {
                ...m,
                content:
                  result.answer ||
                  (isBreakdownQuery
                    ? "Here's your detailed spending breakdown for this month."
                    : 'I have analyzed your financial activity.'),
                showBreakdownCard: isBreakdownQuery,
                transactions: result.transactions,
                source: result.source,
                isTyping: false,
                timeLabel: formatTime(new Date()),
              }
            : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? {
                ...m,
                content: isBreakdownQuery
                  ? "Here's your detailed spending breakdown for this month."
                  : 'I analyzed your recent activity.',
                showBreakdownCard: isBreakdownQuery,
                isTyping: false,
                source: 'local',
                timeLabel: formatTime(new Date()),
              }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    setMode('chat');
    void executeQuery(inputText);
  };

  const handleTopicChipClick = (promptText: string) => {
    setMode('chat');
    void executeQuery(promptText);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: uid(),
        role: 'assistant',
        content:
          "Hello! I'm your Smart AI Money Assistant. Ask me anything about your budget, spending breakdown, or log transactions.",
        timestamp: new Date(),
        timeLabel: formatTime(new Date()),
      },
    ]);
    setShowOptionsSheet(false);
    toast.success('Conversation reset');
  };

  return (
    <div className="relative w-full h-[calc(100dvh-9.5rem)] min-h-[550px] max-h-[750px] bg-gradient-to-b from-[#E7E2F8] via-[#F2EEF9] to-[#F8F6FD] text-slate-900 flex flex-col justify-between overflow-hidden select-none rounded-[28px] sm:rounded-[36px] border border-white/70 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] mb-20 sm:mb-24">
      {/* ── Soft Ambient Glow Background ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[8%] left-1/2 -translate-x-1/2 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] rounded-full bg-gradient-to-b from-purple-300/35 via-pink-200/25 to-transparent blur-3xl" />
        <div className="absolute bottom-[18%] left-1/4 w-[280px] h-[280px] rounded-full bg-gradient-to-tr from-cyan-200/20 via-indigo-100/25 to-transparent blur-3xl" />
      </div>

      {/* ── Top Header Navigation ── */}
      <header className="relative z-20 w-full max-w-md mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
        {/* Left: Back Button */}
        <button
          type="button"
          onClick={() => {
            if (mode === 'chat') {
              setMode('voice');
            } else {
              setCurrentPage('dashboard');
            }
          }}
          className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-xs border border-white/60 hover:bg-white text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
          aria-label={mode === 'chat' ? 'Back to Voice AI' : 'Back to Dashboard'}
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>

        {/* Center: Title / Profile */}
        {mode === 'voice' ? (
          <div className="flex flex-col items-center">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Money AI
            </h1>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <AIOrb size="sm" showStatusGlow={false} />
              {/* Online Green Indicator Dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-400" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                Money AI
              </h1>
              <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Your Financial Assistant
              </span>
            </div>
          </div>
        )}

        {/* Right: Manual Mode Switcher & Options */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Direct Manual Switch Pill */}
          <button
            type="button"
            onClick={() => setMode(mode === 'voice' ? 'chat' : 'voice')}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/80 backdrop-blur-md hover:bg-white text-purple-700 border border-purple-200/60 shadow-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            title={mode === 'voice' ? 'Switch to Chat mode' : 'Switch to Voice mode'}
          >
            {mode === 'voice' ? (
              <>
                <MessageSquare size={12} strokeWidth={2.4} />
                <span>Chat</span>
              </>
            ) : (
              <>
                <Volume2 size={12} strokeWidth={2.4} />
                <span>Voice</span>
              </>
            )}
          </button>

          {/* More Options (...) Button */}
          <button
            type="button"
            onClick={() => setShowOptionsSheet(!showOptionsSheet)}
            className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-xs border border-white/60 hover:bg-white text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95"
            aria-label="Options"
          >
            <MoreHorizontal size={20} strokeWidth={2.4} />
          </button>
        </div>
      </header>

      {/* ── Options Dropdown Menu ── */}
      <AnimatePresence>
        {showOptionsSheet && (
          <>
            <div
              className="fixed inset-0 z-30 bg-slate-900/10 backdrop-blur-2xs"
              onClick={() => setShowOptionsSheet(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="absolute top-16 right-4 z-40 w-52 bg-white/95 backdrop-blur-lg rounded-2xl shadow-xl border border-slate-100 p-2 space-y-1"
            >
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'voice' ? 'chat' : 'voice');
                  setShowOptionsSheet(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left cursor-pointer"
              >
                {mode === 'voice' ? <MessageSquare size={15} /> : <Mic size={15} />}
                <span>{mode === 'voice' ? 'Switch to Chat mode' : 'Switch to Voice mode'}</span>
              </button>
              <button
                type="button"
                onClick={handleResetChat}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
              >
                <RotateCcw size={15} />
                <span>Reset Conversation</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPage('receipt-scanner');
                  setShowOptionsSheet(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
              >
                <Receipt size={15} />
                <span>Receipt Scanner</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* ── MODE 1: VOICE AI / ORB HUB (Center Reference Screen) ─────────────── */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {mode === 'voice' ? (
        <motion.main
          key="voice-mode"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="relative z-10 flex-1 flex flex-col justify-between items-center px-4 max-w-md mx-auto w-full pt-1 pb-3 overflow-hidden h-full"
        >
          {/* Spacer / breathing room */}
          <div className="h-4 sm:h-8" />

          {/* Central 3D Iridescent Orb & Heading */}
          <div className="flex flex-col items-center justify-center space-y-6 sm:space-y-8 my-auto">
            {/* The 3D Orb */}
            <div className="relative cursor-pointer group" onClick={startListening}>
              <AIOrb
                size="lg"
                isListening={isListening}
                isProcessing={isLoading}
                showStatusGlow={true}
              />
            </div>

            {/* Title */}
            <div className="text-center px-4 space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Your Smart AI Money
                <br />
                Assistant
              </h2>

              {/* Status / Transcript Subtitle */}
              <AnimatePresence mode="wait">
                {isListening ? (
                  <motion.div
                    key="listening"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-100/80 border border-purple-200 text-purple-800 text-xs font-bold shadow-xs"
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping" />
                    <span>{liveTranscript || 'Listening... Speak now'}</span>
                  </motion.div>
                ) : (
                  <motion.p
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-slate-500 font-medium"
                  >
                    Tap orb to speak or type below
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Area: Topic Pills + Floating Input Bar */}
          <div className="w-full space-y-4 pt-4">
            {/* 3 Quick Topic Pills matching the Reference: Budget Planner, Goal Tracker, Spending Insights */}
            <div className="flex items-center justify-center gap-2 sm:gap-2.5 overflow-x-auto pb-1 scrollbar-none px-1">
              <button
                type="button"
                onClick={() => handleTopicChipClick('Show my budget planner and limits')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md hover:bg-white text-slate-700 hover:text-purple-700 border border-white/80 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Clock size={13} className="text-slate-500" />
                <span>Budget Planner</span>
              </button>

              <button
                type="button"
                onClick={() => handleTopicChipClick('What are my active goals and progress?')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md hover:bg-white text-slate-700 hover:text-purple-700 border border-white/80 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <Target size={13} className="text-slate-500" />
                <span>Goal Tracker</span>
              </button>

              <button
                type="button"
                onClick={() => handleTopicChipClick('Show detailed spending breakdown for this month')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white/70 backdrop-blur-md hover:bg-white text-slate-700 hover:text-purple-700 border border-white/80 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <BarChart3 size={13} className="text-slate-500" />
                <span>Spending Insights</span>
              </button>
            </div>

            {/* Floating Bottom Input Capsule (matching Reference image middle screen) */}
            <div className="relative w-full flex items-center bg-white/95 backdrop-blur-lg rounded-full px-2 py-1.5 border border-white shadow-[0_12px_32px_-4px_rgba(112,144,176,0.14)]">
              {/* Plus (+) Button */}
              <button
                type="button"
                onClick={() => setMode('chat')}
                className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Open shortcuts"
              >
                <Plus size={20} strokeWidth={2.4} />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Write here.."
                className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none"
              />

              {/* Purple Circular Send Button */}
              <button
                type="button"
                onClick={handleSend}
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[#6D28D9] text-white flex items-center justify-center shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
                aria-label="Send message"
              >
                <Send size={16} strokeWidth={2.4} className="translate-x-0.5" />
              </button>
            </div>
          </div>
        </motion.main>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════ */
        /* ── MODE 2: CONVERSATIONAL COMMAND / CHAT (Right Reference Screen) ──── */
        /* ═══════════════════════════════════════════════════════════════════════ */
        <motion.main
          key="chat-mode"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="relative z-10 flex-1 flex flex-col justify-between max-w-md mx-auto w-full px-4 pt-1 pb-3 overflow-hidden h-full"
        >
          {/* Chat Stream */}
          <div className="flex-1 overflow-y-auto space-y-4 pt-2 pb-6 scrollbar-none pr-1">
            {/* "Today" Separator Pill */}
            <div className="flex justify-center my-1">
              <span className="text-[11px] font-semibold text-slate-500 bg-white/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/60 shadow-2xs">
                Today
              </span>
            </div>

            {/* Messages List */}
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`flex items-start gap-2.5 max-w-[88%] sm:max-w-[82%] ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {/* Mini Orb Avatar for Assistant */}
                    {!isUser && (
                      <div className="shrink-0 mt-1">
                        <AIOrb size="sm" showStatusGlow={false} />
                      </div>
                    )}

                    {/* Bubble Content */}
                    <div className="flex flex-col space-y-2">
                      <div
                        className={`px-4 py-3 text-sm font-medium leading-relaxed ${
                          isUser
                            ? 'bg-[#EFEBFE] text-slate-900 rounded-2xl rounded-tr-xs shadow-2xs'
                            : 'bg-white text-slate-800 rounded-2xl rounded-tl-xs border border-slate-100/90 shadow-2xs'
                        }`}
                      >
                        {msg.isTyping ? (
                          <div className="flex items-center gap-1 py-1 px-1">
                            {[0, 1, 2].map((dot) => (
                              <motion.span
                                key={dot}
                                className="w-1.5 h-1.5 rounded-full bg-purple-400"
                                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                                transition={{
                                  repeat: Infinity,
                                  duration: 0.8,
                                  delay: dot * 0.2,
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      {/* Rich Inline Card: Pending Breakdown Bar Chart */}
                      {msg.showBreakdownCard && (
                        <div className="mt-1">
                          <PendingBreakdownCard />
                        </div>
                      )}

                      {/* Inline Transactions (if returned by NLQ) */}
                      {msg.transactions && msg.transactions.length > 0 && (
                        <div className="space-y-1.5 mt-1">
                          {msg.transactions.slice(0, 3).map((tx, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-100 text-xs shadow-2xs"
                            >
                              <span className="font-semibold text-slate-800 truncate">
                                {tx.description || tx.category}
                              </span>
                              <span
                                className={`font-bold ${
                                  tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                              >
                                {tx.type === 'expense' ? '−' : '+'}
                                {currency} {tx.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp Label */}
                  {msg.timeLabel && (
                    <span
                      className={`text-[10px] font-semibold text-slate-400 mt-1 px-1 ${
                        isUser ? 'mr-1' : 'ml-11'
                      }`}
                    >
                      {msg.timeLabel}
                    </span>
                  )}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Bottom Input Dock (matching Reference right screen) */}
          <div className="w-full pb-1 pt-2 shrink-0">
            <div className="relative w-full flex items-center bg-white/95 backdrop-blur-lg rounded-full px-2 py-1.5 border border-slate-100 shadow-[0_12px_32px_-4px_rgba(112,144,176,0.14)]">
              {/* Shortcut (+) Button */}
              <button
                type="button"
                onClick={() =>
                  handleTopicChipClick('What are my total expenses this month by category?')
                }
                className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Quick insights"
              >
                <Plus size={18} strokeWidth={2.4} />
              </button>

              {/* Receipt / Camera Icon */}
              <button
                type="button"
                onClick={() => setCurrentPage('receipt-scanner')}
                className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Receipt scanner"
              >
                <ImageIcon size={18} strokeWidth={2.2} />
              </button>

              {/* Mic Icon (Tap to switch to voice or speak) */}
              <button
                type="button"
                onClick={() => {
                  setMode('voice');
                  void startListening();
                }}
                className={`w-9 h-9 rounded-full hover:bg-purple-50 text-slate-600 hover:text-purple-700 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                  isListening ? 'text-purple-600 bg-purple-50' : ''
                }`}
                aria-label="Switch to Voice AI"
              >
                <Mic size={18} strokeWidth={2.2} />
              </button>

              {/* Input Field */}
              <input
                ref={chatInputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask me anything..."
                className="flex-1 bg-transparent px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none"
              />

              {/* Purple Circular Send Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
                aria-label="Send message"
              >
                <Send size={16} strokeWidth={2.4} className="translate-x-0.5" />
              </button>
            </div>
          </div>
        </motion.main>
      )}
    </div>
  );
};

export default AIAssistantPage;
