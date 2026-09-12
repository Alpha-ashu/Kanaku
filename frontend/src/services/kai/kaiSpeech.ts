/**
 * Spoken responses for Kai via the Web Speech synthesis API.
 *
 * Muted by default: an open microphone transcribes Kai's own voice, so
 * speaking only makes sense when the session pauses recognition around it
 * (the session does exactly that when the user un-mutes).
 */
const MUTE_KEY = 'KANAKU_kai_muted';

export const canSpeak = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function isKaiMuted(): boolean {
  try {
    const stored = localStorage.getItem(MUTE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setKaiMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // ignore — per-viewer convenience only
  }
  if (muted) stopSpeaking();
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-IN/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang)) ??
    null
  );
}

/** Resolves when the utterance finishes (immediately when muted or unsupported). */
export function speak(text: string): Promise<void> {
  if (!text || isKaiMuted() || !canSpeak()) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'en-IN';
      utterance.rate = 1.02;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
      // Some engines never fire onend for cancelled utterances — never block the session.
      setTimeout(resolve, Math.min(15000, 2000 + text.length * 80));
    } catch {
      resolve();
    }
  });
}
