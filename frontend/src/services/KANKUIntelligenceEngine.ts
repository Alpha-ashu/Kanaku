export interface AIMerchantPattern {
  merchant: string;
  category: string;
  confidence: number;
  occurrences: number;
  lastSeen: string;
  userId: string;
}

export interface AILearningData {
  userId: string;
  merchant: string;
  category: string;
  confidence: number;
  feedback?: 'positive' | 'negative';
  timestamp: string;
  source: 'ocr' | 'voice' | 'manual';
}

export interface AIPrediction {
  id: string;
  userId: string;
  inputType: 'ocr' | 'voice';
  inputData: string;
  prediction: {
    merchant?: string;
    category?: string;
    amount?: number;
    date?: string;
  };
  confidence: number;
  actual?: any; // What user actually entered
  feedback?: 'correct' | 'incorrect';
  timestamp: string;
}

class KANAKUIntelligenceEngine {
  private merchantPatterns: Map<string, AIMerchantPattern[]> = new Map();
  private learningData: AILearningData[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(' Initializing KANAKUIntelligence Engine...');

    // Load learning data from localStorage (privacy-first - client-side only)
    await this.loadLearningData();
    await this.loadMerchantPatterns();

    this.initialized = true;
    console.log(' KANAKUIntelligence Engine Ready');
  }

  //  CORE AI LOGIC - This is the important layer!
  async extractExpenseData(
    rawText: string,
    source: 'ocr' | 'voice',
    userId: string
  ): Promise<{
    amount?: number;
    merchant?: string;
    date?: string;
    category?: string;
    confidence: number;
  }> {
    console.log(` Extracting expense data from ${source}...`);

    const result = {
      amount: this.extractAmount(rawText),
      merchant: this.extractMerchant(rawText),
      date: this.extractDate(rawText),
      category: undefined as string | undefined,
      confidence: 0.5,
    };

    //  AI LEARNING: Apply learned patterns
    if (result.merchant) {
      const learnedCategory = await this.predictCategory(result.merchant, userId);
      if (learnedCategory) {
        result.category = learnedCategory.category;
        result.confidence = Math.max(result.confidence, learnedCategory.confidence);
        console.log(` Applied learned category: ${learnedCategory.category} (${(learnedCategory.confidence * 100).toFixed(1)}%)`);
      }
    }

    // Fallback category detection
    if (!result.category) {
      result.category = this.classifyCategory(rawText);
      result.confidence *= 0.7; // Lower confidence for fallback
    }

    // Store learning data
    await this.storeLearningData({
      userId,
      merchant: result.merchant || 'Unknown',
      category: result.category || 'Others',
      confidence: result.confidence,
      timestamp: new Date().toISOString(),
      source,
    });

    console.log(' Extracted data:', result);
    return result;
  }

