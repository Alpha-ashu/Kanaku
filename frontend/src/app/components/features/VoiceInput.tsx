import React from 'react';
import AIAssistantPage from './AIAssistantPage';

/**
 * VoiceInput — Unified with the modern reference AI Assistant design.
 * Opens directly in Voice Orb mode with fluid iridescent animations,
 * live audio transcription, and seamless toggle to conversational chat.
 */
export function VoiceInput() {
  return <AIAssistantPage defaultMode="voice" />;
}

export default VoiceInput;
