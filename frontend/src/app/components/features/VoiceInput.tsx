import React, { useReducer, useRef, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Loader2, X, Keyboard, ArrowRight, AlertCircle } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/database';
import { parseMultipleTransactions } from '@/lib/voiceExpenseParser';
import { writeVoiceBatchDraft } from '@/lib/voiceDrafts';

// ================================
// TYPES
// ================================

type VoiceMode = 'idle' | 'listening' | 'processing' | 'error';

interface FinancialAction {
  type: 'expense' | 'income' | 'lent' | 'borrowed' | 'transfer' | 'goal' | 'group' | 'investment';
  amount?: number;
  category?: string;
  merchant?: string;
  person?: string;
  rawText: string;
}

interface VoiceState {
  mode: VoiceMode;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  actions: FinancialAction[];
  showManualInput: boolean;
  manualInput: string;
  showCommandCenter: boolean;
}

type VoiceAction =
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'SET_INTERIM'; payload: string }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'START_PROCESSING' }
  | { type: 'STOP_PROCESSING' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_ACTIONS'; payload: FinancialAction[] }
  | { type: 'TOGGLE_MANUAL_INPUT'; payload?: boolean }
  | { type: 'SET_MANUAL_INPUT'; payload: string }
  | { type: 'SHOW_COMMAND_CENTER'; payload: boolean }
  | { type: 'RESET' };

// ================================
// REDUCER
// ================================

const initialState: VoiceState = {
  mode: 'idle',
  transcript: '',
  interimTranscript: '',
  error: null,
  actions: [],
  showManualInput: false,
  manualInput: '',
  showCommandCenter: false,
};

function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case 'START_LISTENING':
      return {
        ...state,
        mode: 'listening',
        transcript: '',
        interimTranscript: '',
        error: null,
      };

    case 'STOP_LISTENING':
      return {
        ...state,
        mode: 'idle',
      };

    case 'SET_INTERIM':
      return {
        ...state,
        interimTranscript: action.payload,
      };

    case 'SET_TRANSCRIPT':
      return {
        ...state,
        transcript: action.payload,
      };

    case 'START_PROCESSING':
      return {
        ...state,
        mode: 'processing',
      };

    case 'STOP_PROCESSING':
      return {
        ...state,
        mode: 'idle',
      };

    case 'SET_ERROR':
      return {
        ...state,
        mode: 'error',
        error: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'SET_ACTIONS':
      return {
        ...state,
        actions: action.payload,
      };

    case 'TOGGLE_MANUAL_INPUT':
      return {
        ...state,
        showManualInput:
          action.payload !== undefined
            ? action.payload
            : !state.showManualInput,
      };

    case 'SET_MANUAL_INPUT':
      return {
        ...state,
        manualInput: action.payload,
      };

    case 'SHOW_COMMAND_CENTER':
      return {
        ...state,
        showCommandCenter: action.payload,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ================================
// LOCAL PARSER
// ================================

function parseFinancialIntent(text: string): FinancialAction[] {
  const parsed = parseMultipleTransactions(text);
  if (parsed.length > 0) {
    return parsed.map(item => ({
      type: item.intent as any,
      amount: item.amount ?? undefined,
      category: item.category ?? undefined,
      rawText: text
    }));
  }

  const lower = text.toLowerCase();
  const amountMatch = lower.match(/(?:₹|rs\.?|inr)?\s?(\d+)/i);
  const amount = amountMatch ? Number(amountMatch[1]) : undefined;

  const expenseKeywords = ['paid', 'spent', 'bought', 'expense'];
  const incomeKeywords = ['received', 'earned', 'got', 'income'];
  const lentKeywords = ['lent', 'lent to'];
  const borrowedKeywords = ['borrowed', 'borrowed from'];

  if (expenseKeywords.some(word => lower.includes(word))) {
    return [
      {
        type: 'expense',
        amount,
        category: 'General',
        rawText: text,
      },
    ];
  }

  if (incomeKeywords.some(word => lower.includes(word))) {
    return [
      {
        type: 'income',
        amount,
        rawText: text,
      },
    ];
  }

  if (lentKeywords.some(word => lower.includes(word))) {
    return [
      {
        type: 'lent',
        amount,
        rawText: text,
      },
    ];
  }

  if (borrowedKeywords.some(word => lower.includes(word))) {
    return [
      {
        type: 'borrowed',
        amount,
        rawText: text,
      },
    ];
  }

  return [];
}

// ================================
// HOOK
// ================================

function useVoiceEngine() {
  const [state, dispatch] = useReducer(voiceReducer, initialState);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');

  const startListening = useCallback(async () => {
    try {
      dispatch({ type: 'START_LISTENING' });
      transcriptRef.current = '';

      // Check if browser SpeechRecognition is available
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Speech recognition is not supported in this browser. Please type your entry.',
        });
        return;
      }

      // Try requesting microphone permissions first to ensure availability
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Microphone permission denied',
        });
        return;
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript + ' ';
          } else {
            interim += result[0].transcript;
          }
        }

        if (interim) {
          dispatch({ type: 'SET_INTERIM', payload: interim });
        }
        if (final) {
          const newTranscript = (transcriptRef.current + ' ' + final).trim().replace(/\s+/g, ' ');
          transcriptRef.current = newTranscript;
          dispatch({ type: 'SET_TRANSCRIPT', payload: newTranscript });
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error event:', event);
        if (event.error === 'not-allowed') {
          dispatch({
            type: 'SET_ERROR',
            payload: 'Microphone permission denied',
          });
        } else if (event.error !== 'no-speech') {
          dispatch({
            type: 'SET_ERROR',
            payload: `Voice capture error: ${event.error}`,
          });
        }
      };

      rec.onend = () => {
        // If recognition stops automatically (e.g., quiet pause), check if we have a transcript
        const finalVal = transcriptRef.current.trim();
        if (finalVal) {
          // Process final transcript
          const actions = parseFinancialIntent(finalVal);
          if (actions.length > 0) {
            dispatch({
              type: 'SET_ACTIONS',
              payload: actions,
            });
            dispatch({
              type: 'SHOW_COMMAND_CENTER',
              payload: true,
            });
          }
        }
        dispatch({ type: 'STOP_PROCESSING' });
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'Microphone permission denied',
      });
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    dispatch({ type: 'START_PROCESSING' });
    recognitionRef.current.stop();
    recognitionRef.current = null;

    dispatch({ type: 'STOP_LISTENING' });

    // Wait a brief moment to let state update with the final segments
    setTimeout(() => {
      const finalVal = transcriptRef.current.trim();
      if (finalVal) {
        const actions = parseFinancialIntent(finalVal);
        if (actions.length > 0) {
          dispatch({
            type: 'SET_ACTIONS',
            payload: actions,
          });
          dispatch({
            type: 'SHOW_COMMAND_CENTER',
            payload: true,
          });
        }
      }
    }, 300);
  }, []);

  const processManualInput = useCallback(() => {
    const text = state.manualInput.trim();

    if (!text) return;

    const actions = parseFinancialIntent(text);

    dispatch({
      type: 'SET_TRANSCRIPT',
      payload: text,
    });

    dispatch({
      type: 'SET_ACTIONS',
      payload: actions,
    });

    dispatch({
      type: 'SHOW_COMMAND_CENTER',
      payload: true,
    });

    dispatch({
      type: 'TOGGLE_MANUAL_INPUT',
      payload: false,
    });
  }, [state.manualInput]);

  return {
    state,
    dispatch,
    startListening,
    stopListening,
    processManualInput,
  };
}

