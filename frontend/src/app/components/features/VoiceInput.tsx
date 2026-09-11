import React, {
  useReducer, useRef, useEffect, useCallback, memo, useState,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, MicOff, Loader2, X, Keyboard, ArrowRight,
  AlertCircle, Wifi, WifiOff, RefreshCw, Sparkles,
  TrendingDown, TrendingUp, Repeat, Target, Briefcase,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { processVoiceTranscript, FinancialAction } from '@/services/voiceFinancialService';
import { VoiceAICommandCenter } from './VoiceAICommandCenter';
import { Capacitor } from '@capacitor/core';
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  type SpeechSession,
} from '@/services/speechRecognitionAdapter';

// ─── Types ────────────────────────────────────────────────────────────────────

type VoiceMode = 'idle' | 'listening' | 'processing' | 'error';
type FallbackReason = null | 'network' | 'not-supported' | 'denied';

interface VoiceState {
  mode: VoiceMode;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  fallbackReason: FallbackReason;
  actions: FinancialAction[];
  parser?: string;
  showManualInput: boolean;
  manualInput: string;
  showCommandCenter: boolean;
  retryCount: number;
}

type VA =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'SET_INTERIM'; payload: string }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'START_PROCESSING' }
  | { type: 'STOP_PROCESSING' }
  | { type: 'SET_ERROR'; payload: { msg: string; reason?: FallbackReason } }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_ACTIONS'; payload: FinancialAction[] }
  | { type: 'SET_PARSER'; payload?: string }
  | { type: 'TOGGLE_MANUAL'; payload?: boolean }
  | { type: 'SET_MANUAL_INPUT'; payload: string }
  | { type: 'SHOW_COMMAND_CENTER'; payload: boolean }
  | { type: 'INCREMENT_RETRY' }
  | { type: 'RESET' };

const init: VoiceState = {
  mode: 'idle', transcript: '', interimTranscript: '',
  error: null, fallbackReason: null, actions: [],
  showManualInput: false, manualInput: '', showCommandCenter: false, retryCount: 0,
};

function reducer(s: VoiceState, a: VA): VoiceState {
  switch (a.type) {
    case 'START_LISTENING':
      return { ...s, mode: 'listening', transcript: '', interimTranscript: '', error: null };
    case 'STOP_LISTENING':
      return { ...s, mode: 'idle' };
    case 'SET_INTERIM':
      return { ...s, interimTranscript: a.payload };
    case 'SET_TRANSCRIPT':
      return { ...s, transcript: a.payload };
    case 'START_PROCESSING':
      return { ...s, mode: 'processing' };
    case 'STOP_PROCESSING':
      return { ...s, mode: 'idle' };
    case 'SET_ERROR':
      return { ...s, mode: 'error', error: a.payload.msg, fallbackReason: a.payload.reason ?? null };
    case 'CLEAR_ERROR':
      return { ...s, error: null, fallbackReason: null, mode: 'idle' };
    case 'SET_ACTIONS':
      return { ...s, actions: a.payload };
    case 'SET_PARSER':
      return { ...s, parser: a.payload };
    case 'TOGGLE_MANUAL':
      return { ...s, showManualInput: a.payload !== undefined ? a.payload : !s.showManualInput };
    case 'SET_MANUAL_INPUT':
      return { ...s, manualInput: a.payload };
    case 'SHOW_COMMAND_CENTER':
      return { ...s, showCommandCenter: a.payload };
    case 'INCREMENT_RETRY':
      return { ...s, retryCount: s.retryCount + 1 };
    case 'RESET':
      return init;
    default: return s;
  }
}

// ─── Waveform bars using canvas (no React state — avoids 60fps React re-renders) ─────────────────────
// The previous implementation called setBars() on every rAF tick (60fps), causing
// React to re-render VoiceInput's entire subtree at 60fps → layout recalculations
// → scroll position jitter. Canvas draws directly to the DOM with zero React involvement.

