# Center-Focused Carousel - CSS & Styling Guide

## Core CSS Classes and Properties

### Carousel Container
```tsx
className="flex gap-4 overflow-x-auto pb-8 px-[20%] snap-x snap-mandatory scrollbar-hide"
```

**Breakdown**:
| Class | Purpose |
|-------|---------|
| `flex` | Horizontal layout for cards |
| `gap-4` | 1rem spacing between cards |
| `overflow-x-auto` | Horizontal scrolling enabled |
| `pb-8` | Bottom padding for scrollbar area |
| `px-[20%]` | 20% horizontal padding (centers first/last card) |
| `snap-x` | Scroll snap on horizontal axis |
| `snap-mandatory` | Snap behavior required (hard snap) |
| `scrollbar-hide` | Custom class to hide scrollbar |

**Inline Styles**:
```tsx
style={{
  scrollBehavior: 'smooth',        // Smooth scroll animation
  scrollSnapType: 'x mandatory',   // CSS Scroll Snap
}}
```

---

### Carousel Content Wrapper
```tsx
className="snap-center shrink-0"
style={{
  scrollSnapAlign: 'center',       // Snap alignment point
  scrollSnapStop: 'always',        // Never skip this element
}}
```

**Breakdown**:
| Style | Purpose |
|-------|---------|
| `snap-center` | Tailwind equivalent of `scroll-snap-align: center` |
| `shrink-0` | Prevents card shrinking (maintains width) |
| `scrollSnapAlign: 'center'` | Aligns card center with snap point |
| `scrollSnapStop: 'always'` | Prevents this card being skipped during scroll |

---

### Card Scaling & Opacity
```tsx
style={{
  transition: 'all 0.3s ease-in-out',
  transform: isActive ? 'scale(1)' : 'scale(0.9)',
  opacity: isActive ? 1 : 0.5,
}}
```

**Properties**:
| Property | Active | Inactive | Purpose |
|----------|--------|----------|---------|
| `transform` | `scale(1)` | `scale(0.9)` | 100% vs 90% size |
| `opacity` | `1` | `0.5` | 100% vs 50% brightness |
| `transition` | `all 0.3s ease-in-out` | Applies to both | Smooth animation |

**Customization Points**:
```tsx
// To change inactive scale:
transform: isActive ? 'scale(1)' : 'scale(0.85)'  // 85% instead of 90%

// To change inactive opacity:
opacity: isActive ? 1 : 0.4  // 40% instead of 50%

// To change animation speed:
transition: 'all 0.5s ease-in-out'  // 500ms instead of 300ms

// To change easing:
transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'  // Bouncy
```

---

### Card Component
```tsx
className={cn(
  "w-[340px] h-[200px] relative overflow-hidden flex flex-col justify-between shrink-0 transition-all duration-300",
  isActive
    ? "border-black/10 ring-4 ring-black/5 bg-white shadow-xl"
    : "border-white/40 hover:border-white/80",
  !account.isActive && "opacity-60 grayscale"
)}
```

**Dimensions**:
| Class | Value | Purpose |
|-------|-------|---------|
| `w-[340px]` | 340px width | Card width (customizable) |
| `h-[200px]` | 200px height | Card height (customizable) |

**Active State Styling**:
| Class | Purpose |
|-------|---------|
| `border-black/10` | Subtle dark border (10% opacity) |
| `ring-4` | 4px outer ring |
| `ring-black/5` | Ring is very subtle (5% opacity) |
| `bg-white` | White background |
| `shadow-xl` | Extra large shadow |

**Inactive State Styling**:
| Class | Purpose |
|-------|---------|
| `border-white/40` | White border (40% opacity) |
| `hover:border-white/80` | Brightens on hover |

**Disabled Account Styling**:
| Class | Purpose |
|-------|---------|
| `opacity-60` | Reduced visibility when inactive |
| `grayscale` | Grayscale filter |

---

### Icon Container
```tsx
className={cn(
  "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm",
  isActive ? "bg-black text-white" : "bg-gray-50 text-gray-600"
)}
```

**Transitions**:
| State | Background | Text Color |
|-------|-----------|-----------|
| Active | `bg-black` | `text-white` |
| Inactive | `bg-gray-50` | `text-gray-600` |

---

### Active Badge
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.8 }}
  className="bg-black text-white text-[10px] font-bold px-2 py-1 rounded-full"
>
  ACTIVE
</motion.div>
```

**Framer Motion States**:
| State | Opacity | Scale | Duration |
|-------|---------|-------|----------|
| initial | 0 | 0.8 | - |
| animate | 1 | 1 | ~0.3s |
| exit | 0 | 0.8 | ~0.3s |

**Styling**:
| Class | Value | Purpose |
|-------|-------|---------|
| `bg-black` | Black background | High contrast |
| `text-white` | White text | Readable on black |
| `rounded-full` | Full border-radius | Pill shape |
| `px-2 py-1` | Padding | Comfortable spacing |
| `font-bold` | 700 weight | Prominent text |
| `text-[10px]` | 10px size | Small proportion |

---

### Transaction History Section
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
  className="mt-4 max-w-5xl mx-auto"
>
```

**Motion Animation**:
| State | Opacity | Y Offset | Purpose |
|-------|---------|----------|---------|
| initial | 0 | 20px down | Off-screen, invisible |
| animate | 1 | 0 | On-screen, visible |
| exit | 0 | 20px down | Fade and slide out |

**Styling**:
| Class | Purpose |
|-------|---------|
| `mt-4` | Top margin (spacing from carousel) |
| `max-w-5xl` | Maximum width constraint |
| `mx-auto` | Centered horizontally |

---

## Customization Examples

