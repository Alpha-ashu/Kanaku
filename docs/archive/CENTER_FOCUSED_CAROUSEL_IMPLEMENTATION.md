# Center-Focused Carousel Implementation Guide

## Overview
The Accounts page has been refactored to feature a **Center-Focused Carousel** with **Scroll-to-Sync** functionality, replacing the previous static grid. This creates a more engaging, mobile-like experience with automatic Transaction History filtering.

---

## Visual Hierarchy Implementation

### Active State (Center Card)
- **Scale**: 100% (1.0x)
- **Opacity**: 100% (1.0)
- **Visual Indicators**:
  - Ring effect: 4px ring with `ring-black/5`
  - Enhanced shadow: `shadow-xl`
  - Icon background: Black with white icon

### Inactive State (Side Cards)
- **Scale**: 90% (0.9x)
- **Opacity**: 50% (0.5) - Creates faded appearance for depth
- **Visual Indicators**:
  - Reduced shadow
  - Gray icon background (`bg-gray-50`)
  - Subtle border

### CSS Transitions
All scale and opacity changes use smooth transitions:
```css
transition: all 0.3s ease-in-out;
```

This applies to both CSS and JavaScript-based animations:
- Cards smoothly scale as they move toward/away from center
- Opacity fades in/out during scroll
- "ACTIVE" badge animates in/out with bounce effect

---

## Technical Implementation Details

### 1. Snap Alignment (Scroll-Snap-Type)

**Container CSS Properties**:
```tsx
className="flex gap-4 overflow-x-auto pb-8 px-[20%] snap-x snap-mandatory scrollbar-hide"
style={{
  scrollBehavior: 'smooth',
  scrollSnapType: 'x mandatory',
}}
```

**Individual Card Properties**:
```tsx
style={{
  scrollSnapAlign: 'center',
  scrollSnapStop: 'always',
}}
```

**Why This Approach**:
- **snap-mandatory**: Forces cards to snap to center when scrolling stops
- **scroll-snap-align: center**: Each card centers itself in the viewport
- **scroll-snap-stop: always**: Ensures no card is skipped during fast scrolls
- **scrollBehavior: 'smooth'**: Provides smooth scrolling animation

---

### 2. Active Index Tracking (Scroll-to-Sync)

The carousel uses a **scroll listener** to detect which card is closest to the center:

```tsx
useEffect(() => {
  const handleCarouselScroll = () => {
    const carouselRect = carousel.getBoundingClientRect();
    const carouselCenter = carouselRect.left + carouselRect.width / 2;

    let closestCard: { id: number; distance: number } | null = null;

    accounts.forEach((account) => {
      const cardEl = cardRefs.current[account.id!];
      if (!cardEl) return;

      const cardRect = cardEl.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - carouselCenter);

      if (!closestCard || distance < closestCard.distance) {
        closestCard = { id: account.id!, distance };
      }
    });

    if (closestCard && closestCard.id !== selectedAccountId) {
      setSelectedAccountId(closestCard.id);
    }
  };

  carousel.addEventListener('scroll', handleCarouselScroll);
  setTimeout(handleCarouselScroll, 100); // Initial check

  return () => {
    carousel.removeEventListener('scroll', handleCarouselScroll);
  };
}, [accounts, selectedAccountId]);
```

**How It Works**:
1. Calculates the center point of the carousel container
2. Iterates through all cards and calculates their center points
3. Finds the card closest to the carousel center
4. Updates `selectedAccountId` when the closest card changes
5. Initial check happens 100ms after mount to ensure proper detection

---

### 3. Dynamic Filtering (Transaction History)

The Transaction History automatically subscribes to the carousel's active index:

```tsx
const selectedAccount = accounts.find(a => a.id === selectedAccountId);
const accountTransactions = useMemo(() => {
  if (!selectedAccountId) return [];
  return transactions.filter(t => t.accountId === selectedAccountId);
}, [transactions, selectedAccountId]);
```

**Subscription Pattern**:
- `useMemo` depends on `selectedAccountId`
- When `selectedAccountId` changes (during scroll), the memo recalculates
- Transaction History re-renders with filtered data automatically
- No page refresh needed

---

### 4. Visual Polish

#### Scale and Opacity Transitions
Each card is wrapped in a div with inline styles:
```tsx
<div
  style={{
    transition: 'all 0.3s ease-in-out',
    transform: isActive ? 'scale(1)' : 'scale(0.9)',
    opacity: isActive ? 1 : 0.5,
  }}
>
```

#### Active Badge Animation
The "ACTIVE" badge uses Framer Motion for entrance animation:
```tsx
{isActive && (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    className="bg-black text-white text-[10px] font-bold px-2 py-1 rounded-full"
  >
    ACTIVE
  </motion.div>
)}
```

#### Transaction History Animation
The entire Transaction History section animates in when a card is selected:
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
  className="mt-4 max-w-5xl mx-auto"