  private extractAmount(text: string): number | undefined {
    const amountPatterns = [
      /(?:total|amount|sum|payable|due|bill|charge|spent|cost)\s*:?\s*INR?\s*([\d,]+(?:\.\d{2})?)/i,
      /INR?\s*([\d,]+(?:\.\d{2})?)\s*(?:total|amount|pay|paid)/i,
      /INR?\s*([\d,]+(?:\.\d{2})?)\s*$/i,
      /(?:rs|inr|rupees?)\s*([\d,]+(?:\.\d{2})?)/i,
      /(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rupees?|rs)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0) {
          console.log(` Amount found: INR${amount}`);
          return amount;
        }
      }
    }

    return undefined;
  }

  private extractMerchant(text: string): string | undefined {
    const knownMerchants = [
      'dominos', 'pizza hut', 'kfc', 'mcdonalds', 'burger king', 'subway', 'starbucks',
      'amazon', 'flipkart', 'myntra', 'ajio', 'snapdeal', 'nykaa',
      'swiggy', 'zomato', 'foodpanda', 'ubereats', 'doordash',
      'bigbasket', 'grofers', 'dmart', 'reliance fresh', 'more',
      'uber', 'ola', 'lyft', 'rapido',
      'pvr', 'inox', 'cineplex',
      'apollo', 'fortis', 'max healthcare',
    ];

    const lowerText = text.toLowerCase();

    // Check for known merchants first
    for (const merchant of knownMerchants) {
      if (lowerText.includes(merchant)) {
        console.log(` Known merchant found: ${merchant}`);
        return this.capitalizeWords(merchant);
      }
    }

    // Extract potential merchant from first few lines
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].toLowerCase();

      // Skip lines that are clearly not merchant names
      if (/date|time|invoice|bill|receipt|order|cash|card|payment|thank|visit|total|amount/i.test(line)) {
        continue;
      }

      // Look for capitalized words that could be merchant names
      const words = line.split(/\s+/);
      for (const word of words) {
        if (word.length >= 3 && word.length <= 25 && /^[a-z\s]+$/.test(word)) {
          console.log(` Potential merchant: ${word}`);
          return this.capitalizeWords(word);
        }
      }
    }

    return undefined;
  }

  private extractDate(text: string): string | undefined {
    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/, // DD/MM/YYYY
      /(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/, // YYYY/MM/DD
      /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i, // DD Month YYYY
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        let date: Date;

        if (match.length === 4) {
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

  private classifyCategory(text: string): string {
    const categories = {
      'Food & Dining': ['food', 'dinner', 'lunch', 'breakfast', 'restaurant', 'cafe', 'pizza', 'burger', 'swiggy', 'zomato', 'dominos', 'kfc'],
      'Transportation': ['uber', 'ola', 'taxi', 'cab', 'auto', 'metro', 'bus', 'train', 'petrol', 'fuel', 'parking'],
      'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'shopping', 'store', 'mall', 'clothes', 'shoes'],
      'Entertainment': ['movie', 'netflix', 'spotify', 'prime', 'pvr', 'inox', 'concert', 'show'],
      'Bills & Utilities': ['electricity', 'water', 'gas', 'phone', 'internet', 'recharge', 'bill'],
      'Healthcare': ['doctor', 'medicine', 'hospital', 'pharmacy', 'medical', 'health'],
      'Education': ['fees', 'course', 'books', 'tuition', 'school', 'college'],
    };

    const lowerText = text.toLowerCase();

    for (const [category, keywords] of Object.entries(categories)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          console.log(` Category classified: ${category}`);
          return category;
        }
      }
    }

    return 'Others';
  }

  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, char => char.toUpperCase());
  }

  //  AI LEARNING SYSTEM
  async predictCategory(merchant: string, userId: string): Promise<AIMerchantPattern | null> {
    const normalizedMerchant = merchant.toLowerCase().trim();
    const patterns = this.merchantPatterns.get(userId) || [];

    // Look for exact or partial matches
    for (const pattern of patterns) {
      if (pattern.merchant.toLowerCase().includes(normalizedMerchant) ||
        normalizedMerchant.includes(pattern.merchant.toLowerCase())) {
        return pattern;
      }
    }

    return null;
  }

  async learnFromFeedback(
    userId: string,
    merchant: string,
    correctCategory: string,
    predictedCategory?: string,
    feedback: 'positive' | 'negative' = 'positive'
  ): Promise<void> {
    const normalizedMerchant = merchant.toLowerCase().trim();
    let patterns = this.merchantPatterns.get(userId) || [];

    const existingPattern = patterns.find(p =>
      p.merchant.toLowerCase() === normalizedMerchant
    );

    if (existingPattern) {
      // Update existing pattern
      if (feedback === 'positive') {
        existingPattern.confidence = Math.min(0.95, existingPattern.confidence + 0.1);
        existingPattern.category = correctCategory;
      } else {
        existingPattern.confidence = Math.max(0.1, existingPattern.confidence - 0.2);
      }
      existingPattern.occurrences++;
      existingPattern.lastSeen = new Date().toISOString();
    } else {
      // Create new pattern
      patterns.push({
        merchant: normalizedMerchant,
        category: correctCategory,
        confidence: feedback === 'positive' ? 0.7 : 0.3,
        occurrences: 1,
        lastSeen: new Date().toISOString(),
        userId,
      });
    }

    this.merchantPatterns.set(userId, patterns);
    await this.saveMerchantPatterns();

    console.log(` Learned: ${merchant}  ${correctCategory} (${feedback})`);
  }

  private async storeLearningData(data: AILearningData): Promise<void> {
    this.learningData.push(data);

    // Keep only last 1000 entries per user for privacy
    const userEntries = this.learningData.filter(d => d.userId === data.userId);
    if (userEntries.length > 1000) {
      this.learningData = [
        ...this.learningData.filter(d => d.userId !== data.userId),
        ...userEntries.slice(-1000)
      ];
    }

    await this.saveLearningData();
  }

  private async loadLearningData(): Promise<void> {
    try {
      const stored = localStorage.getItem('KANAKU_learning_data');
      if (stored) {
        this.learningData = JSON.parse(stored);
        console.log(` Loaded ${this.learningData.length} learning entries`);
      }
    } catch (error) {
      console.error('Failed to load learning data:', error);
    }
  }

  private async saveLearningData(): Promise<void> {
    try {
      localStorage.setItem('KANAKU_learning_data', JSON.stringify(this.learningData));
    } catch (error) {
      console.error('Failed to save learning data:', error);
    }
  }

  private async loadMerchantPatterns(): Promise<void> {
    try {
      const stored = localStorage.getItem('KANAKU_merchant_patterns');
      if (stored) {
        const patterns = JSON.parse(stored);
        patterns.forEach((pattern: AIMerchantPattern) => {
          const userPatterns = this.merchantPatterns.get(pattern.userId) || [];
          userPatterns.push(pattern);
          this.merchantPatterns.set(pattern.userId, userPatterns);
        });
        console.log(` Loaded merchant patterns for ${this.merchantPatterns.size} users`);
      }
    } catch (error) {
      console.error('Failed to load merchant patterns:', error);
    }
  }

  private async saveMerchantPatterns(): Promise<void> {
    try {
      const allPatterns: AIMerchantPattern[] = [];
      this.merchantPatterns.forEach(patterns => {
        allPatterns.push(...patterns);
      });
      localStorage.setItem('KANAKU_merchant_patterns', JSON.stringify(allPatterns));
    } catch (error) {
      console.error('Failed to save merchant patterns:', error);
    }
  }

  // Admin-only analytics (privacy-first)
  getAnalytics(userId?: string) {
    if (userId) {
      return {
        userPatterns: this.merchantPatterns.get(userId) || [],
        userLearningData: this.learningData.filter(d => d.userId === userId),
      };
    }

    // Global analytics (aggregated, no personal data)
    const totalPatterns = Array.from(this.merchantPatterns.values()).flat();
    const categoryCounts = totalPatterns.reduce((acc, pattern) => {
      acc[pattern.category] = (acc[pattern.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalUsers: this.merchantPatterns.size,
      totalPatterns: totalPatterns.length,
      categoryDistribution: categoryCounts,
      averageConfidence: totalPatterns.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns.length,
    };
  }
}

// Singleton instance
export const KANAKUAI = new KANAKUIntelligenceEngine();

// Auto-initialize on module load
KANAKUAI.initialize().catch(console.error);