### Example 1: Make Cards Larger
```tsx
// Change card dimensions
className="w-[400px] h-[250px]"  // From 340x200

// Adjust padding in container
className="px-[15%]"  // From px-[20%] to provide more center space
```

### Example 2: More Dramatic Scale Effect
```tsx
// Change scale values
transform: isActive ? 'scale(1)' : 'scale(0.75)'  // 100% vs 75%

// Add stronger opacity effect
opacity: isActive ? 1 : 0.3  // 100% vs 30%

// Slower transition for drama
transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
```

### Example 3: Subtle Animation
```tsx
// Minimal scale difference
transform: isActive ? 'scale(1)' : 'scale(0.95)'  // 100% vs 95%

// Less opacity fade
opacity: isActive ? 1 : 0.75  // 100% vs 75%

// Faster transition
transition: 'all 0.15s ease-in-out'
```

### Example 4: Custom Color Scheme (Dark Theme)
```tsx
// Card styling
isActive
  ? "border-white/20 ring-4 ring-white/10 bg-gray-900 shadow-2xl"
  : "border-gray-700 hover:border-gray-600"

// Icon styling
isActive 
  ? "bg-white text-gray-900" 
  : "bg-gray-800 text-gray-400"

// Badge styling
className="bg-white text-gray-900 text-[10px] font-bold px-2 py-1 rounded-full"
```

### Example 5: Material Design Elevation
```tsx
// Active card
isActive
  ? "border-0 ring-0 bg-white/95 shadow-2xl drop-shadow-2xl"
  : "border-0 ring-0 bg-white/30 shadow-md"

// Smoother transition
transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'  // Material easing
```

---

## Tailwind Configuration (if needed)

### Custom Gap Sizes
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      gap: {
        '4': '1rem',    // gap-4
        '6': '1.5rem',  // For tighter carousel: gap-6
      }
    }
  }
}
```

### Custom Padding
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      padding: {
        '[20%]': '20%',  // px-[20%]
        '[15%]': '15%',  // For custom carousel width
      }
    }
  }
}
```

### Custom Width/Height
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      width: {
        '[340px]': '340px',  // w-[340px]
        '[400px]': '400px',  // For larger cards
      },
      height: {
        '[200px]': '200px',  // h-[200px]
        '[250px]': '250px',  // For larger cards
      }
    }
  }
}
```

---

## Animation Timing

### Available Transitions
```tsx
// Fast (quick feedback)
transition: 'all 0.15s ease-in-out'

// Standard (most common)
transition: 'all 0.3s ease-in-out'  // DEFAULT

// Slow (dramatic effect)
transition: 'all 0.5s ease-in-out'

// Very Slow (cinematic)
transition: 'all 0.8s ease-in-out'
```

### Easing Functions
```tsx
// Linear (uniform speed)
transition: 'all 0.3s linear'

// Ease-in-out (accelerate then decelerate)
transition: 'all 0.3s ease-in-out'  // DEFAULT

// Ease-out (decelerate)
transition: 'all 0.3s ease-out'  // Feels responsive

// Ease-in (accelerate)  
transition: 'all 0.3s ease-in'  // Feels delayed

// Custom cubic-bezier
transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'  // Bouncy
```

---

## Shadow Customization

### Active Card Shadows
```tsx
// Subtle
shadow-lg      // Large shadow

// Medium (default)
shadow-xl      // Extra-large shadow

// Dramatic
shadow-2xl     // 2X large shadow
drop-shadow-2xl // Additional drop shadow
```

### Custom Shadow (if needed)
```ts
style={{
  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
}}
```

---

## Responsive Behavior

### Breakpoints Used
```tsx
// Only visible on desktop (> 1024px)
className="hidden lg:block"

// Hidden on desktop, visible on mobile
className="lg:hidden"
```

### Custom Breakpoints
```tsx
// If you need different breakpoints:
className="hidden xl:block"  // Extra large screens only
className="block lg:hidden"  // Mobile and tablet only
className="hidden md:block"  // Tablet and desktop
```

---

## Debugging Tips

### Visual Debug Mode
Add this to see carousel boundaries:
```tsx
style={{
  // ... existing styles
  border: '2px dashed red',      // See container bounds
  background: 'rgba(255,0,0,0.1)' // See container area
}}
```

### Center Point Debug
Add this to card wrapper to see snap point:
```tsx
style={{
  ...existingStyle,
  outline: '2px dashed blue',  // See card bounds
  outlineOffset: '-2px'
}}
```

### Scroll Events Debug
Add console logging:
```tsx
const handleCarouselScroll = () => {
  console.log('Scroll event:', {
    carouselCenter,
    closestCard,
    selectedAccountId
  });
  // ... rest of code
}
```

---

## Performance CSS Tips

### GPU Acceleration
CSS properties that trigger GPU acceleration:
```css
transform: scale(1);        /*  GPU accelerated */
opacity: 1;                 /*  GPU accelerated */
transition: all 0.3s;       /*  Smooth 60fps */
```

Avoid these for animations:
```css
left/right/top/bottom       /*  CPU intensive */
width/height                /*  CPU intensive */
font-size                   /*  CPU intensive */
```

### Import Optimization
```tsx
//  Only import needed icons
import { Plus, Wallet, CreditCard } from 'lucide-react';

//  Avoid importing entire library
import * as Icons from 'lucide-react';
```

---

## Browser-Specific Styling

### Scrollbar Styling (when not using scrollbar-hide)
```css
/* Chrome/Safari */
::-webkit-scrollbar {
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.3) transparent;
}
```

### Smooth Scroll Fallback
```css
html {
  scroll-behavior: smooth;  /* Fallback for older browsers */
}
```