const Waveform = memo(({ active }: { active: boolean }) => {
  const BAR_COUNT = 28;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(active);

  // Keep ref in sync without re-mounting the effect
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    // Draw bars directly onto canvas — zero React state, zero re-renders
    const drawBars = (heights: number[]) => {
      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      const barW = 3;
      const gap = 3;
      const total = barW + gap;
      const startX = Math.max(0, (W - heights.length * total) / 2);

      heights.forEach((h, i) => {
        const x = startX + i * total;
        const y = (H - h) / 2;
        if (activeRef.current) {
          const grad = ctx2d.createLinearGradient(x, y + h, x, y);
          grad.addColorStop(0, '#7c3aed'); // violet-600
          grad.addColorStop(1, '#e879f9'); // fuchsia-400
          ctx2d.fillStyle = grad;
        } else {
          ctx2d.fillStyle = '#e2e8f0'; // slate-200
        }
        const r = Math.min(1.5, h / 2);
        ctx2d.beginPath();
        if (ctx2d.roundRect) {
          ctx2d.roundRect(x, y, barW, h, r);
        } else {
          ctx2d.rect(x, y, barW, h);
        }
        ctx2d.fill();
      });
    };

    // Idle state: draw flat bars and stop
    if (!active) {
      drawBars(Array(BAR_COUNT).fill(4));
      if (animRef.current) cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      return;
    }

    // Random animation fallback (native platform or mic unavailable)
    const startRandomAnimation = () => {
      const tick = () => {
        if (!activeRef.current) {
          drawBars(Array(BAR_COUNT).fill(4));
          return;
        }
        drawBars(Array.from({ length: BAR_COUNT }, () => 8 + Math.random() * 38));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    };

    // On native (Android/iOS), skip getUserMedia to avoid locking the mic
    if (Capacitor.isNativePlatform()) {
      startRandomAnimation();
      return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }

    let audioCtx: AudioContext | undefined;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        streamRef.current = stream;
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!activeRef.current) { drawBars(Array(BAR_COUNT).fill(4)); return; }
          analyser.getByteFrequencyData(data);
          const step = Math.floor(data.length / BAR_COUNT);
          const heights = Array.from({ length: BAR_COUNT }, (_, i) => {
            const v = data[i * step] ?? 0;
            return Math.max(4, Math.min(52, (v / 255) * 52));
          });
          drawBars(heights);
          animRef.current = requestAnimationFrame(tick);
        };
        tick();
      }).catch(startRandomAnimation);
    } else {
      startRandomAnimation();
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtx?.close().catch(() => undefined);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={BAR_COUNT * 6}
      height={64}
      className="block mx-auto"
      aria-hidden="true"
    />
  );
});
Waveform.displayName = 'Waveform';

// ─── Hint chips ───────────────────────────────────────────────────────────────