// ================================
// OPTIMIZED VOICE BLOB
// ================================

const VoiceBlob = memo(
  ({ mode }: { mode: VoiceMode }) => {
    const isListening = mode === 'listening';
    const isProcessing = mode === 'processing';

    return (
      <div className="relative flex items-center justify-center w-56 h-56">
        <motion.div
          animate={{
            scale: isListening
              ? [1, 1.1, 1]
              : isProcessing
                ? [1, 1.2, 1]
                : 1,
            rotate: isListening ? 360 : 0,
          }}
          transition={{
            duration: isListening ? 6 : 2,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 blur-2xl opacity-70"
        />

        <motion.div
          animate={{
            scale: isListening ? [1, 1.05, 1] : 1,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
          className="relative w-36 h-36 rounded-full bg-white/80 backdrop-blur-2xl border border-white/40 shadow-2xl flex items-center justify-center"
        >
          {isProcessing ? (
            <Loader2 className="animate-spin text-slate-900" size={42} />
          ) : (
            <Mic className="text-slate-900" size={42} />
          )}
        </motion.div>
      </div>
    );
  }
);

VoiceBlob.displayName = 'VoiceBlob';

// ================================
// TRANSCRIPT PANEL
// ================================

const TranscriptPanel = memo(
  ({ transcript }: { transcript: string }) => {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto text-center"
      >
        {transcript ? (
          <p className="text-2xl font-semibold text-slate-900 leading-relaxed">
            {transcript}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-400 text-xl">
              Start speaking your transaction
            </p>

            <div className="flex flex-wrap gap-3 justify-center">
              <div className="px-4 py-2 rounded-2xl bg-white shadow-sm border">
                Paid ₹400 for Uber
              </div>

              <div className="px-4 py-2 rounded-2xl bg-white shadow-sm border">
                Lent ₹2000 to Rahul
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }
);

TranscriptPanel.displayName = 'TranscriptPanel';

// ================================
// COMMAND CENTER
// ================================

function CommandCenter({
  actions,
  onClose,
  onConfirm,
}: {
  actions: FinancialAction[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center z-[80]"
    >
      <div className="w-full max-w-2xl rounded-t-[2rem] bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            AI Detected
          </h2>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {actions.map((action, index) => (
            <div
              key={index}
              className="p-5 rounded-3xl border bg-slate-50"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm uppercase tracking-wider text-slate-500">
                  {action.type}
                </span>

                <span className="text-2xl font-bold text-slate-900">
                  ₹{action.amount}
                </span>
              </div>

              <p className="text-slate-700">{action.rawText}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl border bg-white font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white font-semibold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
          >
            Confirm & Review
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ================================
// MAIN COMPONENT
// ================================

export function VoiceInput() {
  const { setCurrentPage } = useApp();
  const { user } = useAuth();
  const {
    state,
    dispatch,
    startListening,
    stopListening,
    processManualInput,
  } = useVoiceEngine();

  const isListening = state.mode === 'listening';
  const isProcessing = state.mode === 'processing';

  const handleConfirm = useCallback(() => {
    const textToParse = state.transcript || state.manualInput;

    // Save user voice query transcript into database
    const userLog = {
      userId: user?.id || 'anonymous',
      transcript: textToParse,
      timestamp: new Date().toISOString(),
    };
    db.logs.add({
      id: crypto.randomUUID(),
      level: 'voice_input',
      message: JSON.stringify(userLog),
      timestamp: new Date()
    }).catch(console.error);

    const parsedItems = parseMultipleTransactions(textToParse);
    const itemsToSave = parsedItems.length > 0 ? parsedItems : [
      {
        intent: 'expense' as const,
        amount: state.actions[0]?.amount || 0,
        category: state.actions[0]?.category || null,
        description: textToParse || 'Voice transaction',
        confidence: 0.5,
        date: new Date().toISOString().split('T')[0]
      }
    ];
    writeVoiceBatchDraft(itemsToSave);
    setCurrentPage('voice-review');
  }, [state.transcript, state.manualInput, state.actions, setCurrentPage, user]);

  return (
    <div className="h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col justify-between pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] lg:pb-6">
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Voice AI
          </h1>
          <p className="text-slate-500 mt-1">
            Financial Assistant
          </p>
        </div>

        <button
          onClick={() => dispatch({ type: 'TOGGLE_MANUAL_INPUT' })}
          className="w-12 h-12 rounded-2xl bg-white shadow-lg border flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <Keyboard size={20} />
        </button>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <VoiceBlob mode={state.mode} />

        <div className="mt-12 w-full">
          <TranscriptPanel transcript={[state.transcript, state.interimTranscript].filter(Boolean).join(' ')} />
        </div>

        {/* ERROR */}
        <AnimatePresence>
          {state.error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-8 p-5 rounded-3xl bg-rose-50 border border-rose-200 max-w-md w-full"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="text-rose-500 mt-1" size={20} />

                <div>
                  <h4 className="font-semibold text-rose-900">
                    Voice Error
                  </h4>

                  <p className="text-rose-700 text-sm mt-1">
                    {state.error}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FOOTER CONTROLS */}
      <div className="pb-4 pt-4 flex justify-center">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isProcessing}
          className={`relative w-24 h-24 rounded-full text-white shadow-2xl flex items-center justify-center transition-all duration-300 ${isListening
            ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500 scale-110'
            : 'bg-slate-900 hover:scale-105'
            }`}
        >
          {isProcessing ? (
            <Loader2 className="animate-spin" size={36} />
          ) : (
            <Mic size={36} />
          )}
        </button>
      </div>

      {/* MANUAL INPUT */}
      <AnimatePresence>
        {state.showManualInput && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[2rem] shadow-2xl p-6 z-40"
          >
            <div className="space-y-4 max-w-2xl mx-auto">
              <input
                autoFocus
                value={state.manualInput}
                onChange={e =>
                  dispatch({
                    type: 'SET_MANUAL_INPUT',
                    payload: e.target.value,
                  })
                }
                placeholder="Paid 500 for coffee"
                className="w-full px-5 py-4 rounded-2xl border bg-slate-50 outline-none focus:ring-2 focus:ring-violet-500"
              />

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    dispatch({
                      type: 'TOGGLE_MANUAL_INPUT',
                      payload: false,
                    })
                  }
                  className="flex-1 py-4 rounded-2xl border bg-white"
                >
                  Cancel
                </button>

                <button
                  onClick={processManualInput}
                  className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white flex items-center justify-center gap-2"
                >
                  Process
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMMAND CENTER */}
      <AnimatePresence>
        {state.showCommandCenter && (
          <CommandCenter
            actions={state.actions}
            onClose={() =>
              dispatch({
                type: 'SHOW_COMMAND_CENTER',
                payload: false,
              })
            }
            onConfirm={handleConfirm}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default VoiceInput;

