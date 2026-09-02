/**
 * One speech-to-text interface across web and native.
 *
 * The voice feature was built on the Web Speech API (`webkitSpeechRecognition`),
 * which exists in Chrome and Safari but **not** in Android WebView or iOS
 * WKWebView. On device the UI therefore dead-ended on "Speech recognition not
 * supported in this browser. Please type below." — the microphone worked (the
 * waveform uses getUserMedia), only transcription was missing.
 *
 * This adapter picks the right engine per platform and hides the difference:
 *
 *   native  → @capacitor-community/speech-recognition
 *             (Android SpeechRecognizer / iOS SFSpeechRecognizer)
 *   web     → window.SpeechRecognition | webkitSpeechRecognition
 *
 * Both are exposed through the same callback shape the component already used, so
 * the calling code does not branch on platform.
 *
 * Engine differences worth knowing:
 *  - The native engines stop on their own after a pause; the web one can run
 *    continuously. `onEnd` fires for both, and callers should treat it as "the
 *    utterance finished" rather than "the user pressed stop".
 *  - Native partial results arrive as a full running transcript for the current
 *    utterance, not a delta, so we replace rather than append.
 */

import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export type SpeechErrorReason = 'not-supported' | 'denied' | 'network' | 'no-speech' | 'unknown';

export interface SpeechCallbacks {
  /** Best-guess text while the user is still speaking. */
  onPartial: (text: string) => void;
  /** Confirmed text for a completed utterance. */
  onFinal: (text: string) => void;
  /** Recognition finished — either naturally or via stop(). */
  onEnd: () => void;
  onError: (reason: SpeechErrorReason, message: string) => void;
}

export interface SpeechSession {
  stop: () => Promise<void>;
}

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * The live native session, if any. Tracked module-wide because the plugin's
 * listeners are global — see startNative().
 */
let activeNativeSession: SpeechSession | null = null;
let activeWebSession: SpeechSession | null = null;

const getWebEngine = (): (new () => any) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => any) | null;
};

/** Whether *some* engine can transcribe on this platform. */
export const isSpeechRecognitionSupported = async (): Promise<boolean> => {
  if (isNative()) {
    try {
      const { available } = await SpeechRecognition.available();
      if (typeof available === 'boolean') return available;
      return true;
    } catch {
      return true;
    }
  }
  return getWebEngine() !== null;
};

/**
 * Ensures we hold microphone / speech permission.
 *
 * On iOS this covers both the microphone and the separate speech-recognition
 * entitlement; on Android it maps to RECORD_AUDIO. On web the browser prompts as
 * part of getUserMedia, which the caller already does for the waveform.
 */
export const ensureSpeechPermission = async (): Promise<boolean> => {
  if (!isNative()) return true;

  try {
    const current = await SpeechRecognition.checkPermissions();
    if (current?.speechRecognition === 'granted') return true;

    const requested = await SpeechRecognition.requestPermissions();
    if (requested?.speechRecognition === 'granted') return true;
    return requested?.speechRecognition !== 'denied';
  } catch (error) {
    console.warn('[Speech] Permission check failed:', error);
    return true;
  }
};

/**
 * Native path. Resolves once listening has actually started; the caller stops it
 * through the returned handle.
 */
