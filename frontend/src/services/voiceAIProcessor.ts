import { KANAKUAI } from './KANAKUIntelligenceEngine';
import { parseMultipleTransactions, parseVoiceExpense } from '@/lib/voiceExpenseParser';

export interface VoiceExpenseResult {
  amount?: number;
  category?: string;
  description: string;
  confidence: number;
  merchant?: string;
  date?: string;
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface ISpeechRecognition extends EventTarget {
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

class VoiceAIProcessor {
  private recognition: ISpeechRecognition | null = null;
  private isListening = false;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.initializeSpeechRecognition();
  }

  private initializeSpeechRecognition(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn(' Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();

    //  Optimized settings for expense recognition
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
  }

  //  CORE VOICE AI LOGIC
  async processVoiceInput(audioFile?: File): Promise<VoiceExpenseResult[]> {
    console.log(' Processing voice input...');

    if (audioFile) {
      // Process audio file (future enhancement with Vosk)
      return this.processAudioFile(audioFile);
    } else {
      // Use live speech recognition
      return this.startLiveRecognition();
    }
  }

  async startLiveRecognition(): Promise<VoiceExpenseResult[]> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not available'));
        return;
      }

      if (this.isListening) {
        reject(new Error('Already listening'));
        return;
      }

      console.log(' Starting voice recognition...');
      this.isListening = true;

      let finalTranscript = '';
      let interimTranscript = '';

      this.recognition.onresult = async (event: SpeechRecognitionEvent) => {
        interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];

          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' ';
            console.log(` Final transcript: ${result[0].transcript}`);
          } else {
            interimTranscript += result[0].transcript;
            console.log(` Interim: ${result[0].transcript}`);
          }
        }

        // Wait until recognition ends so multi-command input is parsed as one complete transcript.
        if (finalTranscript.trim().length > 10) {
          console.log(' Voice transcript updated:', finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event) => {
        console.error(' Speech recognition error:', event);
        this.isListening = false;
        reject(new Error('Speech recognition failed'));
      };

      this.recognition.onend = () => {
        console.log(' Speech recognition ended');
        this.isListening = false;

        // Process final transcript if available
        if (finalTranscript.trim()) {
          this.parseVoiceExpenses(finalTranscript.trim())
            .then(results => {
              if (results.length > 0) {
                resolve(results);
              } else {
                reject(new Error('No expense detected in voice input'));
              }
            })
            .catch(reject);
        } else {
          reject(new Error('No speech detected'));
        }
      };

      this.recognition.start();
    });
  }

  private async processAudioFile(audioFile: File): Promise<VoiceExpenseResult[]> {
    console.log(' Processing voice file input...');

    const isTranscriptLike = audioFile.type.startsWith('text/')
      || /json/i.test(audioFile.type)
      || /\.(txt|json|md)$/i.test(audioFile.name);

    if (!isTranscriptLike) {
      throw new Error('Offline audio transcription is not available yet. Use live voice input or upload a transcript file.');
    }

    const rawContent = await audioFile.text();
    if (!rawContent.trim()) return [];

    let transcript = rawContent.trim();
    if (/json/i.test(audioFile.type) || /\.json$/i.test(audioFile.name)) {
      try {
        const parsed = JSON.parse(rawContent) as { transcript?: string; transcripts?: string[] };
        if (typeof parsed.transcript === 'string' && parsed.transcript.trim()) {
          transcript = parsed.transcript.trim();
        } else if (Array.isArray(parsed.transcripts) && parsed.transcripts.length > 0) {
          transcript = parsed.transcripts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ').trim();
        }
      } catch {
        // Fall back to treating the uploaded file as raw transcript text.
      }
    }

    return this.parseVoiceExpenses(transcript);
  }

  //  VOICE EXPENSE PARSING - This is the important layer!
  private async parseVoiceExpenses(transcript: string): Promise<VoiceExpenseResult[]> {
    console.log(` Parsing voice expenses: "${transcript}"`);

    const parsedTransactions = parseMultipleTransactions(transcript);
    const baseResults = parsedTransactions.length > 0
      ? parsedTransactions
      : (() => {
        const single = parseVoiceExpense(transcript);
        return single.amount ? [single] : [];
      })();

    const results: VoiceExpenseResult[] = [];

    for (const parsedEntry of baseResults) {
      const description = parsedEntry.description || transcript;
      const result: VoiceExpenseResult = {
        amount: parsedEntry.amount ?? undefined,
        category: parsedEntry.category ?? undefined,
        description,
        confidence: 0.58,
        merchant: this.extractMerchant(description),
        date: this.extractDate(description),
      };

      const aiResult = await KANAKUAI.extractExpenseData(description, 'voice', this.userId);
      result.category = result.category || aiResult.category;
      result.confidence = Math.max(result.confidence, aiResult.confidence);

      if (!result.amount && aiResult.amount) result.amount = aiResult.amount;
      if (!result.merchant && aiResult.merchant) result.merchant = aiResult.merchant;
      if (!result.date && aiResult.date) result.date = aiResult.date;

      if (result.amount) {
        results.push(result);
      }
    }

    return results;
  }

  private splitIntoExpenseChunks(transcript: string): string[] {
    // Split on common separators
    const separators = [' and ', ' also ', ' plus ', ' with ', ' then ', ' next ', ',', ';'];

    let chunks = [transcript];

    for (const separator of separators) {
      chunks = chunks.flatMap(chunk => chunk.split(separator));
    }

    return chunks
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 3);
  }

  private async parseSingleExpense(chunk: string): Promise<VoiceExpenseResult | null> {
    console.log(` Parsing expense chunk: "${chunk}"`);

    const result: VoiceExpenseResult = {
      description: chunk,
      confidence: 0.5,
    };

    // Extract amount with multiple patterns
    result.amount = this.extractAmount(chunk);

    // Extract merchant
    result.merchant = this.extractMerchant(chunk);

    // Extract date
    result.date = this.extractDate(chunk);

    //  Use KANAKUAI for intelligent categorization
    const aiResult = await KANAKUAI.extractExpenseData(chunk, 'voice', this.userId);

    result.category = aiResult.category;
    result.confidence = Math.max(result.confidence, aiResult.confidence);

    // Override with extracted values if AI didn't find them
    if (!result.amount && aiResult.amount) result.amount = aiResult.amount;
    if (!result.merchant && aiResult.merchant) result.merchant = aiResult.merchant;
    if (!result.date && aiResult.date) result.date = aiResult.date;

    // Validate we have at least an amount
    if (!result.amount) {
      console.log(' No amount found in chunk');
      return null;
    }

    console.log(' Parsed expense:', result);
    return result;
  }

  private extractAmount(text: string): number | undefined {
    const amountPatterns = [
      // Direct currency patterns
      /(?:spent|paid|cost|price|amount|rupees?|rs|INR)\s*([\d,]+(?:\.\d{2})?)/i,
      /([\d,]+(?:\.\d{2})?)\s*(?:rupees?|rs|INR)/i,
      // Number words
      /(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|crore)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1]) {
          // Numeric amount
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0) {
            console.log(` Amount found: INR${amount}`);
            return amount;
          }
        } else {
          // Word amount - convert to number
          const wordAmount = this.wordsToNumber(match[0]);
          if (wordAmount && wordAmount > 0) {
            console.log(` Amount found from words: INR${wordAmount}`);
            return wordAmount;
          }
        }
      }
    }

    return undefined;
  }

  private extractMerchant(text: string): string | undefined {
    const merchantPatterns = [
      // Common merchants
      /(dominos?|pizza hut|kfc|mcdonalds?|burger king|subway|starbucks)/i,
      /(amazon|flipkart|myntra|ajio|snapdeal|nykaa)/i,
      /(swiggy|zomato|foodpanda|ubereats|doordash)/i,
      /(uber|ola|lyft|rapido)/i,
      /(pvr|inox|cineplex)/i,
    ];

    const lowerText = text.toLowerCase();

    for (const pattern of merchantPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        const merchant = this.capitalizeWords(match[0]);
        console.log(` Merchant found: ${merchant}`);
        return merchant;
      }
    }

    // Look for "at [merchant]" or "from [merchant]" patterns
    const locationPatterns = [
      /(?:at|from|in)\s+([a-z\s]{3,25})/i,
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        const merchant = this.capitalizeWords(match[1].trim());
        if (!this.isCommonWord(merchant)) {
          console.log(` Merchant found from location: ${merchant}`);
          return merchant;
        }
      }
    }

    return undefined;
  }

  private extractDate(text: string): string | undefined {
    const datePatterns = [
      /(?:today|yesterday|tomorrow)/i,
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        let date: Date;

        if (match[0].toLowerCase() === 'today') {
          date = new Date();
        } else if (match[0].toLowerCase() === 'yesterday') {
          date = new Date(Date.now() - 24 * 60 * 60 * 1000);
        } else if (match[0].toLowerCase() === 'tomorrow') {
          date = new Date(Date.now() + 24 * 60 * 60 * 1000);
        } else if (match.length === 4) {
          const [_, day, month, year] = match;
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          const [_, day, monthStr, year] = match;
          const month = new Date(`${monthStr} 1, 2000`).getMonth();
          date = new Date(parseInt(year), month, parseInt(day));
        }

        if (!isNaN(date.getTime())) {
          const formattedDate = date.toISOString().split('T')[0];
          console.log(` Date found: ${formattedDate}`);
          return formattedDate;
        }
      }
    }

    return undefined;
  }

  private wordsToNumber(text: string): number | null {
    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
      eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
      seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, lakh: 100000, crore: 10000000
    };

    const lowerText = text.toLowerCase();
    let total = 0;
    let current = 0;

    for (const word of lowerText.split(/\s+/)) {
      if (words[word] !== undefined) {
        if (words[word] >= 100) {
          current = (current || 1) * words[word];
        } else {
          current += words[word];
        }
      }
    }

    return current || null;
  }

  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'food', 'lunch', 'dinner', 'breakfast', 'movie', 'ticket', 'bill', 'payment'
    ];
    return commonWords.includes(word.toLowerCase());
  }

  // Public methods for UI integration
  startListening(): Promise<VoiceExpenseResult[]> {
    return this.startLiveRecognition();
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  //  LEARNING FROM USER FEEDBACK
  async learnFromFeedback(
    originalTranscript: string,
    correctedExpense: any,
    feedback: 'positive' | 'negative' = 'positive'
  ): Promise<void> {
    console.log(` Learning from feedback: ${feedback}`);

    // Extract merchant from corrected data for learning
    if (correctedExpense.merchant || correctedExpense.description) {
      const merchant = correctedExpense.merchant || correctedExpense.description;
      const category = correctedExpense.category;

      if (merchant && category) {
        await KANAKUAI.learnFromFeedback(
          this.userId,
          merchant,
          category,
          undefined,
          feedback
        );
      }
    }
  }
}

// Factory function
export function createVoiceAIProcessor(userId: string): VoiceAIProcessor {
  return new VoiceAIProcessor(userId);
}

// Export singleton for global use
export const voiceAI = new VoiceAIProcessor('default-user');

