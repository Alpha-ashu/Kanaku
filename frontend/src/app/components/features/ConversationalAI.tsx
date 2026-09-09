/**
 * ConversationalAI — Chat-bubble Q&A interface for the financial AI assistant.
 *
 * Features:
 *  • Sends messages to /api/v1/ai/chat (backend-first, Dexie offline fallback).
 *  • Renders assistant answers with inline transaction mini-cards.
 *  • Voice mic button feeds into same chat pipeline.
 *  • Animated typing indicator, smooth entry animations.
 *  • Parser source badge (gemini / groq / offline).
 *  • Compact layout — fits within the voice-assistant container without overflow.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  Bot,
  User,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { NLQService, QueryResult } from "@/services/nlqService";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  transactions?: QueryResult["transactions"];
  source?: "backend" | "local";
  action?: QueryResult["action"];
  requiresConfirmation?: boolean;
  isTyping?: boolean;
}

interface ConversationalAIProps {
  /** Called when the AI returns an expense action that needs user confirmation */
  onActionDetected?: (action: NonNullable<QueryResult["action"]>) => void;
  /** Optional external conversation ID for multi-turn context */
  conversationId?: string;
  className?: string;
  initialQuery?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const INR_FORMAT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const QUICK_PROMPTS = [
  "How much did I spend this month?",
  "What's my account balance?",
  "Show last 5 transactions",
  "Who owes me money?",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-violet-400"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

function TransactionCard({ tx }: { tx: NonNullable<QueryResult["transactions"]>[number] }) {
  const isExpense = tx.type === "expense";
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white border border-slate-200/80 shadow-xs text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`shrink-0 p-1.5 rounded-full ${isExpense ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
          {isExpense ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
        </span>
        <span className="truncate text-slate-800 font-semibold">{tx.description || tx.category}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className="text-slate-400 font-medium text-[11px]">{tx.date}</span>
        <span className={`font-bold ${isExpense ? "text-rose-600" : "text-emerald-600"}`}>
          {isExpense ? "−" : "+"}₹{INR_FORMAT.format(tx.amount)}
        </span>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source?: "backend" | "local" }) {
  if (!source) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
      source === "backend"
        ? "bg-violet-50 text-violet-700 border-violet-200"
        : "bg-amber-50 text-amber-700 border-amber-200"
    }`}>
      {source === "backend" ? <Wifi size={8} /> : <WifiOff size={8} />}
      {source === "backend" ? "AI Live" : "Offline"}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ConversationalAI: React.FC<ConversationalAIProps> = ({
  onActionDetected,
  conversationId: externalConvId,
  className = "",
  initialQuery,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "assistant",
      content: "Hi! I'm your Kanaku AI assistant. Ask me anything about your finances, or speak an expense to log it.",
      timestamp: new Date(),
      source: "backend",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(externalConvId);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const initialQueryExecutedRef = useRef(false);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const appendMessage = useCallback((msg: Omit<Message, "id" | "timestamp">) => {
    setMessages(prev => [...prev, { ...msg, id: uid(), timestamp: new Date() }]);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setInput("");

    // Add user message
    appendMessage({ role: "user", content: trimmed });

    // Add typing indicator
    const typingId = uid();
    setMessages(prev => [
      ...prev,
      { id: typingId, role: "assistant", content: "", timestamp: new Date(), isTyping: true },
    ]);

    setIsLoading(true);
    try {
      const result = await NLQService.executeQuery(trimmed, conversationId);

      // Store conversation ID from first backend response
      if (!conversationId) {
        // The backend generates a conversationId; we surface it via the action
        // field. For the frontend we can use a local fallback.
        setConversationId(`local-${Date.now()}`);
      }

      // Replace typing indicator with actual response
      setMessages(prev =>
        prev.map(m =>
          m.id === typingId
            ? {
                ...m,
                content: result.answer,
                transactions: result.transactions,
                source: result.source,
                action: result.action,
                requiresConfirmation: result.requiresConfirmation,
                isTyping: false,
              }
            : m,
        ),
      );

      // If the assistant detected a recordable action, bubble it up
      if (result.action && result.requiresConfirmation && onActionDetected) {
        onActionDetected(result.action);
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === typingId
            ? { ...m, content: "Sorry, I couldn't process that. Please try again.", isTyping: false, source: "local" }
            : m,
        ),
      );
      toast.error("AI assistant unavailable");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, conversationId, appendMessage, onActionDetected]);

  // Execute initial query if provided (e.g. from voice speech)
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && !initialQueryExecutedRef.current) {
      initialQueryExecutedRef.current = true;
      void sendMessage(initialQuery.trim());
    }
  }, [initialQuery, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported in this browser.");
      return;
    }

    const recognition: any = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      sendMessage(transcript);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      toast.error("Voice input failed. Please try again.");
    };
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, sendMessage]);

  return (
    <div className={`flex flex-col h-full bg-slate-50/50 ${className}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5 min-h-0 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-xs ${
                msg.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
              }`}>
                {msg.role === "user" ? <User size={13} /> : <Bot size={13} />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-tr-xs font-medium"
                    : "bg-white text-slate-900 border border-slate-200/90 rounded-tl-xs"
                }`}>
                  {msg.isTyping ? (
                    <TypingDots />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  )}
                </div>

                {/* Transaction cards */}
                {!msg.isTyping && msg.transactions && msg.transactions.length > 0 && (
                  <div className="w-full space-y-1.5 mt-1.5">
                    {msg.transactions.slice(0, 5).map(tx => (
                      <TransactionCard key={tx.id} tx={tx} />
                    ))}
                    {msg.transactions.length > 5 && (
                      <p className="text-[11px] text-slate-400 text-center font-medium">
                        +{msg.transactions.length - 5} more transactions
                      </p>
                    )}
                  </div>
                )}

                {/* Meta row */}
                {!msg.isTyping && (
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {msg.timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {msg.role === "assistant" && <SourceBadge source={msg.source} />}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts (shown when only greeting present) */}
      {messages.length === 1 && (
        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="text-[11px] px-3 py-1.5 rounded-full bg-white text-slate-700 border border-slate-200/90 shadow-xs hover:border-violet-300 hover:bg-violet-50/60 hover:text-violet-700 transition-all flex items-center gap-1.5 font-medium active:scale-95"
            >
              <Sparkles size={11} className="text-violet-500" />
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-slate-100 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/90 rounded-2xl px-3.5 py-2.5 shadow-xs focus-within:border-violet-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about finances or record an expense…"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none min-w-0 font-normal"
            disabled={isLoading}
            maxLength={300}
          />

          <button
            onClick={toggleVoice}
            type="button"
            className={`shrink-0 p-2 rounded-xl transition-all ${
              isRecording
                ? "bg-red-500 text-white animate-pulse shadow-sm"
                : "text-slate-400 hover:text-slate-700 hover:bg-slate-200/70"
            }`}
            title={isRecording ? "Stop recording" : "Voice input"}
          >
            {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
          </button>

          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            type="button"
            className="shrink-0 p-2 rounded-xl bg-violet-600 text-white disabled:opacity-30 disabled:hover:bg-violet-600 hover:bg-violet-700 shadow-sm transition-all"
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConversationalAI;
