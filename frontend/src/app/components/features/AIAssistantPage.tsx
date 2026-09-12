import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  MoreHorizontal,
  Plus,
  Send,
  Mic,
  Receipt,
  Image as ImageIcon,
  MessageSquare,
  Volume2,
  Trash2,
  Eraser,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { AIOrb } from './ai/AIOrb';
import { PendingBreakdownCard } from './ai/PendingBreakdownCard';
import { NLQService, QueryResult } from '@/services/nlqService';
import { KaiScreen } from './kai/KaiScreen';
import { getKaiSession } from '@/services/kai/kaiSession';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | Date;
  timeLabel?: string;
  showBreakdownCard?: boolean;
  transactions?: QueryResult['transactions'];
  source?: 'backend' | 'local';
  isTyping?: boolean;
}

interface AIAssistantPageProps {
  defaultMode?: 'voice' | 'chat';
}

const STORAGE_KEY = 'KANAKU_kai_chat_history';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(d: Date | string): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const getInitialWelcomeMessage = (): Message => ({
  id: 'kai-welcome',
  role: 'assistant',
  content: "Hello! I'm KAI, your financial assistant. How can I help you today?",
  timestamp: new Date().toISOString(),
  timeLabel: formatTime(new Date()),
});

const loadStoredMessages = (): Message[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[KAI Chat] Could not load stored chat history:', e);
  }
  return [getInitialWelcomeMessage()];
};

/**
 * Kai — the voice-first assistant (KaiScreen) with the text chat kept as a
 * secondary mode behind the header switch. Spoken input never navigates into
 * the chat; the whole voice workflow stays on the Kai screen.
 */
