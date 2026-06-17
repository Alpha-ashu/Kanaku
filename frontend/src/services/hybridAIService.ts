import { TokenManager } from '@/lib/api';
import { ocrEngine, ExpenseData } from './tesseractOCRService';
import { createVoiceAIProcessor, VoiceExpenseResult } from './voiceAIProcessor';
import { KANAKUAI } from './KANKUIntelligenceEngine';

//  HYBRID OFFLINE/ONLINE AI SUPPORT
// This service provides intelligent fallback between offline and online AI processing

export interface HybridAIConfig {
  preferOffline: boolean;
  onlineTimeout: number; // ms
  confidenceThreshold: number; // Minimum confidence to accept offline result
  enableOnlineFallback: boolean;
  onlineAPIEndpoint?: string;
}

export interface HybridAIResult {
  data: ExpenseData | VoiceExpenseResult;
  source: 'offline' | 'online' | 'hybrid';
  confidence: number;
  processingTime: number;
  fallbackUsed: boolean;
}

class HybridAIService {
  private config: HybridAIConfig;
  private voiceProcessor: any;

  constructor(userId: string, config: Partial<HybridAIConfig> = {}) {
    this.config = {
      preferOffline: true,
      onlineTimeout: 10000,
      confidenceThreshold: 0.7,
      enableOnlineFallback: true,
      onlineAPIEndpoint: process.env.REACT_APP_AI_API_ENDPOINT || '/api/ai/process',
      ...config,
    };

    this.voiceProcessor = createVoiceAIProcessor(userId);
  }

  //  HYBRID OCR PROCESSING
  async processImageOCR(imageFile: File): Promise<HybridAIResult> {
    const startTime = performance.now();
    console.log(' Starting hybrid OCR processing...');

    try {
      // Step 1: Try offline processing first (fast)
      if (this.config.preferOffline) {
        console.log(' Trying offline OCR first...');
        const offlineResult = await this.processOfflineOCR(imageFile);
        const offlineTime = performance.now() - startTime;

        // If offline result is confident enough, return it
        if (offlineResult.confidence >= this.config.confidenceThreshold) {
          console.log(` Offline OCR successful (${offlineTime.toFixed(2)}ms)`);
          return {
            data: offlineResult,
            source: 'offline',
            confidence: offlineResult.confidence,
            processingTime: offlineTime,
            fallbackUsed: false,
          };
        }

        console.log(` Offline confidence too low (${offlineResult.confidence}), trying online...`);
      }

      // Step 2: Try online processing as fallback
      if (this.config.enableOnlineFallback) {
        console.log(' Falling back to online OCR...');
        const onlineResult = await this.processOnlineOCR(imageFile, startTime);

        if (onlineResult) {
          const totalTime = performance.now() - startTime;
          console.log(` Online OCR successful (${totalTime.toFixed(2)}ms)`);
          return {
            data: onlineResult,
            source: 'online',
            confidence: onlineResult.confidence || 0.5,
            processingTime: totalTime,
            fallbackUsed: true,
          };
        }
      }

      // Step 3: Return offline result as last resort
      console.log(' Using offline result as fallback...');
      const offlineResult = await this.processOfflineOCR(imageFile);
      const totalTime = performance.now() - startTime;

      return {
        data: offlineResult,
        source: 'hybrid',
        confidence: offlineResult.confidence,
        processingTime: totalTime,
        fallbackUsed: true,
      };

    } catch (error) {
      console.error(' Hybrid OCR processing failed:', error);
      const totalTime = performance.now() - startTime;

      // Last resort: try offline only
      try {
        const offlineResult = await this.processOfflineOCR(imageFile);
        return {
          data: offlineResult,
          source: 'offline',
          confidence: offlineResult.confidence,
          processingTime: totalTime,
          fallbackUsed: true,
        };
      } catch (offlineError) {
        throw new Error(`Both online and offline OCR failed: ${error}`);
      }
    }
  }

  //  HYBRID VOICE PROCESSING
  async processVoiceInput(audioFile?: File): Promise<HybridAIResult[]> {
    const startTime = performance.now();
    console.log(' Starting hybrid voice processing...');

    try {
      // For voice, we primarily use offline processing since Web Speech API is already offline-capable
      console.log(' Processing voice with offline AI...');

      const voiceResults = audioFile
        ? await this.processOfflineVoice(audioFile)
        : await this.voiceProcessor.startListening();

      const processingTime = performance.now() - startTime;
      console.log(` Voice processing completed (${processingTime.toFixed(2)}ms)`);

      return voiceResults.map((result: any) => ({
        data: result,
        source: 'offline' as const,
        confidence: result.confidence,
        processingTime,
        fallbackUsed: false,
      }));

    } catch (error) {
      console.error(' Hybrid voice processing failed:', error);
      throw error;
    }
  }

  //  OFFLINE PROCESSING METHODS
  private async processOfflineOCR(imageFile: File): Promise<ExpenseData> {
    console.log(' Processing OCR offline with Tesseract + KANAKUAI...');

    // Use Tesseract OCR + KANAKUAI
    const result = await ocrEngine.extractExpenseData(imageFile);

    console.log(` Offline OCR result:`, result);
    return result;
  }

  private async processOfflineVoice(audioFile: File): Promise<VoiceExpenseResult[]> {
    console.log(' Processing voice offline...');

    return this.voiceProcessor.processVoiceInput(audioFile);
  }

