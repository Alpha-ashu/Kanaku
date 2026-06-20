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

// ─── Waveform bars using Web Audio API ────────────────────────────────────────

const Waveform = memo(({ active }: { active: boolean }) => {
  const BAR_COUNT = 28;
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(4));
  const animRef = useRef<number | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active) {
      setBars(Array(BAR_COUNT).fill(4));
      cancelAnimationFrame(animRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
      return;
    }

    let ctx: AudioContext;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BAR_COUNT);
        setBars(Array.from({ length: BAR_COUNT }, (_, i) => {
          const v = data[i * step] ?? 0;
          return Math.max(4, Math.min(52, (v / 255) * 52));
        }));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {
      // mic access denied — just animate randomly
      const tick = () => {
        setBars(prev => prev.map(() => active ? 4 + Math.random() * 28 : 4));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    });

    return () => {
      cancelAnimationFrame(animRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
      ctx?.close();
    };
  }, [active]);

  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          animate={{ height: h }}
          transition={{ duration: 0.05, ease: 'easeOut' }}
          className={`w-[3px] rounded-full ${active
            ? 'bg-gradient-to-t from-violet-600 to-fuchsia-400'
            : 'bg-slate-200'}`}
          style={{ minHeight: 4 }}
        />
      ))}
    </div>
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
  const recRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const processTranscript = useCallback(async (text: string) => {
    dispatch({ type: 'START_PROCESSING' });
    try {
      const res = await processVoiceTranscript(text);
      if (res.actions?.length > 0) {
        dispatch({ type: 'SET_ACTIONS', payload: res.actions });
        dispatch({ type: 'SHOW_COMMAND_CENTER', payload: true });
      } else {
        dispatch({
          type: 'SET_ERROR',
          payload: { msg: 'No financial action detected. Try: "Paid 500 for lunch"' },
        });
      }
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', payload: { msg: err.message || 'Processing failed.' } });
    } finally {
      dispatch({ type: 'STOP_PROCESSING' });
    }
  }, []);

  const startListening = useCallback(async () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      dispatch({
        type: 'SET_ERROR',
        payload: { msg: 'Speech recognition not supported in this browser. Please type below.', reason: 'not-supported' },
      });
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      dispatch({ type: 'SET_ERROR', payload: { msg: 'Microphone access denied.', reason: 'denied' } });
      return;
    }

    dispatch({ type: 'START_LISTENING' });
    transcriptRef.current = '';

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US'; // Use en-US for better offline support in Chrome
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      if (interim) dispatch({ type: 'SET_INTERIM', payload: interim });
      if (final) {
        const next = (transcriptRef.current + ' ' + final).trim().replace(/\s+/g, ' ');
        transcriptRef.current = next;
        dispatch({ type: 'SET_TRANSCRIPT', payload: next });
        dispatch({ type: 'SET_INTERIM', payload: '' });
      }
    };

    rec.onerror = (e: any) => {
      console.warn('[ASR] error:', e.error);
      if (e.error === 'not-allowed') {
        dispatch({ type: 'SET_ERROR', payload: { msg: 'Microphone access denied.', reason: 'denied' } });
      } else if (e.error === 'network') {
        dispatch({
          type: 'SET_ERROR',
          payload: {
            msg: 'Offline mode unavailable. Please use the keyboard icon to type your transaction.',
            reason: 'network',
          },
        });
        // We do NOT auto-open manual input here anymore to prevent annoying popups
      } else if (e.error !== 'no-speech') {
        dispatch({ type: 'SET_ERROR', payload: { msg: `Speech error: ${e.error}` } });
      }
    };

    rec.onend = () => {
      const val = transcriptRef.current.trim();
      if (val) processTranscript(val);
      else dispatch({ type: 'STOP_PROCESSING' });
    };

    recRef.current = rec;
    rec.start();
  }, [processTranscript]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    dispatch({ type: 'STOP_LISTENING' });
    setTimeout(() => {
      const val = transcriptRef.current.trim();
      if (val) processTranscript(val);
    }, 300);
  }, [processTranscript]);

  const processManualInput = useCallback(() => {
    const text = state.manualInput.trim();
    if (!text) return;
    dispatch({ type: 'SET_TRANSCRIPT', payload: text });
    dispatch({ type: 'TOGGLE_MANUAL', payload: false });
    dispatch({ type: 'CLEAR_ERROR' });
    processTranscript(text);
  }, [state.manualInput, processTranscript]);

  return { state, dispatch, startListening, stopListening, processManualInput };
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
  const { state, dispatch, startListening, stopListening, processManualInput } = useVoiceEngine();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isListening  = state.mode === 'listening';
  const isProcessing = state.mode === 'processing';

  // Auto-focus manual input when opened
  useEffect(() => {
    if (state.showManualInput) setTimeout(() => inputRef.current?.focus(), 100);
  }, [state.showManualInput]);

  const handleHintClick = (text: string) => {
    dispatch({ type: 'SET_MANUAL_INPUT', payload: text });
    dispatch({ type: 'TOGGLE_MANUAL', payload: true });
  };

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] flex flex-col pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] lg:pb-6 overflow-hidden">

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

        {/* Waveform */}
        <div className="w-full max-w-sm">
          <Waveform active={isListening} />
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

      {/* ── Manual input sheet ─────────────────────────────── */}
      <AnimatePresence>
        {state.showManualInput && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-24 left-4 right-4 md:left-0 md:right-0 md:w-full md:max-w-lg mx-auto z-50 bg-white rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-slate-100/80"
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
        )}
      </AnimatePresence>

      {/* ── Command center overlay ─────────────────────────── */}
      <AnimatePresence>
        {state.showCommandCenter && (
          <VoiceAICommandCenter
            transcript={state.transcript || state.manualInput}
            actions={state.actions}
            userId={user?.id}
            onClose={() => dispatch({ type: 'SHOW_COMMAND_CENTER', payload: false })}
            onAddMore={() => {
              dispatch({ type: 'SHOW_COMMAND_CENTER', payload: false });
              dispatch({ type: 'SET_TRANSCRIPT', payload: '' });
              startListening();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default VoiceInput;