export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  defaultMode = 'voice',
}) => {
  const { setCurrentPage, currency } = useApp();

  const [mode, setMode] = useState<'voice' | 'chat'>(defaultMode);
  const [messages, setMessages] = useState<Message[]>(loadStoredMessages);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOptionsSheet, setShowOptionsSheet] = useState(false);

  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (e) {
      console.warn('[KAI Chat] Failed to save chat history:', e);
    }
  }, [messages]);

  useEffect(() => {
    if (mode === 'chat' && chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, mode, isLoading]);

  // ─── Chat (text) mode ────────────────────────────────────────────────────────

  const executeQuery = async (queryText: string) => {
    const text = queryText.trim();
    if (!text || isLoading) return;

    setInputText('');

    const now = new Date();
    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      timestamp: now.toISOString(),
      timeLabel: formatTime(now),
    };
    setMessages((prev) => [...prev, userMsg]);

    const typingId = uid();
    setMessages((prev) => [
      ...prev,
      {
        id: typingId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isTyping: true,
      },
    ]);

    setIsLoading(true);

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
                    : 'I have analyzed your request.'),
                showBreakdownCard: isBreakdownQuery,
                transactions: result.transactions,
                source: result.source,
                isTyping: false,
                timestamp: new Date().toISOString(),
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
                  : 'I analyzed your recent financial activity.',
                showBreakdownCard: isBreakdownQuery,
                isTyping: false,
                source: 'local',
                timestamp: new Date().toISOString(),
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
    void executeQuery(inputText);
  };

  const handleTopicChipClick = (promptText: string) => {
    void executeQuery(promptText);
  };

  const handleClearHistory = () => {
    const welcome = [getInitialWelcomeMessage()];
    setMessages(welcome);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(welcome));
    } catch (e) {
      console.warn('[KAI Chat] Failed to clear storage:', e);
    }
    setShowOptionsSheet(false);
    toast.success('Chat history cleared');
  };

  const handleClearKaiSession = () => {
    getKaiSession().clear();
    setShowOptionsSheet(false);
    toast.success("Kai's session cleared");
  };

  return (
    <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-gradient-to-b from-[#E7E2F8] via-[#F2EEF9] to-[#F8F6FD] text-slate-900 select-none">
      {/* ── Soft Ambient Glow Background ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[8%] left-1/2 -translate-x-1/2 w-[340px] sm:w-[460px] h-[340px] sm:h-[460px] rounded-full bg-gradient-to-b from-purple-300/35 via-pink-200/25 to-transparent blur-3xl" />
        <div className="absolute bottom-[18%] left-1/4 w-[280px] h-[280px] rounded-full bg-gradient-to-tr from-cyan-200/20 via-indigo-100/25 to-transparent blur-3xl" />
      </div>

      {/* ── Top Header Navigation ── */}
      <header className="relative z-20 w-full max-w-md mx-auto px-3 sm:px-4 pt-2.5 pb-1.5 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => {
            if (mode === 'chat') {
              setMode('voice');
            } else {
              setCurrentPage('dashboard');
            }
          }}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/80 backdrop-blur-md shadow-xs border border-white/60 hover:bg-white text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
          aria-label={mode === 'chat' ? 'Back to Kai' : 'Back to Dashboard'}
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>

        {mode === 'voice' ? (
          <div className="flex flex-col items-center">
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">Kai</h1>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <AIOrb size="sm" showStatusGlow={false} />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white ring-1 ring-emerald-400" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xs sm:text-sm font-black text-slate-900 leading-tight">Kai</h1>
              <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Your Financial Assistant
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
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

          <button
            type="button"
            onClick={() => setShowOptionsSheet(!showOptionsSheet)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/80 backdrop-blur-md shadow-xs border border-white/60 hover:bg-white text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95"
            aria-label="Options"
          >
            <MoreHorizontal size={18} strokeWidth={2.4} />
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
              className="absolute top-14 right-4 z-40 w-52 bg-white/95 backdrop-blur-lg rounded-2xl shadow-xl border border-slate-100 p-2 space-y-1"
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
                onClick={handleClearKaiSession}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors text-left cursor-pointer"
              >
                <Eraser size={15} />
                <span>Clear Kai's actions</span>
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
              >
                <Trash2 size={15} />
                <span>Clear Chat History</span>
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

      {mode === 'voice' ? (
        <KaiScreen />
      ) : (
        <motion.div
          key="chat-mode"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22 }}
          className="relative z-10 flex-1 flex flex-col justify-between max-w-2xl sm:max-w-3xl lg:max-w-4xl mx-auto w-full px-4 sm:px-6 pt-2 overflow-y-auto scrollbar-none"
          ref={chatScrollContainerRef}
        >
          <div className="flex justify-center my-1.5 shrink-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 bg-white/70 backdrop-blur-md px-3 py-0.5 rounded-full border border-white/60 shadow-2xs">
              Today
            </span>
          </div>

          <div className="space-y-3.5 flex-1 pb-2">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`flex items-start gap-2.5 max-w-[90%] sm:max-w-[85%] ${
                      isUser ? 'flex-row-reverse' : 'flex-row'
                    }`}
                  >
                    {!isUser && (
                      <div className="shrink-0 mt-1">
                        <AIOrb size="sm" showStatusGlow={false} />
                      </div>
                    )}

                    <div className="flex flex-col space-y-2">
                      <div
                        className={`px-4 py-2.5 text-xs sm:text-sm font-medium leading-relaxed ${
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

                      {msg.showBreakdownCard && (
                        <div className="mt-1">
                          <PendingBreakdownCard />
                        </div>
                      )}

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

                  {msg.timeLabel && (
                    <span
                      className={`text-[10px] font-semibold text-slate-400 mt-0.5 px-1 ${
                        isUser ? 'mr-1' : 'ml-11'
                      }`}
                    >
                      {msg.timeLabel}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="w-full pt-1 shrink-0 sticky bottom-0 z-20"
            style={{ paddingBottom: 'calc(var(--bottom-nav-height, 50px) + 20px)' }}
          >
            <div className="relative w-full flex items-center bg-white/95 backdrop-blur-lg rounded-full px-2 py-1 border border-slate-100 shadow-[0_12px_32px_-4px_rgba(112,144,176,0.14)]">
              <button
                type="button"
                onClick={() =>
                  handleTopicChipClick('What are my total expenses this month by category?')
                }
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Quick insights"
              >
                <Plus size={16} strokeWidth={2.4} />
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage('receipt-scanner')}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Receipt scanner"
              >
                <ImageIcon size={16} strokeWidth={2.2} />
              </button>

              <button
                type="button"
                onClick={() => setMode('voice')}
                className="w-8 h-8 rounded-full hover:bg-purple-50 text-slate-600 hover:text-purple-700 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                aria-label="Switch to Kai voice"
              >
                <Mic size={16} strokeWidth={2.2} />
              </button>

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
                className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-medium outline-none"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] hover:from-[#7C3AED] hover:to-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md shadow-purple-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
                aria-label="Send message"
              >
                <Send size={14} strokeWidth={2.4} className="translate-x-0.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AIAssistantPage;