  //  ONLINE PROCESSING METHODS
  private async processOnlineOCR(imageFile: File, startTime: number): Promise<ExpenseData | null> {
    if (!this.config.onlineAPIEndpoint) {
      console.log(' No online API endpoint configured');
      return null;
    }

    console.log(' Processing OCR online...');

    // Create timeout promise
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Online OCR timeout')), this.config.onlineTimeout);
    });

    // Create API call promise
    const apiPromise = this.callOnlineOCR(imageFile);

    try {
      // Race between API call and timeout
      const result = await Promise.race([apiPromise, timeoutPromise]);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === 'Online OCR timeout') {
        console.log(' Online OCR timed out');
        return null;
      }
      throw error;
    }
  }

  private async callOnlineOCR(imageFile: File): Promise<ExpenseData> {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('source', 'receipt');

    const response = await fetch(this.config.onlineAPIEndpoint!, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${TokenManager.getAccessToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Online OCR API error: ${response.status}`);
    }

    const result = await response.json();
    return result.data || result;
  }

  //  INTELLIGENT FALLBACK LOGIC
  private async processWithIntelligentFallback(
    imageFile: File,
    primaryMethod: 'offline' | 'online'
  ): Promise<HybridAIResult> {
    const startTime = performance.now();

    try {
      let result: ExpenseData;
      let source: 'offline' | 'online' | 'hybrid';

      if (primaryMethod === 'offline') {
        result = await this.processOfflineOCR(imageFile);
        source = 'offline';

        // If offline result is poor, try online
        if (result.confidence < this.config.confidenceThreshold && this.config.enableOnlineFallback) {
          console.log(' Offline result poor, trying online fallback...');
          const onlineResult = await this.processOnlineOCR(imageFile, startTime);

          if (onlineResult && onlineResult.confidence > result.confidence) {
            result = onlineResult;
            source = 'hybrid';
          }
        }
      } else {
        // Primary online method
        const onlineResult = await this.processOnlineOCR(imageFile, startTime);

        if (onlineResult) {
          result = onlineResult;
          source = 'online';
        } else {
          // Fallback to offline
          result = await this.processOfflineOCR(imageFile);
          source = 'hybrid';
        }
      }

      const processingTime = performance.now() - startTime;

      return {
        data: result,
        source,
        confidence: result.confidence,
        processingTime,
        fallbackUsed: source !== primaryMethod,
      };

    } catch (error) {
      console.error(' Intelligent fallback failed:', error);
      throw error;
    }
  }

  //  CONFIGURATION METHODS
  updateConfig(newConfig: Partial<HybridAIConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(' Hybrid AI config updated:', this.config);
  }

  getConfig(): HybridAIConfig {
    return { ...this.config };
  }

  //  PERFORMANCE MONITORING
  async benchmarkPerformance(imageFile: File): Promise<{
    offline: { time: number; confidence: number };
    online: { time: number; confidence: number } | null;
  }> {
    console.log(' Running performance benchmark...');

    // Benchmark offline
    const offlineStart = performance.now();
    const offlineResult = await this.processOfflineOCR(imageFile);
    const offlineTime = performance.now() - offlineStart;

    // Benchmark online
    let onlineBenchmark: { time: number; confidence: number } | null = null;
    if (this.config.enableOnlineFallback) {
      try {
        const onlineStart = performance.now();
        const onlineResult = await this.processOnlineOCR(imageFile, onlineStart);
        const onlineTime = performance.now() - onlineStart;

        if (onlineResult) {
          onlineBenchmark = {
            time: onlineTime,
            confidence: onlineResult.confidence,
          };
        }
      } catch (error) {
        console.log(' Online benchmark failed:', error);
      }
    }

    const benchmark = {
      offline: {
        time: offlineTime,
        confidence: offlineResult.confidence,
      },
      online: onlineBenchmark,
    };

    console.log(' Benchmark results:', benchmark);
    return benchmark;
  }

  //  SMART SELECTION LOGIC
  getOptimalMethod(imageSize: number, networkQuality: 'fast' | 'slow' | 'unknown'): 'offline' | 'online' {
    // For small images, offline is usually faster
    if (imageSize < 1024 * 1024) { // < 1MB
      return 'offline';
    }

    // For slow networks, prefer offline
    if (networkQuality === 'slow') {
      return 'offline';
    }

    // For fast networks with large images, try online first
    if (networkQuality === 'fast' && imageSize > 2 * 1024 * 1024) { // > 2MB
      return 'online';
    }

    // Default: offline
    return 'offline';
  }
}

//  FACTORY FUNCTION
export function createHybridAIService(
  userId: string,
  config: Partial<HybridAIConfig> = {}
): HybridAIService {
  return new HybridAIService(userId, config);
}

//  DEFAULT CONFIGURATIONS
export const HYBRID_CONFIGS = {
  // Optimize for speed (offline-first)
  FAST: {
    preferOffline: true,
    onlineTimeout: 5000,
    confidenceThreshold: 0.6,
    enableOnlineFallback: true,
  },

  // Optimize for accuracy (online-first)
  ACCURATE: {
    preferOffline: false,
    onlineTimeout: 15000,
    confidenceThreshold: 0.8,
    enableOnlineFallback: true,
  },

  // Balanced approach
  BALANCED: {
    preferOffline: true,
    onlineTimeout: 10000,
    confidenceThreshold: 0.7,
    enableOnlineFallback: true,
  },

  // Offline only (privacy-first)
  OFFLINE_ONLY: {
    preferOffline: true,
    onlineTimeout: 1000,
    confidenceThreshold: 0.5,
    enableOnlineFallback: false,
  },
};

// Export singleton instance
export const hybridAI = createHybridAIService('default-user', HYBRID_CONFIGS.BALANCED);

