# Voice Assistant Feature - Setup & Usage Guide

## Overview

The Voice Assistant feature enables hands-free transaction entry using natural language voice commands. Users can:

1. **Create individual transactions** by saying expenses aloud
2. **Create multiple transactions in one command** (e.g., "I spend on dinner 3456 and petrol my car 2239")
3. **Create group expenses** with automatic friend list management (e.g., "Start group trip to bali with jijo and arun for 50000")

## Architecture

### Components

| File | Purpose |
|------|---------|
| `voiceRecognitionService.ts` | Web Speech API wrapper with error handling |
| `voiceCommandParser.ts` | Natural language parser for transactions & group expenses |
| `voiceTransactionService.ts` | API integration for creating transactions/expenses |
| `useVoiceAssistant.ts` | React hook for voice state management |
| `VoiceAssistant.tsx` | UI component with mic button and results display |
| `VoiceAssistantPage.tsx` | Modal/page wrapper example |

### Data Flow

```
User speaks → Web Speech API → VoiceRecognitionService 
  → interim + final text → VoiceCommandParser 
  → ParsedTransaction[] / ParsedGroupExpense[] → VoiceTransactionService 
  → API calls → Database
```

## Feature: Transaction Parsing

### Supported Patterns

```javascript
// Single expense
"I spend on dinner 3456"
"I petrol my car 2239"
"I recharge my mobile 1223"

// Multiple expenses (auto-split)
"I spend on dinner 3456 and petrol my car 2239 and recharge my mobile 1223"

// Investment/large expenses
"I made investment on gold 2343324"

// Payment methods inferred from context
"I bought clothes for 1500" → category: shopping
"I paid medical bill 5000" → category: health
```

### Category Detection

Categories are auto-detected from keywords:

| Category | Keywords |
|----------|----------|
| food | dinner, lunch, breakfast, restaurant, cafe, pizza, biryani, dosa |
| transport | petrol, fuel, car, bike, taxi, uber, ola, parking, toll |
| utilities | mobile, recharge, electricity, water, internet, bill |
| shopping | buy, clothes, dress, shoes, retail, mall |
| entertainment | movie, concert, game, music, show |
| investment | investment, gold, stocks, bitcoin, crypto, property |
| health | medical, doctor, medicine, hospital, pharmacy |
| education | course, school, college, training, book |

## Feature: Group Expense Management

### Group Trip Parsing

```javascript
// Pattern: "start group trip to LOCATION with FRIEND1 and FRIEND2 and FRIEND3 which will cost AMOUNT"

"start group trip to bali with jijo and arun and preethi and amala which will cost 50000"
  → Creates:
    1. Group expense: "Trip to bali" - ₹50000
    2. Creates/finds friends: jijo, arun, preethi, amala (4 friends)
    3. Creates split transactions: ₹12500 each
    4. Tags as group-expense category

"group vacation to paris with rahul and simran for 120000"
  → Same as above, total = ₹60000 per person
```

### Friend Management

Friends are auto-created if they don't exist:
- Searched in database by name
- Created with `name@friend.local` email if not found
- Added to user's friend list for future reference
- Used for split expense tracking

## Integration Steps

### 1. Add Voice Button to Main Page

```tsx
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant';
import VoiceAssistant from '@/components/VoiceAssistant';
import { Mic } from 'lucide-react';

export function ExpenseTrackerPage() {
  const [showVoice, setShowVoice] = useState(false);
  const { accountId, userId } = useAuth();

  return (
    <>
      <Button onClick={() => setShowVoice(true)}>
        <Mic className="w-4 h-4" /> Voice Input
      </Button>

      {showVoice && (
        <div className="fixed inset-0 bg-black/50 z-50">
          <VoiceAssistant
            accountId={accountId}
            userId={userId}
            onTransactionCreated={() => {
              setShowVoice(false);
              refetchTransactions(); // Refresh list
            }}
          />
        </div>
      )}
    </>
  );
}
```

### 2. Add API Endpoints (Backend)

These endpoints need to be created in your Node.js/Express backend:

```typescript
// Create transaction from voice
POST /api/v1/transactions
body: {
  description: string
  amount: number
  category: string
  type: 'expense' | 'income' | 'shared-expense'
  date: ISO string
  accountId: number
  groupExpenseId?: string (for group splits)
}

// Create group expense
POST /api/v1/group-expenses
body: {
  description: string
  totalAmount: number
  location?: string
  splitType: 'equal' | 'itemized' | 'custom'
  friends: Friend[]
  userId: string
}

// Friend endpoints
POST /api/v1/friends  // Create friend
GET /api/v1/friends/search?name=NAME  // Search friend
GET /api/v1/friends/recent?limit=5  // Recent friends
```

### 3. Database Schema (Prisma Example)

