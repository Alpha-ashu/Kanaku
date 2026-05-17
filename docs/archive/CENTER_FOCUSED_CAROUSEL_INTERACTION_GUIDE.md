# Center-Focused Carousel - Interaction Guide

## User Interaction Flow

### Desktop Experience

#### Initial State
```
User sees: Accounts page loads
           Default/first account becomes active (centered)
           
Visual:    

 [Physical]  [Apple Cash ]  [Chase]        Carousel
 (50%)       (100% + ACTIVE)   (50%)       
 scale:90%   scale:100%        scale:90%   
 opacity:50% opacity:100%      opacity:50% 

                      

 Transaction History for Apple Cash         
 [Transactions table appears here]          

```

#### User Swipes Right (or scrolls right)
```
Action: User swipes/scrolls carousel to the right

Step 1: During scroll

 [Apple]    [Chase ]              [Amex]  
 (scaling)  (becoming center)      (off)   
 opacity    opacity increasing              
 transitioning                              


Step 2: After scroll stops (snap alignment activates)

 [Apple]    [Chase ]            [Amex]   
 (50%)      (100% + ACTIVE)       (50%)    
 scale:90%  scale:100%            scale:90%
 opacity:50% opacity:100%         opacity:50%


Automatic: selectedAccountId updates to Chase
           Transaction History re-renders with Chase data
           
Result:

 Transaction History for Chase              
 [New transactions table loaded]            

```

#### User Swipes Left (or scrolls left)
```
Same flow but in opposite direction:
[Next Account] becomes centered
Transaction History updates automatically
```

---

## Technical Timeline

### Mount Phase
```
Timeline:
0ms    Component mounts
       carouselRef and cardRefs created
       State: selectedAccountId = null
      
100ms  useEffect callback executes
       handleCarouselScroll() runs once
       Finds first/closest card
       setSelectedAccountId(accountId)
      
~110ms  Re-render triggered
        selectedAccount becomes defined
        Transaction History appears with fade-in
        User sees initial state complete
```

### Scroll Phase
```
Timeline (for each scroll event):
0ms    User starts scrolling
       CSS scroll-snap takes over
      
~16ms  Browser fires scroll event
       handleCarouselScroll() executes
       Calculate closest card to center
      
~32ms  If different card is closest:
       setSelectedAccountId(newId)
      
~48ms  Re-render:
       Card scales/opacity update (0.3s transition)
       ACTIVE badge animates in
       Transaction History updates
      
~350ms  All animations complete
        User sees updated account details
```

### Snap Phase
```
Timeline (when scroll stops):
0ms    User lets go of scroll
       scroll-snap-type: mandatory activates
      
~300ms  Browser animates snap alignment
        Card snaps to center (smooth animation)
        handleCarouselScroll() fires again
       
~350ms  All animations complete
        Card at center is confirmed active
```

---

## Visual States

### Card States During Scroll

#### State 1: Card Moving Away (Right)
```
Transform: scale(0.9)  scale(0.95)  ...
Opacity:   0.5  0.7  ...
Motion:    Sliding right with reduced size
```

#### State 2: Card Moving Toward Center
```
Transform: scale(0.9)  scale(0.95)  scale(1.0)
Opacity:   0.5  0.7  0.9  1.0
Motion:    Sliding left, growing size, increasing brightness
Duration:  ~0.3s (ease-in-out)
```

#### State 3: Card at Center (Active)
```
Transform: scale(1.0)
Opacity:   1.0
Visual Effects:
  - Ring: 4px black/5% ring
  - Shadow: shadow-xl
  - Icon: Black background with white icon
  - Badge: "ACTIVE" label appears
Status: "Subscribed" to transaction data
```

#### State 4: Card Moving Away (Left)
```
Transform: scale(1.0)  scale(0.95)  scale(0.9)
Opacity:   1.0  0.8  0.5
Motion:    Sliding left, shrinking size, fading
Duration:  ~0.3s (ease-in-out)
```

---

## Scroll-to-Sync Mechanism Detail

### How Center Detection Works

```

         CAROUSEL VIEWPORT                         
      
   [PhysicalWallet] [Apple ] [Chase]        
      
                                                   
         CENTER POINT (calculated)                
                                                  
  CarouselCenter = left + (width / 2)             


For each card:
  CardCenter = cardLeft + (cardWidth / 2)
  Distance = |CardCenter - CarouselCenter|
  
  Apple:    |1250 - 1280| = 30px   CLOSEST 
  Physical: |950 - 1280| = 330px
  Chase:    |1550 - 1280| = 270px
```

