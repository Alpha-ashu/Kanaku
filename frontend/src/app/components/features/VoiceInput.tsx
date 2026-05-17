import React, { useState, useEffect, useRef } from"react";
import { Mic, MicOff, Loader2, X, AlertCircle, Keyboard, ArrowRight, ChevronLeft, Settings, Activity } from"lucide-react";
import { motion, AnimatePresence } from"motion/react";
import { Haptics, ImpactStyle } from"@capacitor/haptics";
import { Capacitor } from"@capacitor/core";
import { toast } from"sonner";
import { useApp } from"@/contexts/AppContext";
import { CenteredLayout } from"@/app/components/shared/CenteredLayout";
import { resolveLanguageCode } from"@/lib/userPreferences";
import {
 processVoiceTranscript,
 processVoiceAudio,
 parseTranscriptLocally,
 FinancialAction,
 VoiceProcessResponse,
} from"@/services/voiceFinancialService";
import { VoiceAICommandCenter } from"./VoiceAICommandCenter";

interface SpeechRecognitionEvent extends Event {
 results: SpeechRecognitionResultList;
 resultIndex: number;
}

interface SpeechRecognitionResultList {
 length: number;
 item(index: number): SpeechRecognitionResult;
 [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
 isFinal: boolean;
 length: number;
 item(index: number): SpeechRecognitionAlternative;
 [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
 transcript: string;
 confidence: number;
}

interface ISpeechRecognition extends EventTarget {
 continuous: boolean;
 interimResults: boolean;
 lang: string;
 start(): void;
 stop(): void;
 abort(): void;
 onresult: ((event: SpeechRecognitionEvent) => void) | null;
 onerror: ((event: Event) => void) | null;
 onend: (() => void) | null;
}

declare global {
 interface Window {
 SpeechRecognition: new () => ISpeechRecognition;
 webkitSpeechRecognition: new () => ISpeechRecognition;
 }
}

interface VoiceInputProps {
 onTranscript?: (transcript: string) => void;
 onAudioBlob?: (blob: Blob) => void;
 onClose?: () => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, onClose }) => {
 const { language, setCurrentPage } = useApp();
 const [isListening, setIsListening] = useState(false);
 const [transcript, setTranscript] = useState("");
 const [interimTranscript, setInterimTranscript] = useState("");
 const [isProcessing, setIsProcessing] = useState(false);
 const [recognition, setRecognition] = useState<ISpeechRecognition | null>(null);
 const [processedActions, setProcessedActions] = useState<FinancialAction[]>([]);
 const [showCommandCenter, setShowCommandCenter] = useState(false);
 const [voiceError, setVoiceError] = useState<string | null>(null);
 const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
 const [isRecording, setIsRecording] = useState(false);
 const [showTextFallback, setShowTextFallback] = useState(false);
 const [manualInput, setManualInput] = useState("");

 // ── Use refs to avoid stale closures inside setTimeout ──────────────────
 const audioChunksRef = useRef<Blob[]>([]);
 const transcriptRef = useRef<string>("");
 const interimRef = useRef<string>(""); // saves partial results before network error
 const backendDeadRef = useRef<boolean>(
 sessionStorage.getItem('voice_backend_dead') === '1'
 );

 // Keep ref in sync with state
 useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

 const resolveRecognitionLocale = (appLanguage: string) => {
 const languageCode = resolveLanguageCode(appLanguage);
 const localeMap: Record<string, string> = {
 en:"en-US", hi:"hi-IN", bn:"bn-IN", ta:"ta-IN",
 te:"te-IN", mr:"mr-IN", gu:"gu-IN", kn:"kn-IN",
 ml:"ml-IN", pa:"pa-IN", ur:"ur-PK",
 es:"es-ES", fr:"fr-FR", de:"de-DE",
 };
 return localeMap[languageCode] ||"en-US";
 };

 useEffect(() => {
 const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 if (!SpeechRecognition) return;

 const recognitionInstance = new SpeechRecognition();
 recognitionInstance.continuous = true;
 recognitionInstance.interimResults = true;
 recognitionInstance.lang = resolveRecognitionLocale(language);

 recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
 let interim ="";
 let final ="";

 for (let i = event.resultIndex; i < event.results.length; i++) {
 const result = event.results[i];
 if (result.isFinal) {
 final += result[0].transcript;
 } else {
 interim += result[0].transcript;
 }
 }

 setInterimTranscript(interim);
 // Always keep interim in ref — if speech API errors before finalizing,
 // we still have something to work with
 if (interim) interimRef.current = interim;
 if (final) {
 setTranscript((prev) => {
 const updated = (prev +"" + final).trim();
 transcriptRef.current = updated;
 interimRef.current =""; // clear interim once we have final
 return updated;
 });
 }
 };

 recognitionInstance.onerror = (event: any) => {
 if (event.error === 'network') {
 // Save whatever interim speech we captured before the error
 if (interimRef.current && !transcriptRef.current) {
 const saved = interimRef.current.trim();
 transcriptRef.current = saved;
 setTranscript(saved);
 }
 return; // network errors are expected when browser speech API is unavailable
 }
 console.error("Speech recognition error:", event.error);
 setIsListening(false);
 if (event.error === 'not-allowed') {
 setVoiceError("Microphone access denied. Please check browser permissions.");
 toast.error("Microphone access denied");
 }
 };

 recognitionInstance.onend = () => setIsListening(false);
 setRecognition(recognitionInstance);

 return () => { try { recognitionInstance.stop(); } catch {} };
 }, [language]);