>
```

---

## Design Layout

### Desktop Layout (Hidden on Mobile/Tablet)
```

                   TOTAL BALANCE                         
                    27,740.00                           
              5 Active Accounts                          



                CENTER-FOCUSED CAROUSEL                  
                                                         
     [Physical Wallet]  [Apple Cash]  [Chase Card]      
       (Faded 50%)      (Bright 100%)   (Faded 50%)     
         90% scale        100% scale      90% scale      
                                                         
  User swipes left/right  Cards snap to center         



              TRANSACTION HISTORY                        
              for Apple Cash                            
                                                         
  DATE    DESCRIPTION    CATEGORY    AMOUNT         
     
                                                     

```

### Mobile Layout (Vertical Accordion)
- Mobile users see a vertical accordion instead of the carousel
- Each account accordion expands to show its transaction history
- No carousel needed due to screen constraints

---

## State Management

### Key State Variables
```tsx
const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
const carouselRef = useRef<HTMLDivElement>(null);
const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
```

### Active Account Resolution
```tsx
const selectedAccount = accounts.find(a => a.id === selectedAccountId);
const isActive = selectedAccountId === account.id; // For each card
```

### Transaction Filtering
```tsx
const accountTransactions = useMemo(() => {
  if (!selectedAccountId) return [];
  return transactions.filter(t => t.accountId === selectedAccountId);
}, [transactions, selectedAccountId]);
```

---

## Implementation Checklist 

| Feature | Technical Requirement | Status |
|---------|----------------------|--------|
| **Snap Alignment** | `scroll-snap-type: x mandatory` with `scroll-snap-align: center` |  Complete |
| **Center Card Scale** | 100% scale, 100% opacity when centered |  Complete |
| **Side Card Scale** | 90% scale, 50% opacity when not centered |  Complete |
| **Active Index Tracking** | Scroll listener detecting closest-to-center card |  Complete |
| **Transaction Filtering** | Auto-filter based on active index via `useMemo` |  Complete |
| **Smooth Transitions** | `transition: all 0.3s ease-in-out` on scale/opacity |  Complete |
| **Snap Stop** | `scroll-snap-stop: always` prevents skipped cards |  Complete |
| **Initial Detection** | 100ms timeout for proper initial active card detection |  Complete |
| **Active Badge Animation** | Framer Motion entrance/exit animation |  Complete |
| **Transaction History Animation** | Slide-up animation when account is selected |  Complete |

---

## Browser Compatibility

### CSS Scroll Snap Support
-  Chrome 69+
-  Firefox 68+
-  Safari 15+
-  Edge 79+

### Fallback Behavior
- JavaScript scroll listener provides reliable center detection even if scroll-snap isn't fully supported
- Smooth scrolling is progressive enhancement

---

## Performance Considerations

### Optimizations
1. **useRef for DOM nodes**: Avoids re-renders when storing card references
2. **useMemo for transactions**: Only recalculates when `selectedAccountId` or `transactions` change
3. **useEffect with cleanup**: Removes scroll listener on unmount
4. **Window.requestAnimationFrame** implicit in CSS transitions: Ensures smooth 60fps animations

### Performance Metrics
- Scroll listener debounced naturally by browser scroll event frequency
- Initial detection (100ms) deferred to next event loop, preventing mount blocking
- CSS transitions handled by browser GPU acceleration

---

## Future Enhancement Opportunities

1. **Keyboard Navigation**: Add arrow key support to move between cards
2. **Touch Indicators**: Visual indicators (dots) showing position in carousel
3. **Embla Carousel Integration**: If more advanced features needed (e.g., custom easing, drag resistance)
4. **Gesture Support**: Native mobile swipe detection with haptic feedback
5. **Pagination**: Show "Card X of Y" indicator
6. **Pre-Loading**: Eagerly load transaction history for adjacent cards on scroll

---

## Testing Checklist

### Functionality Tests
- [ ] Scroll carousel and verify active card detection
- [ ] Verify Transaction History updates as you scroll
- [ ] Check that "ACTIVE" badge appears only on centered card
- [ ] Verify mobile accordion still works on smaller screens
- [ ] Test with 1, 5, 10+ accounts

### Visual Tests
- [ ] Side cards appear faded (50% opacity) and scaled (90%)
- [ ] Center card is bright (100% opacity) and full scale
- [ ] Smooth transitions during scroll
- [ ] Active badge animates in/out smoothly
- [ ] Transaction History slides up when card becomes active

### Edge Cases
- [ ] No accounts (verify placeholder works)
- [ ] Single account (verify it stays centered)
- [ ] Deleted account (verify active selection updates)
- [ ] Rapid scrolling (verify no breaking behavior)
- [ ] Empty transaction list (verify "No transactions" message)

---

## Code Location
**File**: `frontend/src/app/components/Accounts.tsx`

**Key Changes**:
- Added `useRef` hooks for carousel and card references
- Added `useEffect` hook for scroll-to-sync detection
- Refactored desktop carousel section with scroll-snap CSS
- Implemented dynamic scale/opacity based on `isActive` state
- Transaction History remains animated below carousel