const startNative = async (
  callbacks: SpeechCallbacks,
  language: string,
): Promise<SpeechSession> => {
  const granted = await ensureSpeechPermission();
  if (!granted) {
    callbacks.onError('denied', 'Microphone access is needed for voice entry.');
    callbacks.onEnd();
    return { stop: async () => undefined };
  }

  // Plugin listeners are global, not per-session. A second start() without an
  // intervening stop() — rapid tapping of the mic button — would stack a second set
  // on top of the first, so every partial would be delivered twice. Tear down any
  // previous session before opening this one; only one can be live at a time.
  await activeNativeSession?.stop().catch(() => undefined);
  try {
    await SpeechRecognition.removeAllListeners();
  } catch {
    /* nothing attached yet */
  }

  const handles: PluginListenerHandle[] = [];
  let finished = false;
  let latestPartial = '';

  // Guarantees onEnd fires exactly once, whichever way the session terminates.
  const finish = async () => {
    if (finished) return;
    finished = true;

    // Nothing was promoted to a final result (common on Android, where the last
    // partial is the best transcript we get) — don't silently drop the utterance.
    if (latestPartial.trim()) {
      callbacks.onFinal(latestPartial.trim());
      latestPartial = '';
    }

    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
    handles.length = 0;
    callbacks.onEnd();
  };

  handles.push(
    await SpeechRecognition.addListener('partialResults', ({ matches }) => {
      const text = matches?.[0]?.trim();
      if (!text) return;
      // Native partials are the whole utterance so far, not a delta.
      latestPartial = text;
      callbacks.onPartial(text);
    }),
  );

  handles.push(
    await SpeechRecognition.addListener('listeningState', ({ status }) => {
      if (status === 'stopped') void finish();
    }),
  );

  try {
    const targetLang = language || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-IN';
    // `popup: false` keeps Android inline (no system dialog over our UI), which is
    // also the only mode where partialResults are delivered.
    const result = await SpeechRecognition.start({
      language: targetLang,
      maxResults: 5,
      partialResults: true,
      popup: false,
    });

    // iOS returns the final matches here; Android resolves empty and emits events.
    const finalText = result?.matches?.[0]?.trim();
    if (finalText) {
      latestPartial = '';
      callbacks.onFinal(finalText);
      await finish();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission|denied/i.test(message)) {
      callbacks.onError('denied', 'Microphone access is needed for voice entry.');
    } else if (/no match|no speech/i.test(message)) {
      callbacks.onError('no-speech', 'Did not catch that. Please try again.');
    } else if (/network/i.test(message)) {
      callbacks.onError('network', 'Speech recognition needs a network connection right now.');
    } else {
      callbacks.onError('unknown', message || 'Speech recognition failed.');
    }
    await finish();
  }

  const session: SpeechSession = {
    stop: async () => {
      try {
        await SpeechRecognition.stop();
      } catch {
        /* already stopped */
      }
      await finish();
      if (activeNativeSession === session) activeNativeSession = null;
    },
  };

  activeNativeSession = session;
  return session;
};

/** Web path — the original Web Speech API behaviour with active session protection. */
const startWeb = (callbacks: SpeechCallbacks, language: string): SpeechSession => {
  const Engine = getWebEngine();
  if (!Engine) {
    callbacks.onError('not-supported', 'Speech recognition is not supported in this browser.');
    callbacks.onEnd();
    return { stop: async () => undefined };
  }

  // Teardown any previous active session before starting a new one
  if (activeWebSession) {
    void activeWebSession.stop().catch(() => undefined);
    activeWebSession = null;
  }

  let finished = false;
  let recognition: any = null;

  try {
    recognition = new Engine();
  } catch (err) {
    callbacks.onError('unknown', 'Could not initialize speech engine.');
    callbacks.onEnd();
    return { stop: async () => undefined };
  }

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;

  const finish = () => {
    if (finished) return;
    finished = true;
    callbacks.onEnd();
    if (activeWebSession === session) {
      activeWebSession = null;
    }
  };

  recognition.onresult = (event: any) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const alternative = event.results[i][0]?.transcript ?? '';
      if (event.results[i].isFinal) final += `${alternative} `;
      else interim += alternative;
    }
    if (interim) callbacks.onPartial(interim);
    if (final.trim()) callbacks.onFinal(final.trim());
  };

  recognition.onerror = (event: any) => {
    switch (event.error) {
      case 'not-allowed':
      case 'service-not-allowed':
        callbacks.onError('denied', 'Microphone access denied.');
        break;
      case 'network':
        callbacks.onError('network', 'Speech recognition is unavailable offline. Type your entry instead.');
        break;
      case 'no-speech':
        callbacks.onError('no-speech', 'Did not catch that. Please try again.');
        break;
      default:
        callbacks.onError('unknown', `Speech error: ${event.error}`);
    }
    finish();
  };

  recognition.onend = () => finish();

  try {
    recognition.start();
  } catch (err: any) {
    console.warn('[Speech] Web recognition start error:', err);
    finish();
  }

  const session: SpeechSession = {
    stop: async () => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
      finish();
    },
  };

  activeWebSession = session;
  return session;
};

/**
 * Starts transcription on whichever engine this platform provides.
 *
 * `language` defaults to en-IN: the product is India-first, and the Indian English
 * model handles the rupee amounts, Hinglish merchant names and number formats the
 * parser expects far better than en-US.
 */
export const startSpeechRecognition = async (
  callbacks: SpeechCallbacks,
  language = 'en-IN',
): Promise<SpeechSession> => {
  if (isNative()) {
    return startNative(callbacks, language);
  }
  return startWeb(callbacks, language);
};