 const startListening = async () => {
 if (Capacitor.isNativePlatform()) {
 try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
 }

 try {
 setTranscript("");
 setInterimTranscript("");
 setVoiceError(null);
 setShowTextFallback(false);
 setManualInput("");
 audioChunksRef.current = [];
 transcriptRef.current ="";
 interimRef.current ="";

 // ── Primary: MediaRecorder for high-quality audio ──────────────────
 const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 const recorder = new MediaRecorder(stream);

 recorder.ondataavailable = (event) => {
 if (event.data.size > 0) {
 audioChunksRef.current.push(event.data);
 }
 };

 recorder.onstop = () => {
 stream.getTracks().forEach(track => track.stop());
 };

 recorder.start(100); // Collect chunks every 100ms for real-time accuracy
 setMediaRecorder(recorder);
 setIsRecording(true);

 // ── Secondary: Browser SpeechRecognition for live text preview only
 if (recognition) {
 try {
 recognition.start();
 setIsListening(true);
 } catch {}
 }

 toast.success("🎙️ Listening... Speak now");
 } catch (error) {
 console.error("Failed to start recording:", error);
 setVoiceError("Microphone access failed. Check browser permissions.");
 toast.error("Microphone access failed");
 }
 };

 const stopListening = async () => {
 if (!mediaRecorder) return;

 if (Capacitor.isNativePlatform()) {
 try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
 }

 mediaRecorder.stop();
 setIsRecording(false);

 if (recognition) {
 try { recognition.stop(); } catch {}
 }
 setIsListening(false);

 // Wait for final chunks to flush (MediaRecorder fires ondataavailable async)
 setTimeout(async () => {
 setIsProcessing(true);
 try {
 await processVoiceInput();
 } finally {
 setIsProcessing(false);
 }
 }, 600);
 };

 // ── 3-tier processing pipeline ──────────────────────────────────────────
 const processVoiceInput = async () => {
 let result: VoiceProcessResponse | null = null;

 // TIER 1: Send raw audio blob to Whisper backend (skip if known dead)
 const chunks = audioChunksRef.current;
 if (chunks.length > 0 && !backendDeadRef.current) {
 const audioBlob = new Blob(chunks, { type: 'audio/webm' });
 console.info(`[VoiceAI] Tier 1 — Sending ${audioBlob.size} byte audio blob to Whisper`);
 try {
 result = await processVoiceAudio(audioBlob);
 } catch {
 console.info('[VoiceAI] Tier 1 failed — marking backend dead for this session');
 backendDeadRef.current = true;
 sessionStorage.setItem('voice_backend_dead', '1');
 }
 } else if (backendDeadRef.current) {
 console.info('[VoiceAI] Tier 1 skipped — backend marked offline this session');
 }

 // TIER 2: Send browser transcript text to backend NLP (skip if backend dead)
 if (!result && !backendDeadRef.current) {
 const browserTranscript = transcriptRef.current.trim();
 if (browserTranscript) {
 console.info(`[VoiceAI] Tier 2 — Sending transcript:"${browserTranscript}"`);
 try {
 result = await processVoiceTranscript(browserTranscript);
 } catch {
 console.info('[VoiceAI] Tier 2 failed — falling back to Tier 3');
 backendDeadRef.current = true;
 sessionStorage.setItem('voice_backend_dead', '1');
 }
 }
 }

 // TIER 3: Local regex-based parser (instant, 100% offline)
 if (!result) {
 const browserTranscript = transcriptRef.current.trim();
 if (!browserTranscript) {
 // No text at all — show text input fallback, pre-populated with any partial speech
 const partial = interimRef.current.trim();
 console.info('[VoiceAI] No transcript — showing text fallback', partial ? `with partial:"${partial}"` : '(empty)');
 setManualInput(partial); // pre-fill with any speech we caught
 setShowTextFallback(true);
 return;
 }
 console.info('[VoiceAI] Tier 3 — Local parser on:', browserTranscript);
 result = parseTranscriptLocally(browserTranscript);
 }

 applyResult(result);
 };