### State Update Logic
```
if (closestCard && closestCard.id !== selectedAccountId) {
  setSelectedAccountId(closestCard.id)   Triggers re-render
  
  isActive calculation happens:
  isActive = (selectedAccountId === account.id)
  
  Components update:
  - Scale changes: scale(isActive ? 1 : 0.9)
  - Opacity changes: opacity(isActive ? 1 : 0.5)
  - ACTIVE badge visibility
  - Transaction History visibility
}
```

---

## Transaction History Auto-Update

### Subscription Pattern

```tsx
// This dependency array makes Transaction History 
// automatically update when scroll changes the active account:

const accountTransactions = useMemo(() => {
  if (!selectedAccountId) return [];
  return transactions.filter(t => t.accountId === selectedAccountId);
}, [transactions, selectedAccountId]);   SUBSCRIBES TO SCROLL CHANGES

Flow:
1. User scrolls carousel
2. handleCarouselScroll() fires
3. Closest card detected
4. setSelectedAccountId(newId)   STATE CHANGES
5. useMemo dependencies change
6. accountTransactions recalculates   AUTOMATIC
7. Component re-renders
8. Transaction History shows new data   USER SEES UPDATE
9. Fade-in animation plays   VISUAL POLISH
```

---

## Edge Case Handling

### Case 1: First Mount (No Active Account)
```
Initial State:
  selectedAccountId = null
  
After 100ms:
  handleCarouselScroll() runs
  First/closest account detected
  selectedAccountId = accountId
  
Result:
  Transaction History appears with fade-in
  User sees default account selected
```

### Case 2: Single Account
```
User scrolls:
  Carousel shows single card
  Card stays centered
  handleCarouselScroll() keeps finding same card
  selectedAccountId unchanged
  No visual flashing
  
User still experiences:
  Snap alignment (smooth scrolling)
  Full interactive feel
  Transaction History always available
```

### Case 3: Account Deleted
```
Current State:
  selectedAccountId = 5 (deleted account)
  
Action: Account removed from accounts array
  
Result:
  selectedAccountId still = 5
  selectedAccount = undefined
  accountTransactions = []
  Transaction History disappears (no selectedAccount)
  
Next Scroll:
  handleCarouselScroll() runs
  Finds closest remaining account
  setSelectedAccountId() to valid account
  Transaction History reappears
```

### Case 4: Rapid Scrolling
```
User scrolls very fast:
  Scroll events fire frequently (~60x per second at 60fps)
  handleCarouselScroll() runs for each
  Closest card detection runs for each
  
Optimization:
  setState only if cardId changes
  useMemo prevents unnecessary recalculations
  CSS transitions smooth out speed
  
Result:
  Smooth visual experience
  No janky behavior
  Transaction History updates feel natural
```

---

## Mobile vs Desktop

### Desktop (> 1024px)
 Center-Focused Carousel with scroll-snap
 Scroll-to-Sync transaction filtering
 Visual hierarchy with scale/opacity
 Smooth transitions and animations

### Mobile/Tablet (< 1024px)
 Vertical accordion layout
 Click to expand accounts
 Nested transaction history
 Full-screen account details

---

## Performance Timeline

### First Interaction
```
User loads accounts page:
0ms     Page renders
100ms   Initial active account detected
110ms   Transaction History appears
300ms   All animations complete
        Total: ~300ms to fully interactive
```

### Subsequent Scrolls
```
User scrolls carousel:
0ms     Scroll event fired
~16ms   Detection completes, state updates if needed
~300ms  Animations complete
        Total: ~300ms per scroll interaction
        Perceived as instant due to CSS acceleration
```

### Memory Impact
```
cardRefs object:
  - Stores references to DOM nodes (not copies)
  - Size: O(n) where n = number of accounts
  - Impact: Negligible (<1KB for 100 accounts)

Typical: 1-20 accounts
  Memory: <1KB
  Performance: No measurable impact
```

---

## Interaction Hints for Users

### Visual Cues
- **Faded cards on sides**: "Pull me to center to see details"
- **Bright card in center**: "This account's data is displayed below"
- **ACTIVE badge**: Confirms which account is selected
- **Scale difference**: Creates sense of depth and focus

### Behavioral Cues
- **Snap alignment**: Cards "stick" to center when scroll stops
- **Smooth transitions**: Continuous visual feedback during scroll
- **Auto-updating table**: Transaction History changes as you scroll (no click needed)

### Accessibility
- Carousel uses semantic scroll events
- Keyboard users can use scroll keys
- Screen readers will announce account changes
- Transaction History updates with clear labels ("for Apple Cash")

