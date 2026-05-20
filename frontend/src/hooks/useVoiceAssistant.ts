import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { voiceRecognitionService } from '@/services/voiceRecognitionService';
import { voiceCommandParser, type ParsedVoiceCommand } from '@/services/voiceCommandParser';

export interface UseVoiceAssistantState {
  isListening: boolean;
  interimText: string;
  finalText: string;
  error: string | null;
  parsedCommand: ParsedVoiceCommand | null;
  confidence: number;
}

export const useVoiceAssistant = () => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsedCommand, setParsedCommand] = useState<ParsedVoiceCommand | null>(null);
  const [confidence, setConfidence] = useState(0);

  const accumulatedTextRef = useRef('');
  const isProcessingRef = useRef(false);

  const startListening = useCallback(() => {
    if (!voiceRecognitionService.isSupported()) {
      const errorMsg = 'Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsListening(true);
    setError(null);
    setInterimText('');
    setFinalText('');
    accumulatedTextRef.current = '';
    setParsedCommand(null);

    voiceRecognitionService.start({
      onStart: () => {
        setIsListening(true);
        toast.loading('Listening...', { id: 'voice-listening' });
      },

      onResult: (result) => {
        if (result.isFinal) {
          accumulatedTextRef.current += ' ' + result.text;
          setFinalText(accumulatedTextRef.current.trim());
          setInterimText('');
          setConfidence(result.confidence);

          // Parse the command automatically
          const parsed = voiceCommandParser.parse(accumulatedTextRef.current);
          setParsedCommand(parsed);

          // Auto-close toast
          toast.dismiss('voice-listening');
        } else {
          setInterimText(result.text);
          setConfidence(result.confidence);
        }
      },

      onError: (errorEvent) => {
        setError(errorEvent.message);
        setIsListening(false);
        toast.dismiss('voice-listening');
        toast.error(errorEvent.message);
      },

      onEnd: () => {
        setIsListening(false);
        if (accumulatedTextRef.current.trim()) {
          toast.success(`Parsed: "${accumulatedTextRef.current.trim()}"`);
        }
        toast.dismiss('voice-listening');
      },
    });
  }, []);

  const stopListening = useCallback(() => {
    voiceRecognitionService.stop();
    setIsListening(false);
  }, []);

  const clearText = useCallback(() => {
    setFinalText('');
    setInterimText('');
    accumulatedTextRef.current = '';
    setParsedCommand(null);
    setError(null);
    setConfidence(0);
  }, []);

  const continueListening = useCallback(() => {
    // Keep the current accumulated text and continue listening
    setIsListening(true);
    setInterimText('');
    setError(null);

    voiceRecognitionService.start({
      onStart: () => {
        setIsListening(true);
        toast.loading('Listening for more...', { id: 'voice-listening' });
      },

      onResult: (result) => {
        if (result.isFinal) {
          accumulatedTextRef.current += ' ' + result.text;
          setFinalText(accumulatedTextRef.current.trim());
          setInterimText('');
          setConfidence(result.confidence);

          const parsed = voiceCommandParser.parse(accumulatedTextRef.current);
          setParsedCommand(parsed);

          toast.dismiss('voice-listening');
        } else {
          setInterimText(result.text);
          setConfidence(result.confidence);
        }
      },

      onError: (errorEvent) => {
        setError(errorEvent.message);
        setIsListening(false);
        toast.dismiss('voice-listening');
        toast.error(errorEvent.message);
      },

      onEnd: () => {
        setIsListening(false);
        toast.dismiss('voice-listening');
      },
    });
  }, []);

  return {
    isListening,
    interimText,
    finalText,
    error,
    parsedCommand,
    confidence,
    startListening,
    stopListening,
    clearText,
    continueListening,
    isSupported: voiceRecognitionService.isSupported(),
  };
};