 const processManualInput = () => {
 const text = manualInput.trim();
 if (!text) { toast.error("Please type what you want to record."); return; }
 const result = parseTranscriptLocally(text);
 setManualInput("");
 setShowTextFallback(false);
 applyResult(result);
 };

 const applyResult = (result: VoiceProcessResponse | null) => {
 if (result?.success && result.actions && result.actions.length > 0) {
 console.info('[VoiceAI] Detected actions:', result.actions);
 setProcessedActions(result.actions);
 setShowCommandCenter(true);
 } else {
 toast.error("No financial intent detected. Try: 'Paid 200 for coffee' or 'Lent 500 to Rahul'");
 }
 };

 const handleClear = () => {
 setTranscript("");
 setInterimTranscript("");
 audioChunksRef.current = [];
 transcriptRef.current ="";
 };

 const displayText = (transcript +"" + interimTranscript).trim();

 // ── Voice Interface Content (Shared across Modal and Standalone) ─────────
 const renderContent = () => (
 <div className="w-full h-full flex flex-col relative overflow-hidden">


 {/* Main Content Area */}
 <div className="flex-1 flex flex-col relative z-10 w-full px-4">
 
 {/* Left Side / Top: The Blob */}
 <div className="flex-1 flex flex-col items-center justify-center relative min-h-[280px] shrink md:min-h-0">
 <motion.p 
 animate={{ opacity: isRecording ? [0.6, 1, 0.6] : 1 }}
 transition={{ duration: 2, repeat: Infinity }}
 className="text-[#A855F7] font-semibold text-sm md:text-base tracking-widest uppercase mb-4 md:mb-12 absolute top-2 md:relative"
 >
 {isRecording ?"Go ahead, I'm listening..." : isProcessing ?"Analyzing request..." :""}
 </motion.p>
 
 <VoiceBlob isListening={isRecording} isProcessing={isProcessing} />
 </div>

 {/* Bottom: Transcript & Errors */}
 <div className="w-full flex flex-col justify-center items-center pb-8 relative z-20">
 <div className="w-full max-w-md mx-auto">
 {voiceError ? (
 <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 md:p-8 bg-white/60 backdrop-blur-2xl rounded-3xl border border-white/80 shadow-xl text-center">
 <div className="w-14 h-14 bg-rose-100 rounded-full flex items-center justify-center mb-5 mx-auto">
 <AlertCircle className="text-rose-500" size={28} />
 </div>
 <h3 className="text-xl font-bold text-slate-900 mb-2">Connection Lost</h3>
 <p className="text-slate-600 mb-6">{voiceError}</p>
 <button onClick={startListening} className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-sm font-bold w-full hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20">Try Again</button>
 </motion.div>
 ) : showTextFallback ? (
 <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-6 md:p-8 bg-white/70 backdrop-blur-3xl rounded-[2.5rem] border border-white shadow-2xl w-full">
 <div className="flex items-center gap-4 mb-6">
 <div className="w-12 h-12 bg-indigo-50/80 rounded-2xl flex items-center justify-center shadow-inner">
 <Keyboard className="text-[#6C3BFF]" size={24} />
 </div>
 <div>
 <h4 className="text-lg font-bold text-slate-900 leading-tight">Type Command</h4>
 <p className="text-xs text-slate-500 font-medium">Speech API unavailable</p>
 </div>
 </div>
 <input
 autoFocus
 type="text"
 value={manualInput}
 onChange={e => setManualInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && processManualInput()}
 placeholder="Paid 500 for coffee..."
 className="w-full bg-white/60 border border-slate-200/60 rounded-2xl px-5 py-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#A855F7] focus:border-transparent mb-5 transition-all shadow-inner"
 />
 <div className="flex gap-3 w-full">
 <button onClick={() => setShowTextFallback(false)} className="flex-1 py-4 bg-white/60 text-slate-700 rounded-2xl text-sm font-bold hover:bg-white/90 transition-colors border border-white/40 shadow-sm">Cancel</button>
 <button onClick={processManualInput} className="flex-[2] py-4 bg-gradient-to-r from-[#6C3BFF] to-[#A855F7] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#A855F7]/30 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
 Process <ArrowRight size={18} />
 </button>
 </div>
 </motion.div>
 ) : (
 <div className="w-full text-center px-4 max-w-2xl mx-auto">
 {displayText ? (
 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 max-h-[25vh] overflow-y-auto custom-scrollbar pb-4 px-2">
 <p className="text-lg md:text-xl lg:text-2xl font-medium text-slate-800 leading-relaxed tracking-tight">{displayText}</p>
 {interimTranscript && <p className="text-[#A855F7] text-base md:text-lg animate-pulse mt-2">...</p>}
 </motion.div>
 ) : (
 <div className="space-y-6 opacity-80">
 <p className="text-2xl md:text-3xl text-slate-400 font-medium tracking-tight">Listening for commands...</p>
 <div className="flex flex-col gap-3">
 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Try saying:</span>
 <span className="inline-block px-5 py-2.5 bg-white/50 backdrop-blur-md rounded-2xl text-sm font-medium text-slate-600 w-fit mx-auto shadow-sm border border-white/60">"Paid ₹400 for Uber"</span>
 <span className="inline-block px-5 py-2.5 bg-white/50 backdrop-blur-md rounded-2xl text-sm font-medium text-slate-600 w-fit mx-auto shadow-sm border border-white/60">"Lent ₹2000 to Rahul"</span>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Bottom Controls */}
 <div className="w-full max-w-xl mx-auto px-6 md:px-8 pb-[100px] md:pb-10 pt-4 flex justify-between items-center relative z-20 shrink-0 bg-gradient-to-t from-white via-white to-transparent">
 <button onClick={() => setShowTextFallback(true)} className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm flex items-center justify-center text-slate-600 hover:bg-white/80 transition-all hover:scale-105">
 <Keyboard size={20} className="md:w-6 md:h-6" />
 </button>

 <button onClick={isRecording ? stopListening : startListening} className="relative group mx-4">
 {isRecording && (
 <>
 <motion.div animate={{ scale: [1, 1.4], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 rounded-full bg-[#00D9FF]" />
 <motion.div animate={{ scale: [1, 1.8], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 2, delay: 0.5 }} className="absolute inset-0 rounded-full bg-[#FF4FD8]" />
 </>
 )}
 <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-white shadow-xl relative z-10 transition-all duration-300 ${isRecording ? 'bg-gradient-to-br from-[#FF4FD8] via-[#A855F7] to-[#00D9FF] shadow-[#A855F7]/40 scale-105' : 'bg-slate-900 shadow-slate-900/30 group-hover:scale-105'}`}>
 {isProcessing ? <Loader2 size={32} className="animate-spin md:w-9 md:h-9" /> : isRecording ? <Activity size={32} className="animate-pulse md:w-9 md:h-9" /> : <Mic size={32} className="md:w-9 md:h-9" />}
 </div>
 </button>

 <button onClick={transcript && !isRecording ? handleClear : onClose || (() => window.history.back())} className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm flex items-center justify-center text-slate-600 hover:bg-white/80 transition-all hover:scale-105">
 {transcript && !isRecording ? <X size={20} className="md:w-6 md:h-6" /> : <X size={20} className="md:w-6 md:h-6" />}
 </button>
 </div>

 {/* Command Center Overlay */}
 <AnimatePresence>
 {showCommandCenter && (
 <VoiceAICommandCenter
 transcript={transcript}
 actions={processedActions}
 onClose={() => { setShowCommandCenter(false); if (onClose) onClose(); }}
 onAddMore={() => { setShowCommandCenter(false); startListening(); }}
 />
 )}
 </AnimatePresence>
 </div>
 );

 // ── Modal mode ───────────────────────────────
 if (onClose) {
 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center md:p-6 bg-black/40 backdrop-blur-sm">
 <motion.div
 initial={{ y:"100%" }}
 animate={{ y: 0 }}
 exit={{ y:"100%" }}
 transition={{ type:"spring", damping: 25, stiffness: 200 }}
 className="w-full h-full md:h-[85vh] md:max-h-[800px] md:max-w-[1000px] md:rounded-[3rem] overflow-hidden shadow-2xl bg-white"
 >
 {renderContent()}
 </motion.div>
 </div>
 );
 }

 // ── Standalone page mode ─────────────────────────────────────────────────
 return renderContent();
};

// ── Voice Blob Component ─────────────────────────────────────────────────────
const VoiceBlob = ({ isListening, isProcessing }: { isListening: boolean, isProcessing: boolean }) => {
 // Complex states for fluid organic animation
 const activeState = isProcessing ? 'processing' : isListening ? 'listening' : 'idle';
 
 // Audio reactive physics logic
 const blobScale = activeState === 'processing' ? [1, 1.2, 1] : activeState === 'listening' ? [1, 1.05, 0.95, 1] : [1, 1.02, 1];
 const blobSpeed = activeState === 'processing' ? 4 : activeState === 'listening' ? 8 : 15;
 const particleSpeedMultiplier = activeState === 'processing' ? 0.3 : activeState === 'listening' ? 0.6 : 1;

 return (
 <div className="relative flex items-center justify-center w-[280px] h-[280px] md:w-[400px] md:h-[400px] mx-auto perspective-1000">
 
 {/* Glow Aura */}
 <motion.div
 animate={{
 scale: activeState === 'listening' ? [1, 1.3, 1] : 1,
 opacity: activeState === 'processing' ? [0.6, 0.9, 0.6] : activeState === 'listening' ? [0.4, 0.7, 0.4] : 0.2,
 }}
 transition={{ duration: 2.5, repeat: Infinity, ease:"easeInOut" }}
 className="absolute inset-0 bg-[#7C4DFF] rounded-full blur-[80px] md:blur-[100px] mix-blend-screen"
 />
 
 {/* Particle System: Neural Dust & Energy Trails */}
 <motion.div 
 animate={{ rotate: activeState === 'processing' ? 360 : activeState === 'listening' ? 180 : 0 }}
 transition={{ duration: 30 * particleSpeedMultiplier, repeat: Infinity, ease:"linear" }}
 className="absolute w-[200%] h-[200%] -left-[50%] -top-[50%] z-0 pointer-events-none"
 >
 {/* Floating Glow Particles */}
 {[...Array(15)].map((_, i) => (
 <motion.div
 key={`glow-${i}`}
 animate={{
 y: activeState !== 'idle' ? [0, -50 - (i*2), 0] : [0, -15, 0],
 x: activeState !== 'idle' ? [0, (i % 2 === 0 ? 30 : -30), 0] : 0,
 opacity: activeState !== 'idle' ? [0.4, 1, 0.4] : [0.1, 0.4, 0.1]
 }}
 transition={{ duration: (4 + (i % 4)) * particleSpeedMultiplier, repeat: Infinity, delay: i * 0.2, ease:"easeInOut" }}
 className={`absolute rounded-full blur-[2px] md:blur-[3px] ${i % 3 === 0 ? 'bg-[#00D9FF]' : i % 3 === 1 ? 'bg-[#FF4FD8]' : 'bg-[#6C3BFF]'}`}
 style={{
 width: `${3 + Math.random() * 5}px`,
 height: `${3 + Math.random() * 5}px`,
 top: `${10 + Math.random() * 80}%`,
 left: `${10 + Math.random() * 80}%`,
 }}
 />
 ))}

 {/* Energy Trails */}
 {activeState !== 'idle' && [...Array(8)].map((_, i) => (
 <motion.div
 key={`trail-${i}`}
 animate={{
 y: [100, -100],
 opacity: [0, 0.8, 0],
 scaleY: [1, 2, 1]
 }}
 transition={{ duration: (1.5 + (i % 2)) * particleSpeedMultiplier, repeat: Infinity, delay: i * 0.4, ease:"easeOut" }}
 className="absolute bg-[#A855F7] rounded-full blur-[1px]"
 style={{
 width: '2px',
 height: `${15 + Math.random() * 20}px`,
 top: `${20 + Math.random() * 60}%`,
 left: `${20 + Math.random() * 60}%`,
 transform: `rotate(${i * 45}deg)`,
 boxShadow: '0 0 10px 2px rgba(168, 85, 247, 0.8)'
 }}
 />
 ))}
 </motion.div>

 {/* Main Core: Liquid Morphing Layers */}
 
 {/* Layer 1: Electric Blue Base */}
 <motion.div
 animate={{
 rotate: activeState === 'processing' ? 360 : activeState === 'listening' ? [0, 180, 360] : [0, 90, 0],
 scale: blobScale,
 borderRadius: activeState !== 'idle'
 ? ["40% 60% 70% 30% / 40% 50% 60% 50%","60% 40% 50% 50% / 50% 60% 40% 60%","40% 60% 70% 30% / 40% 50% 60% 50%"] 
 : ["50% 50% 45% 55% / 55% 45% 50% 50%","45% 55% 50% 50% / 50% 50% 45% 55%","50% 50% 45% 55% / 55% 45% 50% 50%"],
 }}
 transition={{ 
 rotate: { duration: blobSpeed * 2, repeat: Infinity, ease:"linear" },
 scale: { duration: 2.5, repeat: Infinity, ease:"easeInOut" },
 borderRadius: { duration: activeState === 'processing' ? 3 : 5, repeat: Infinity, ease:"easeInOut" }
 }}
 className="absolute w-48 h-48 md:w-64 md:h-64 bg-gradient-to-tr from-[#6C3BFF] via-[#4F46E5] to-[#00D9FF] mix-blend-multiply md:mix-blend-normal blur-[15px] md:blur-xl opacity-90"
 />

 {/* Layer 2: Magenta & Pink Morph */}
 <motion.div
 animate={{
 rotate: activeState === 'processing' ? -360 : activeState === 'listening' ? [0, -180, -360] : [0, -90, 0],
 scale: blobScale,
 borderRadius: activeState !== 'idle'
 ? ["50% 50% 40% 60% / 60% 40% 50% 50%","40% 60% 50% 50% / 50% 50% 60% 40%","50% 50% 40% 60% / 60% 40% 50% 50%"] 
 : ["55% 45% 50% 50% / 50% 55% 45% 50%","50% 50% 55% 45% / 45% 50% 50% 55%","55% 45% 50% 50% / 50% 55% 45% 50%"],
 }}
 transition={{ 
 rotate: { duration: blobSpeed * 2.5, repeat: Infinity, ease:"linear" },
 scale: { duration: 3, repeat: Infinity, ease:"easeInOut" },
 borderRadius: { duration: activeState === 'processing' ? 3.5 : 6, repeat: Infinity, ease:"easeInOut" }
 }}
 className="absolute w-44 h-44 md:w-56 md:h-56 bg-gradient-to-br from-[#FF4FD8] to-[#9333EA] mix-blend-multiply md:mix-blend-normal blur-[18px] md:blur-2xl opacity-85"
 />

 {/* Layer 3: Cyan Highlights (Dynamic inner light streaks) */}
 <motion.div
 animate={{
 rotate: activeState === 'processing' ? 360 : 0,
 scale: activeState === 'listening' ? [0.9, 1.1, 0.9] : 1,
 opacity: activeState === 'processing' ? [0.5, 0.9, 0.5] : [0.3, 0.6, 0.3],
 borderRadius: ["60% 40% 70% 30%","30% 70% 40% 60%","60% 40% 70% 30%"]
 }}
 transition={{ duration: activeState === 'processing' ? 2 : 4, repeat: Infinity, ease:"easeInOut" }}
 className="absolute w-32 h-32 md:w-48 md:h-48 bg-gradient-to-t from-transparent to-[#00D9FF] mix-blend-screen blur-[10px] opacity-60"
 />

 {/* Inner Core for 'Intelligence' */}
 <motion.div
 animate={{
 scale: activeState === 'processing' ? [0.9, 1.2, 0.9] : activeState === 'listening' ? [0.95, 1.1, 0.95] : [0.98, 1.02, 0.98],
 opacity: activeState === 'processing' ? [0.8, 1, 0.8] : 0.9,
 }}
 transition={{ duration: activeState === 'processing' ? 1 : 2, repeat: Infinity, ease:"easeInOut" }}
 className="absolute w-24 h-24 md:w-32 md:h-32 bg-white rounded-full blur-[10px] md:blur-[14px] shadow-[0_0_60px_20px_rgba(255,255,255,0.9)]"
 />
 </div>
 );
};