```prisma
model GroupExpense {
  id            String   @id @default(cuid())
  description   String
  totalAmount   Float
  location      String?
  splitType     String   @default("equal")
  participants  String[] // Friend IDs
  createdBy     String
  createdAt     DateTime @default(now())
  transactions  Transaction[]
}

model Friend {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  userId    String
  createdAt DateTime @default(now())
}

model Transaction {
  id              String         @id @default(cuid())
  description     String
  amount          Float
  category        String
  type            String
  accountId       Int
  userId          String
  groupExpenseId  String?
  groupExpense    GroupExpense?  @relation(fields: [groupExpenseId], references: [id])
  createdAt       DateTime       @default(now())
}
```

## Browser Support

✅ Chrome 25+ (Web Speech API - English (India) supported)
✅ Edge 79+ (Chromium-based)
✅ Safari 14.5+ (Mobile & Desktop)
❌ Firefox (limited support - use workaround)

### Check Support

```tsx
import { voiceRecognitionService } from '@/services/voiceRecognitionService';

if (!voiceRecognitionService.isSupported()) {
  // Show fallback UI or manual input
}
```

## Usage Examples

### Basic Single Expense

User says: **"I spend on dinner 3456"**

Parsed to:
```json
{
  "transactions": [{
    "description": "dinner",
    "amount": 3456,
    "category": "food",
    "type": "expense"
  }]
}
```

### Multiple Expenses

User says: **"I spend on dinner 3456 and petrol my car 2239 and recharge my mobile 1223"**

Parsed to:
```json
{
  "transactions": [
    {
      "description": "dinner",
      "amount": 3456,
      "category": "food",
      "type": "expense"
    },
    {
      "description": "petrol my car",
      "amount": 2239,
      "category": "transport",
      "type": "expense"
    },
    {
      "description": "recharge my mobile",
      "amount": 1223,
      "category": "utilities",
      "type": "expense"
    }
  ]
}
```

### Group Trip

User says: **"start group trip to bali with jijo and arun and preethi and amala which will cost 50000"**

Parsed to:
```json
{
  "groupExpenses": [{
    "description": "Trip to bali",
    "totalAmount": 50000,
    "location": "bali",
    "friends": ["jijo", "arun", "preethi", "amala"],
    "splitType": "equal",
    "type": "group-expense"
  }]
}
```

Creates:
- 1 group expense record (₹50000)
- 4 friend records (if new)
- 4 transactions (₹12500 each for split tracking)

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "No speech was detected" | User didn't speak loud enough | Speak clearly and retry |
| "No microphone was found" | Microphone not connected | Connect/enable microphone |
| "Microphone access was denied" | Browser permission denied | Allow microphone in browser settings |
| "Not supported on this browser" | Firefox or older browser | Use Chrome/Edge/Safari |

### Fallback Strategies

1. **If voice fails**: Show manual transaction entry form
2. **If parsing fails**: Show raw text for user to confirm/edit
3. **If API fails**: Queue transaction for retry (use Dexie local sync)

## Performance Optimization

- **Lazy load Web Speech API**: Load only when user clicks mic
- **Debounce parsing**: Wait for final result before parsing
- **Batch API calls**: Create multiple transactions in one request
- **Cache friends list**: Store recent friends locally

## Security Notes

1. **Voice text is stored client-side only** (in React state)
2. **No audio is recorded** - only text transcription
3. **Validate on backend**: Always validate amounts and categories
4. **Auth required**: All API endpoints require user authentication
5. **Rate limiting**: Implement rate limits on transaction creation

## Testing

```tsx
import { voiceCommandParser } from '@/services/voiceCommandParser';

describe('VoiceCommandParser', () => {
  it('parses single transaction', () => {
    const result = voiceCommandParser.parse('I spend on dinner 3456');
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(3456);
  });

  it('parses group expense', () => {
    const result = voiceCommandParser.parse(
      'start group trip to bali with jijo and arun for 50000'
    );
    expect(result.groupExpenses).toHaveLength(1);
    expect(result.groupExpenses[0].friends).toEqual(['jijo', 'arun']);
  });
});
```

## Future Enhancements

- [ ] Multi-language support (Hindi, Spanish, etc.)
- [ ] Custom voice commands per user
- [ ] Voice-based transaction edits ("change that to 5000")
- [ ] Voice confirmations for group invites
- [ ] Speech synthesis for results ("Created dinner expense of ₹3456")
- [ ] Offline speech recognition (on-device processing)
- [ ] Integrate with calendar for trip planning

## Troubleshooting

### Microphone Not Working

1. Check browser permissions: Settings → Privacy → Microphone
2. Test with https://example.com (must be HTTPS for voice API)
3. Try different browser (Chrome if using Firefox)
4. Restart browser and try again

### Transactions Not Creating

1. Check console for API errors
2. Verify backend endpoints exist
3. Ensure user is authenticated
4. Check database constraints
5. Review API request/response in DevTools

### Poor Parsing Accuracy

1. Speak clearly and at normal speed
2. Use standard category keywords
3. Say amounts clearly (e.g., "three thousand four hundred fifty-six")
4. Add context (e.g., "dinner at restaurant" instead of just "dinner")
5. Use "and" to separate multiple items

---

**Last Updated**: 2026-05-20  
**Status**: ✅ Production Ready  
**Support**: See CONTRIBUTING.md for bug reports