const HINTS = [
  { icon: <TrendingDown size={12} />, text: 'Paid ₹500 for food', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  { icon: <TrendingUp size={12} />, text: 'Got salary ₹50k', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  { icon: <Repeat size={12} />, text: 'Sent ₹2000 to Savings', color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
  { icon: <Target size={12} />, text: 'Saved ₹5000 for trip', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  { icon: <Briefcase size={12} />, text: 'Invested ₹10k in SIP', color: 'bg-teal-50 text-teal-600 border-teal-100' },
  { icon: <TrendingDown size={12} />, text: 'Lent ₹3000 to Rahul', color: 'bg-amber-50 text-amber-600 border-amber-100' },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useVoiceEngine() {
  const [state, dispatch] = useReducer(reducer, init);
  const recRef = useRef<SpeechSession | null>(null);
  const transcriptRef = useRef('');
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against processing the same utterance twice.
  const processedRef = useRef(false);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      if (recRef.current) {
        void recRef.current.stop().catch(() => undefined);
        recRef.current = null;
      }
    };
  }, []);

  const processTranscript = useCallback(async (text: string) => {
    if (processedRef.current) return;
    processedRef.current = true;

    dispatch({ type: 'START_PROCESSING' });
    try {
      const res = await processVoiceTranscript(text);
      if (res.actions?.length > 0) {
        dispatch({ type: 'SET_ACTIONS', payload: res.actions });
        dispatch({ type: 'SET_PARSER', payload: res.parser });
        dispatch({ type: 'SHOW_COMMAND_CENTER', payload: true });
      } else {
        const isQuery = /^(how|what|show|who|list|tell|did i|can you|is there|my balance|summary)/i.test(text.trim()) ||
          /\b(balance|spent|spending|owe|owes|dues|expenses|transactions|total)\b/i.test(text);

        if (isQuery) {
          const queryAction: FinancialAction = {
            type: 'query',
            rawSegment: text,
            confidence: 0.9,
            requiresReview: false,
            entities: {},
          };
          dispatch({ type: 'SET_ACTIONS', payload: [queryAction] });
          dispatch({ type: 'SET_PARSER', payload: res.parser || 'gemini' });
          dispatch({ type: 'SHOW_COMMAND_CENTER', payload: true });
        } else {
          dispatch({
            type: 'SET_ERROR',
            payload: { msg: 'No financial action detected. Try: "Paid 500 for lunch" or "How much did I spend this month?"' },
          });
        }
      }
    } catch (err: any) {
      console.error('[VoiceInput] Failed to process voice transcript:', err);
      dispatch({
        type: 'SET_ERROR',
        payload: { msg: 'Voice Assistant is temporarily unavailable. Please try again or type below.' },
      });
    } finally {
      dispatch({ type: 'STOP_PROCESSING' });
    }
  }, []);

  const resetEngine = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (recRef.current) {
      void recRef.current.stop().catch(() => undefined);
      recRef.current = null;
    }
    processedRef.current = false;
    transcriptRef.current = '';
    dispatch({ type: 'RESET' });
  }, []);

  const startListening = useCallback(async () => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    if (recRef.current) {
      void recRef.current.stop().catch(() => undefined);
      recRef.current = null;
    }

    // Engine selection lives in the adapter: native SpeechRecognizer/SFSpeechRecognizer
    // on device, Web Speech API in the browser.
    if (!(await isSpeechRecognitionSupported())) {
      dispatch({
        type: 'SET_ERROR',
        payload: { msg: 'Speech recognition is not available on this device. Please type below.', reason: 'not-supported' },
      });
      return;
    }

    // On web the browser prompts here (and this also feeds the waveform). On native
    // the adapter asks through the plugin.
    if (!Capacitor.isNativePlatform()) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        dispatch({ type: 'SET_ERROR', payload: { msg: 'Microphone access denied.', reason: 'denied' } });
        return;
      }
    }

    dispatch({ type: 'START_LISTENING' });
    transcriptRef.current = '';
    // New utterance — re-arm the once-only guard.
    processedRef.current = false;

    try {
      const session = await startSpeechRecognition({
        onPartial: (text) => dispatch({ type: 'SET_INTERIM', payload: text }),
        onFinal: (text) => {
          const next = `${transcriptRef.current} ${text}`.trim().replace(/\s+/g, ' ');
          transcriptRef.current = next;
          dispatch({ type: 'SET_TRANSCRIPT', payload: next });
          dispatch({ type: 'SET_INTERIM', payload: '' });
        },
        onEnd: () => {
          const val = transcriptRef.current.trim();
          if (val) processTranscript(val);
          else dispatch({ type: 'STOP_PROCESSING' });
        },
        onError: (reason, msg) => {
          console.warn('[ASR] error:', reason, msg);
          if (reason === 'no-speech') return;
          const fallback: FallbackReason =
            reason === 'network' || reason === 'denied' || reason === 'not-supported' ? reason : null;
          dispatch({ type: 'SET_ERROR', payload: { msg, reason: fallback } });
        },
      });

      recRef.current = session;
    } catch (err: any) {
      console.error('[VoiceInput] Failed to start voice session:', err);
      dispatch({
        type: 'SET_ERROR',
        payload: { msg: 'Voice Assistant is temporarily unavailable. Please try again.' },
      });
    }
  }, [processTranscript]);

  const stopListening = useCallback(() => {
    const session = recRef.current;
    recRef.current = null;
    void session?.stop();
    dispatch({ type: 'STOP_LISTENING' });

    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    stopTimeoutRef.current = setTimeout(() => {
      const val = transcriptRef.current.trim();
      if (val) processTranscript(val);
    }, 250);
  }, [processTranscript]);

  const cancelListening = useCallback(() => {
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (recRef.current) {
      void recRef.current.stop().catch(() => undefined);
      recRef.current = null;
    }
    processedRef.current = true;
    transcriptRef.current = '';
    dispatch({ type: 'RESET' });
    setTimeout(() => {
      processedRef.current = false;
    }, 50);
  }, []);

  const processManualInput = useCallback(() => {
    const text = state.manualInput.trim();
    if (!text) return;
    dispatch({ type: 'SET_TRANSCRIPT', payload: text });
    dispatch({ type: 'TOGGLE_MANUAL', payload: false });
    dispatch({ type: 'CLEAR_ERROR' });
    processedRef.current = false;
    processTranscript(text);
  }, [state.manualInput, processTranscript]);

  return { state, dispatch, startListening, stopListening, cancelListening, resetEngine, processManualInput };
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const StatusPill = memo(({ mode, fallback }: { mode: VoiceMode; fallback: FallbackReason }) => {
  const map: Record<string, { label: string; cls: string }> = {
    idle:       { label: 'Ready', cls: 'bg-slate-100 text-slate-500' },
    listening:  { label: '● Listening…', cls: 'bg-violet-100 text-violet-600 animate-pulse' },
    processing: { label: '⟳ Analyzing…', cls: 'bg-indigo-100 text-indigo-600' },
    error:      { label: fallback === 'network' ? '✕ Offline' : '✕ Error', cls: 'bg-rose-100 text-rose-600' },
  };
  const { label, cls } = map[mode] ?? map.idle;
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full ${cls}`}>{label}</span>
  );
});
StatusPill.displayName = 'StatusPill';

// ─── Main component ───────────────────────────────────────────────────────────

export function VoiceInput() {
  const { user } = useAuth();
  const { state, dispatch, startListening, stopListening, cancelListening, resetEngine, processManualInput } = useVoiceEngine();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isListening  = state.mode === 'listening';
  const isProcessing = state.mode === 'processing';

  // Auto-focus manual input when opened — also scrolls the input into view so
  // it's always visible above the software keyboard on mobile
  useEffect(() => {
    if (state.showManualInput) {
      setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          // Hint to the browser to scroll the element into the visible viewport
          // (important on iOS where the keyboard can otherwise hide the focused input)
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 120);
    }
  }, [state.showManualInput]);


  const handleHintClick = (text: string) => {
    dispatch({ type: 'SET_MANUAL_INPUT', payload: text });
    dispatch({ type: 'TOGGLE_MANUAL', payload: true });
  };

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        // Original: calc(100dvh - 4rem) accounts for the top header height.
        // Subtract --keyboard-height so the container shrinks when the keyboard
        // opens (set by Capacitor listeners on native, VisualViewport on web).
        height: 'calc(100dvh - 4rem - var(--keyboard-height, 0px))',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)',
      }}
    >

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-md shadow-violet-200">
              <Sparkles size={14} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Voice AI</h1>
          </div>
          <p className="text-slate-400 text-sm pl-9">Financial Assistant · Multi-intent</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill mode={state.mode} fallback={state.fallbackReason} />
          <button data-testid="voice-input-button"
            onClick={() => dispatch({ type: 'TOGGLE_MANUAL' })}
            className="w-10 h-10 rounded-xl bg-white shadow border flex items-center justify-center hover:bg-violet-50 transition-colors"
          >
            <Keyboard size={18} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* ── Center stage ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">

        {/* Orb button */}
        <div className="relative flex items-center justify-center">
          {/* Glow rings */}
          {isListening && (
            <>
              {[1, 2, 3].map(n => (
                <motion.div
                  key={n}
                  className="absolute rounded-full border border-violet-400/30"
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: 0, scale: 1 + n * 0.35 }}
                  transition={{ duration: 2, repeat: Infinity, delay: n * 0.4, ease: 'easeOut' }}
                  style={{ width: 112, height: 112 }}
                />
              ))}
            </>
          )}

          {/* Gradient blob */}
          <motion.div
            animate={{
              scale: isListening ? [1, 1.08, 1] : isProcessing ? [1, 1.15, 1] : 1,
              rotate: isListening ? 360 : 0,
            }}
            transition={{ duration: isListening ? 5 : 2, repeat: Infinity, ease: 'linear' }}
            className={`absolute w-32 h-32 rounded-full blur-2xl opacity-60 ${
              isListening ? 'bg-gradient-to-br from-violet-500 via-fuchsia-400 to-cyan-400'
              : isProcessing ? 'bg-gradient-to-br from-indigo-400 to-violet-500'
              : 'bg-gradient-to-br from-slate-300 to-slate-200'}`}
          />

          {/* Button */}
          <motion.button data-testid="voice-input-button-2"
            whileTap={{ scale: 0.93 }}
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
            className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${
              isListening
                ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white'
                : isProcessing
                  ? 'bg-slate-900 text-white cursor-not-allowed'
                  : 'bg-white text-slate-800 hover:shadow-violet-200 border border-slate-100'
            }`}
          >
            {isProcessing ? (
              <Loader2 size={36} className="animate-spin" />
            ) : isListening ? (
              <MicOff size={36} />
            ) : (
              <Mic size={36} />
            )}
          </motion.button>
        </div>

        {/* Waveform & Cancel action */}
        <div className="w-full max-w-sm flex flex-col items-center gap-3">
          <Waveform active={isListening} />
          {(isListening || isProcessing) && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={cancelListening}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all shadow-sm active:scale-95"
            >
              <X size={14} /> Cancel Listening
            </motion.button>
          )}
        </div>

        {/* Transcript display */}
        <AnimatePresence mode="wait">
          {(state.transcript || state.interimTranscript) ? (
            <motion.div
              key="transcript"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="w-full max-w-lg bg-white/80 backdrop-blur-md rounded-3xl border border-slate-100 shadow-lg px-6 py-4 text-center"
            >
              {state.transcript && (
                <p className="text-slate-900 font-bold text-lg leading-snug">{state.transcript}</p>
              )}
              {state.interimTranscript && (
                <p className="text-slate-400 text-base mt-1 italic">{state.interimTranscript}</p>
              )}
            </motion.div>
          ) : !isListening && !isProcessing && state.mode !== 'error' ? (
            <motion.div
              key="hints"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg space-y-3"
            >
              <p className="text-center text-slate-400 text-sm font-medium">Tap mic and say…</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {HINTS.map((h, i) => (
                  <button data-testid={`voice-input-button-3-${i}`}
                    key={i}
                    onClick={() => handleHintClick(h.text)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${h.color} hover:scale-105 transition-transform`}
                  >
                    {h.icon}{h.text}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {state.error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full max-w-md"
            >
              <div className={`rounded-3xl border p-4 ${
                state.fallbackReason === 'network'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-rose-50 border-rose-200'
              }`}>
                <div className="flex items-start gap-3">
                  {state.fallbackReason === 'network'
                    ? <WifiOff size={18} className="text-amber-500 mt-0.5 shrink-0" />
                    : <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${state.fallbackReason === 'network' ? 'text-amber-900' : 'text-rose-900'}`}>
                      {state.fallbackReason === 'network' ? 'No Network for ASR' : 'Voice Error'}
                    </p>
                    <p className={`text-xs mt-0.5 ${state.fallbackReason === 'network' ? 'text-amber-700' : 'text-rose-700'}`}>
                      {state.error}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {state.fallbackReason === 'network' && (
                      <button data-testid="voice-input-retry"
                        onClick={() => { dispatch({ type: 'CLEAR_ERROR' }); startListening(); }}
                        className="text-amber-600 hover:text-amber-800 transition-colors"
                        title="Retry"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}
                    <button data-testid="voice-input-button-4" onClick={() => dispatch({ type: 'CLEAR_ERROR' })} className="text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer mic label ───────────────────────────────── */}
      <div className="shrink-0 pb-2 text-center">
        <p className="text-xs text-slate-400">
          {isListening ? 'Tap to stop · speaks Hinglish + English' : 'Tap mic to start · or use keyboard ⌨'}
        </p>
      </div>

      {/* ── Manual input sheet — keyboard-aware with backdrop ──────────────── */}
      <AnimatePresence>
        {state.showManualInput && (
          <>
            {/* Dimmed backdrop — tap anywhere outside the sheet to close */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
              onClick={() => dispatch({ type: 'TOGGLE_MANUAL', payload: false })}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              // Fixed position above the bottom nav bar (~5rem) + safe area + keyboard.
              // --keyboard-height is updated by Capacitor (native) and
              // VisualViewport listener (web) in App.tsx.
              className="fixed left-0 right-0 z-50 mx-4 bg-white rounded-3xl shadow-[0_-4px_40px_rgba(0,0,0,0.12)] border border-slate-100/80"
              style={{
                bottom: 'calc(var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px) + 5.5rem)',
                maxWidth: '32rem',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Type your transaction</p>
                <button data-testid="voice-input-button-5" onClick={() => { dispatch({ type: 'TOGGLE_MANUAL', payload: false }); dispatch({ type: 'CLEAR_ERROR' }); }} className="text-slate-400 hover:bg-slate-100 p-1.5 rounded-full transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea data-testid="voice-input-e-g-paid-2000"
                  ref={inputRef}
                  rows={2}
                  value={state.manualInput}
                  onChange={e => dispatch({ type: 'SET_MANUAL_INPUT', payload: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); processManualInput(); } }}
                  placeholder="e.g. Paid 2000 for room and spent 500 on groceries"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent text-slate-900 text-sm resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 mt-1 pl-1">Multi-action supported · Enter to process · Shift+Enter for new line</p>
              </div>

              {/* Quick-fill chips */}
              <div className="flex flex-wrap gap-1.5">
                {HINTS.slice(0, 3).map((h, i) => (
                  <button data-testid={`voice-input-button-6-${i}`}
                    key={i}
                    onClick={() => dispatch({ type: 'SET_MANUAL_INPUT', payload: h.text })}
                    className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${h.color} hover:scale-105 transition-transform`}
                  >
                    {h.icon}{h.text}
                  </button>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex justify-end pt-1">
                <button data-testid="voice-input-analyze-amp-process"
                  onClick={processManualInput}
                  disabled={!state.manualInput.trim()}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-lg shadow-violet-200/60 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles size={16} /> Analyze &amp; Process
                </button>
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Command center overlay ─────────────────────────── */}
      <AnimatePresence>
        {state.showCommandCenter && (
          <VoiceAICommandCenter
            transcript={state.transcript || state.manualInput}
            actions={state.actions}
            parser={state.parser}
            userId={user?.id}
            initialTab={state.actions.some(a => a.type === 'query') ? 'chat' : 'actions'}
            onClose={() => {
              resetEngine();
            }}
            onAddMore={() => {
              resetEngine();
              setTimeout(() => {
                void startListening();
              }, 120);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default VoiceInput;
