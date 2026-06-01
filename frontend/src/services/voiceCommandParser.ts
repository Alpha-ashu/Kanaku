export interface ParsedTransaction {
  description: string;
  amount: number;
  category: string;
  type: 'expense' | 'income';
}

export interface ParsedGroupExpense {
  description: string;
  totalAmount: number;
  location?: string;
  friends: string[];
  splitType: 'equal' | 'itemized' | 'custom';
  type: 'group-expense';
}

export interface ParsedVoiceCommand {
  transactions: ParsedTransaction[];
  groupExpenses: ParsedGroupExpense[];
  rawText: string;
}

const CATEGORY_KEYWORDS = {
  food: ['dinner', 'lunch', 'breakfast', 'meal', 'eat', 'food', 'restaurant', 'cafe', 'coffee', 'snack', 'pizza', 'burger', 'biryani', 'dosa'],
  transport: ['petrol', 'fuel', 'car', 'bike', 'auto', 'taxi', 'uber', 'ola', 'ride', 'gas', 'charging', 'parking', 'toll', 'travel'],
  utilities: ['mobile', 'recharge', 'electricity', 'water', 'internet', 'phone', 'bill', 'subscription'],
  shopping: ['buy', 'purchase', 'clothes', 'shopping', 'dress', 'shoes', 'retail', 'store', 'mall'],
  entertainment: ['movie', 'entertainment', 'movie ticket', 'show', 'game', 'concert', 'music'],
  investment: ['investment', 'invest', 'gold', 'stocks', 'bitcoin', 'crypto', 'mutual', 'fund', 'share', 'property', 'real estate'],
  health: ['medical', 'doctor', 'medicine', 'hospital', 'health', 'pharmacy', 'clinic'],
  education: ['education', 'course', 'school', 'college', 'training', 'tuition', 'book'],
  housing: ['rent', 'house', 'apartment', 'housing'],
};

const FRIEND_KEYWORDS = ['with', 'and', 'along with', 'including', 'invite'];
const GROUP_TRIP_KEYWORDS = ['trip', 'vacation', 'travel', 'journey', 'outing', 'weekend', 'holiday'];

export class VoiceCommandParser {
  /**
   * Parse natural language voice commands into structured transactions and expenses
   * Examples:
   *   "I spend on dinner 3456" -> Transaction: dinner, 3456
   *   "I petrol my car 2239" -> Transaction: petrol, 2239
   *   "start group trip to bali with jijo and arun and preethi and amala which will cost 50000"
   *     -> GroupExpense: bali trip, 50000, friends: [jijo, arun, preethi, amala]
   */
  parse(voiceText: string): ParsedVoiceCommand {
    const transactions: ParsedTransaction[] = [];
    const groupExpenses: ParsedGroupExpense[] = [];

    const normalizedText = voiceText.toLowerCase().trim();

    // Check for group trip/expense pattern first
    const groupExpenseMatch = this.extractGroupExpense(normalizedText);
    if (groupExpenseMatch) {
      groupExpenses.push(groupExpenseMatch);
    } else {
      // Extract individual transactions
      const extractedTransactions = this.extractTransactions(normalizedText);
      transactions.push(...extractedTransactions);
    }

    return {
      transactions,
      groupExpenses,
      rawText: voiceText,
    };
  }

  private extractGroupExpense(text: string): ParsedGroupExpense | null {
    // Check if this is a group trip/expense
    const hasGroupKeyword = GROUP_TRIP_KEYWORDS.some((keyword) => text.includes(keyword));
    if (!hasGroupKeyword) return null;

    let description = '';
    let location = '';
    let totalAmount = 0;
    const friends: string[] = [];

    // Extract location (usually after "to")
    const locationMatch = text.match(/(?:to|in)\s+([a-z\s]+?)(?:\s+with|\s+and|which|that|will|cost)/i);
    if (locationMatch) {
      location = locationMatch[1].trim();
      description = `Trip to ${location}`;
    } else {
      description = 'Group trip';
    }

    // Extract friends (pattern: "with name and name and name" or "with name, name, name")
    const friendsPattern = /(?:with|including)\s+(.+?)(?:\s+which|\s+that|\s+will|\s+cost|$)/i;
    const friendsMatch = text.match(friendsPattern);
    if (friendsMatch) {
      const friendsList = friendsMatch[1]
        .split(/\s+and\s+|,\s+/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0 && !name.match(/\d+/)); // Filter out numbers

      friends.push(...friendsList);
    }

    // Extract total amount (pattern: "cost 50000" or "50000")
    const amountPattern = /(?:cost|costs|amount|will be|total)\s+(\d+(?:\.\d{2})?)/i;
    const amountMatch = text.match(amountPattern);
    if (amountMatch) {
      totalAmount = parseFloat(amountMatch[1]);
    } else {
      // Try to find the last large number
      const numbers = text.match(/\d+(?:\.\d{2})?/g) || [];
      if (numbers.length > 0) {
        totalAmount = parseFloat(numbers[numbers.length - 1]);
      }
    }

    if (totalAmount > 0 && friends.length > 0) {
      return {
        description,
        totalAmount,
        location: location || undefined,
        friends,
        splitType: 'equal',
        type: 'group-expense',
      };
    }

    return null;
  }

  private extractTransactions(text: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];

    // Split by common conjunctions to handle multiple transactions
    const sentences = text.split(/(?:and\s+i\s+|but\s+i\s+|also\s+i\s+|and\s+|but\s+|also\s+)/i);

    for (const sentence of sentences) {
      const transaction = this.parseSingleTransaction(sentence.trim());
      if (transaction) {
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  private parseSingleTransaction(sentence: string): ParsedTransaction | null {
    if (!sentence.length) return null;

    let description = '';
    let amount = 0;
    let category = 'other';

    // Extract amount (look for numbers with optional decimal)
    const amountMatch = sentence.match(/(\d+(?:\.\d{2})?)/);
    if (!amountMatch) return null;

    amount = parseFloat(amountMatch[1]);

    // Determine category from keywords
    category = this.detectCategory(sentence);

    // Extract description
    // Patterns: "spend on X Y", "I X Y", "my X Y"
    const descriptionPatterns = [
      /(?:spend|spent)\s+(?:on\s+)?([a-z\s]+?)\s*\d/i,
      /(?:paid|pay)\s+(?:for\s+)?([a-z\s]+?)\s*\d/i,
      /([a-z\s]+?)\s+(?:cost|costs)\s*\d/i,
      /(?:my|the)\s+([a-z\s]+?)\s*\d/i,
      /^([a-z\s]+?)\s*\d/i,
    ];

    for (const pattern of descriptionPatterns) {
      const match = sentence.match(pattern);
      if (match) {
        description = match[1]
          .trim()
          .split(/\s+/)
          .slice(0, 5) // Limit to first 5 words
          .join(' ');
        break;
      }
    }

    // Fallback: use category as description if no specific description found
    if (!description) {
      description = category;
    }

    return {
      description,
      amount,
      category,
      type: 'expense',
    };
  }

  private detectCategory(text: string): string {
    const lowerText = text.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((keyword) => lowerText.includes(keyword))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get suggested friends list from recent transactions
   * This would typically come from the database
   */
  getSuggestedFriends(recentFriends: string[]): string[] {
    return recentFriends;
  }
}

export const voiceCommandParser = new VoiceCommandParser();
