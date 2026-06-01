// Ambient declarations for Web Speech API (not in all TS lib sets)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export interface VoiceRecognitionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface VoiceErrorEvent {
  error: string;
  message: string;
}

type VoiceEventCallback = {
  onStart?: () => void;
  onResult?: (result: VoiceRecognitionResult) => void;
  onError?: (error: VoiceErrorEvent) => void;
  onEnd?: () => void;
};

export class VoiceRecognitionService {
  // Using 'any' because SpeechRecognition global type varies by browser/TS lib
  private recognition: any | null = null;
  private isListening: boolean = false;
  private currentCallbacks: VoiceEventCallback = {};

  constructor() {
    // Initialize Web Speech API with vendor prefixes
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not available in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.setupRecognitionHandlers();
  }

  private setupRecognitionHandlers() {
    if (!this.recognition) return;

    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN'; // Default to Indian English for Indian market
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.currentCallbacks.onStart?.();
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';
      let bestConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence || 0;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
          bestConfidence = confidence;
        } else {
          interimTranscript += transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      this.currentCallbacks.onResult?.({
        text: text.trim(),
        isFinal: finalTranscript.length > 0,
        confidence: bestConfidence,
      });
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.currentCallbacks.onError?.({
        error: event.error,
        message: this.getErrorMessage(event.error),
      });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.currentCallbacks.onEnd?.();
    };
  }

  start(callbacks: VoiceEventCallback): void {
    if (!this.recognition) {
      callbacks.onError?.({
        error: 'not-supported',
        message: 'Speech Recognition is not supported on this device',
      });
      return;
    }

    if (this.isListening) {
      return;
    }

    this.currentCallbacks = callbacks;

    try {
      this.recognition.start();
    } catch (err) {
      console.error('Error starting voice recognition:', err);
    }
  }

  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.abort();
      this.isListening = false;
    }
  }

  setLanguage(lang: string): void {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  isSupported(): boolean {
    return !!this.recognition;
  }

  private getErrorMessage(error: string): string {
    const errorMessages: Record<string, string> = {
      'no-speech': 'No speech was detected. Please speak clearly and try again.',
      'audio-capture': 'No microphone was found. Please check your microphone.',
      'network': 'Network error occurred. Please check your connection.',
      'not-allowed': 'Microphone access was denied. Please enable microphone access.',
      'bad-grammar': 'No speech recognized. Please try again.',
      'service-not-allowed': 'Speech service not allowed. Please check permissions.',
    };

    return errorMessages[error] || `Error: ${error}. Please try again.`;
  }
}

export const voiceRecognitionService = new VoiceRecognitionService();
