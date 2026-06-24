import { describe, expect, it } from 'vitest';
import { RECEIPT_OCR_SAMPLES } from '@/services/__fixtures__/receiptOcrSamples';
import { IndianRestaurantStrategy } from './indianRestaurantStrategy';

describe('IndianRestaurantStrategy', () => {
  it('parses restaurant header, GST tax split, and wrapped item names', () => {
    const strategy = new IndianRestaurantStrategy();

    const result = strategy.parse(RECEIPT_OCR_SAMPLES.caravanMenuRestaurant);

    expect(result?.merchantName).toBe('CARAVAN MENU');
    expect(result?.amount).toBe(10949.4);
    expect(result?.subtotal).toBe(10428);
    expect(result?.taxAmount).toBe(521.4);
    expect(result?.invoiceNumber).toBe('12827');
    expect(result?.category).toBe('Food & Dining');
    expect(result?.time).toBe('09:18 PM');
    expect(result?.items?.[0]?.name).toBe('SPICY MANGOLA');
    expect(result?.items?.some((item) => item.name.includes('STRAWBERRY & BASIL MOJITO'))).toBe(true);
  });
});
