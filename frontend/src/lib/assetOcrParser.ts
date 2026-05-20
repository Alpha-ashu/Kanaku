export interface ExtractedAssetMetadata {
  assetType?: 'gold' | 'silver' | 'platinum' | 'bronze' | 'other';
  weight?: number;          // in grams
  purity?: string;          // "24K", "22K", "18K", "916", "999", etc.
  form?: 'coin' | 'bar' | 'jewelry' | 'biscuit' | 'other';
  jewelerName?: string;
  hallmarkNumber?: string;  // BIS HUID (6-character alphanumeric)
  price?: number;           // total cost
  confidenceScore: number;  // 0 to 100
}

/**
 * Normalizes weight units to grams
 */
function normalizeToGrams(amount: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u.includes('kg') || u.includes('kilogram')) {
    return amount * 1000;
  }
  if (u.includes('oz') || u.includes('ounce')) {
    return parseFloat((amount * 31.1034768).toFixed(3));
  }
  if (u.includes('tola')) {
    return parseFloat((amount * 11.6638).toFixed(3)); // 1 Tola = 11.6638 grams in India
  }
  return amount; // default is grams
}

/**
 * Extracts metal asset metadata from raw OCR bill text using advanced regex and NLP heuristics
 */
export function extractAssetMetadata(text: string): ExtractedAssetMetadata {
  if (!text) {
    return { confidenceScore: 0 };
  }

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  let confidencePoints = 0;
  let matchesCount = 0;

  // 1. Detect Metal Type
  let assetType: 'gold' | 'silver' | 'platinum' | 'bronze' | 'other' | undefined;
  const lowercaseText = text.toLowerCase();
  
  if (lowercaseText.match(/\b(gold|kangan|bangles|necklace|ring|chain|jhumka|gold coin|22kt|24kt|huid)\b/i)) {
    assetType = 'gold';
    confidencePoints += 25;
    matchesCount++;
  } else if (lowercaseText.match(/\b(silver|payal|anklet|silver coin|chandi|925|999 silver)\b/i)) {
    assetType = 'silver';
    confidencePoints += 25;
    matchesCount++;
  } else if (lowercaseText.match(/\b(platinum|platina|pt950|pt900)\b/i)) {
    assetType = 'platinum';
    confidencePoints += 25;
    matchesCount++;
  } else if (lowercaseText.match(/\b(bronze|kansa|bell metal)\b/i)) {
    assetType = 'bronze';
    confidencePoints += 25;
    matchesCount++;
  }

  // 2. Detect Metal Form
  let form: 'coin' | 'bar' | 'jewelry' | 'biscuit' | 'other' | undefined;
  if (lowercaseText.match(/\b(ring|necklace|bangle|kangan|payal|anklet|earring|jhumka|chain|ornament|jewelry|jewellery|pendant)\b/i)) {
    form = 'jewelry';
    confidencePoints += 15;
    matchesCount++;
  } else if (lowercaseText.match(/\b(coin|coins|sikka)\b/i)) {
    form = 'coin';
    confidencePoints += 15;
    matchesCount++;
  } else if (lowercaseText.match(/\b(bar|bars|ingot)\b/i)) {
    form = 'bar';
    confidencePoints += 15;
    matchesCount++;
  } else if (lowercaseText.match(/\b(biscuit|biscuits|brick)\b/i)) {
    form = 'biscuit';
    confidencePoints += 15;
    matchesCount++;
  } else if (assetType) {
    form = 'other';
  }

  // 3. Detect Purity
  let purity: string | undefined;
  // Match 24K, 22K, 18K, 14K, 916, 999, 925, 950, etc.
  const purityRegexes = [
    /\b(24\s*k|24\s*kt|24\s*karat|999)\b/i,
    /\b(22\s*k|22\s*kt|22\s*karat|916)\b/i,
    /\b(18\s*k|18\s*kt|18\s*karat|750)\b/i,
    /\b(14\s*k|14\s*kt|14\s*karat|585)\b/i,
    /\b(925\s*sterling|925\s*silver|925)\b/i,
    /\b(pt\s*950|950\s*plat|pt950)\b/i,
  ];

  if (lowercaseText.match(purityRegexes[0])) {
    purity = '24K (999)';
    confidencePoints += 20;
    matchesCount++;
  } else if (lowercaseText.match(purityRegexes[1])) {
    purity = '22K (916)';
    confidencePoints += 20;
    matchesCount++;
  } else if (lowercaseText.match(purityRegexes[2])) {
    purity = '18K (750)';
    confidencePoints += 15;
    matchesCount++;
  } else if (lowercaseText.match(purityRegexes[3])) {
    purity = '14K (585)';
    confidencePoints += 15;
    matchesCount++;
  } else if (lowercaseText.match(purityRegexes[4])) {
    purity = '92.5% (925)';
    confidencePoints += 20;
    matchesCount++;
  } else if (lowercaseText.match(purityRegexes[5])) {
    purity = '95% (PT950)';
    confidencePoints += 20;
    matchesCount++;
  }

  // 4. Detect Weight (e.g. 10.5 g, 5 gms, 8 gram, 1 tola)
  let weight: number | undefined;
  // Look for numbers preceding weight units
  const weightRegex = /\b(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams|tola|tolas|oz|ounce|ounces|kg|kilogram|kilograms)\b/i;
  const weightMatch = lowercaseText.match(weightRegex);
  if (weightMatch) {
    const rawVal = parseFloat(weightMatch[1]);
    const unit = weightMatch[2];
    if (!isNaN(rawVal) && rawVal > 0) {
      weight = normalizeToGrams(rawVal, unit);
      confidencePoints += 20;
      matchesCount++;
    }
  } else {
    // Alternate weight match, e.g. "Net Wt: 12.450"
    const alternateWeightRegex = /\b(?:net\s*wt|gross\s*wt|weight|wt)[:\s]+(\d+(?:\.\d{2,3})?)\b/i;
    const altMatch = lowercaseText.match(alternateWeightRegex);
    if (altMatch) {
      const rawVal = parseFloat(altMatch[1]);
      if (!isNaN(rawVal) && rawVal > 0) {
        weight = rawVal; // assume grams in Indian/standard bills
        confidencePoints += 15;
        matchesCount++;
      }
    }
  }

  // 5. Detect Hallmark HUID (BIS Hallmark Unique Identification)
  // 6-digit alphanumeric code containing uppercase letters and digits (e.g. ABC123, 7D8E9F)
  let hallmarkNumber: string | undefined;
  const huidRegex = /\b(huid|huid\s*no|huid\s*code|hallmark\s*huid)[:\s]+([a-zA-Z0-9]{6})\b/i;
  const huidMatch = text.match(huidRegex);
  if (huidMatch) {
    hallmarkNumber = huidMatch[2].toUpperCase();
    confidencePoints += 20;
    matchesCount++;
  } else {
    // Direct search for isolated 6-digit alphanumeric codes if "huid" isn't explicit but exists in the context
    // BIS HUID is exactly 6 alphanumeric characters. Check for uppercase uppercase letters and numbers.
    const strictHuidRegex = /\b([A-Z0-9]{6})\b/;
    // Find all matches and check if they look like a HUID (must have at least one letter and one number to avoid basic 6-digit pure numbers or words)
    const candidates = text.match(/\b([A-Z0-9]{6})\b/g);
    if (candidates) {
      for (const cand of candidates) {
        const hasLetter = /[A-Z]/.test(cand);
        const hasDigit = /[0-9]/.test(cand);
        // Exclude standard words like "AMOUNT", "INVOIC", "TOTALS"
        const isCommonWord = ['AMOUNT', 'INVOIC', 'TOTALS', 'CHARGE', 'TAXES', 'CGST', 'SGST', 'IGST', 'RUPEES'].includes(cand);
        if (hasLetter && hasDigit && !isCommonWord) {
          hallmarkNumber = cand.toUpperCase();
          confidencePoints += 10;
          matchesCount++;
          break;
        }
      }
    }
  }

  // 6. Detect Jeweler/Shop Name
  let jewelerName: string | undefined;
  const jewelerKeywords = [
    'tanishq', 'kalyan', 'malabar', 'joyalukkas', 'senco', 'tbz', 'bhima', 'pc jeweller',
    'jewellers', 'jeweler', 'jewelry', 'jewellery', 'ornaments', 'gems', 'gold palace'
  ];
  
  // Look in the first 3 lines of the invoice (typical jeweler header)
  const headerLinesCount = Math.min(5, lines.length);
  let foundJeweler = false;
  for (let i = 0; i < headerLinesCount; i++) {
    const lineLower = lines[i].toLowerCase();
    for (const kw of jewelerKeywords) {
      if (lineLower.includes(kw)) {
        // Use the line content or clean it up
        jewelerName = lines[i].replace(/[^\w\s&.,-]/g, '').trim();
        foundJeweler = true;
        confidencePoints += 15;
        matchesCount++;
        break;
      }
    }
    if (foundJeweler) break;
  }

  // Fallback: If no explicit keyword, use the first line if it looks like a business name (not date, invoice no etc)
  if (!jewelerName && lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 3 && !firstLine.match(/(invoice|tax|date|bill|receipt|sl\s*no|cash)/i)) {
      jewelerName = firstLine.replace(/[^\w\s&.,-]/g, '').trim();
      confidencePoints += 5;
    }
  }

  // 7. Detect Total Price
  let price: number | undefined;
  // Match lines with total amount
  const priceRegex = /\b(?:total|grand\s*total|net\s*amt|net\s*payable|amount\s*due|payable)[:\s]+(?:rs\.?|inr|usd|\$)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\b/i;
  const priceMatch = lowercaseText.match(priceRegex);
  if (priceMatch) {
    const rawPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
    if (!isNaN(rawPrice) && rawPrice > 0) {
      price = rawPrice;
      confidencePoints += 20;
      matchesCount++;
    }
  } else {
    // Alternative: find the largest monetary amount in the last few lines
    const moneyRegex = /\b\d+(?:,\d{3})*(?:\.\d{2})\b/g;
    const allMoneyMatches = text.match(moneyRegex);
    if (allMoneyMatches && allMoneyMatches.length > 0) {
      const values = allMoneyMatches.map(m => parseFloat(m.replace(/,/g, ''))).filter(v => !isNaN(v));
      if (values.length > 0) {
        const maxVal = Math.max(...values);
        if (maxVal > 100) { // arbitrary threshold to avoid tax rates or quantities
          price = maxVal;
          confidencePoints += 10;
        }
      }
    }
  }

  // Calculate final bounded confidence score
  const finalConfidenceScore = Math.min(100, Math.max(0, Math.round((confidencePoints / 110) * 100)));

  return {
    assetType,
    weight,
    purity,
    form,
    jewelerName,
    hallmarkNumber,
    price,
    confidenceScore: matchesCount > 0 ? finalConfidenceScore : 0
  };
}
