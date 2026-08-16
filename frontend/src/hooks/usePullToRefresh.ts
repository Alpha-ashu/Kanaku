import { useState, useEffect, useRef, useCallback } from 'react';

export interface UsePullToRefreshOptions {
  onRefresh?: () => Promise<any> | void;
  pullThreshold?: number; // Distance in px to trigger refresh (default 65)
  maxPullDistance?: number; // Max visual pull distance in px (default 85)
  resistance?: number; // Resistance multiplier (default 0.4)
  disabled?: boolean;
}

export interface UsePullToRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPulling: boolean;
  pullDistance: number;
  isReady: boolean;
  isRefreshing: boolean;
  handleTouchStart: (e: React.TouchEvent | TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent | TouchEvent) => void;
  handleTouchEnd: () => void;
  triggerRefresh: () => Promise<void>;
}

export function usePullToRefresh({
  onRefresh,
  pullThreshold = 65,
  maxPullDistance = 85,
  resistance = 0.4,
  disabled = false,
}: UsePullToRefreshOptions = {}): UsePullToRefreshReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const hapticTriggeredRef = useRef(false);
  // Mirrors `pullDistance` for handleTouchEnd to read without depending on the
  // state itself — pullDistance changes on every touchmove tick, and having
  // handleTouchEnd depend on it would recreate the callback (and therefore
  // tear down and re-attach the native touch listeners below) dozens of
  // times per second during a single pull gesture.
  const pullDistanceRef = useRef(0);

  const triggerHaptic = useCallback(() => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(12);
      } catch {
        // Ignore haptic errors on unsupported devices
      }
    }
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (isRefreshingRef.current || disabled) return;
    
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    pullDistanceRef.current = pullThreshold;
    setPullDistance(pullThreshold);

    try {
      if (onRefresh) {
        await Promise.resolve(onRefresh());
      }
    } catch (err) {
      console.error('[usePullToRefresh] Refresh action failed:', err);
    } finally {
      // Smooth reset
      setTimeout(() => {
        isRefreshingRef.current = false;
        setIsRefreshing(false);
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setIsReady(false);
        setIsPulling(false);
        hapticTriggeredRef.current = false;
      }, 350);
    }
  }, [onRefresh, pullThreshold, disabled]);

  const isAtTop = useCallback(() => {
    if (typeof window === 'undefined') return true;
    
    // Check window scroll
    const windowScrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (windowScrollTop > 2) return false;

    // Check container scroll if element exists
    if (containerRef.current) {
      return containerRef.current.scrollTop <= 2;
    }
    return true;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (disabled || isRefreshingRef.current || !isAtTop()) {
        return;
      }
      const touch = 'touches' in e ? e.touches[0] : (e as any);
      if (!touch) return;

      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
      isDraggingRef.current = true;
      hapticTriggeredRef.current = false;
    },
    [disabled, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (!isDraggingRef.current || disabled || isRefreshingRef.current) {
        return;
      }

      const touch = 'touches' in e ? e.touches[0] : (e as any);
      if (!touch) return;

      currentYRef.current = touch.clientY;
      const deltaY = currentYRef.current - startYRef.current;

      // Only pull down when deltaY is positive and user is at top
      if (deltaY > 0 && isAtTop()) {
        const calculatedDistance = Math.min(deltaY * resistance, maxPullDistance);
        pullDistanceRef.current = calculatedDistance;
        setPullDistance(calculatedDistance);
        setIsPulling(true);

        const ready = calculatedDistance >= pullThreshold;
        setIsReady(ready);

        if (ready && !hapticTriggeredRef.current) {
          triggerHaptic();
          hapticTriggeredRef.current = true;
        } else if (!ready) {
          hapticTriggeredRef.current = false;
        }

        // Prevent native rubber-banding if we're pulling
        if (deltaY > 10 && e.cancelable) {
          e.preventDefault();
        }
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        setIsPulling(false);
        setIsReady(false);
      }
    },
    [disabled, isAtTop, resistance, maxPullDistance, pullThreshold, triggerHaptic]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPulling(false);

    if (pullDistanceRef.current >= pullThreshold && !isRefreshingRef.current) {
      void triggerRefresh();
    } else if (!isRefreshingRef.current) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      setIsReady(false);
      hapticTriggeredRef.current = false;
    }
  }, [pullThreshold, triggerRefresh]);

  // Attach non-passive native listeners to container if mounted
  useEffect(() => {
    const el = containerRef.current || (typeof window !== 'undefined' ? window : null);
    if (!el || disabled) return;

    const onTouchStart = (e: TouchEvent) => handleTouchStart(e);
    const onTouchMove = (e: TouchEvent) => handleTouchMove(e);
    const onTouchEnd = () => handleTouchEnd();

    el.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
    el.addEventListener('touchmove', onTouchMove as EventListener, { passive: false });
    el.addEventListener('touchend', onTouchEnd as EventListener);
    el.addEventListener('touchcancel', onTouchEnd as EventListener);

    return () => {
      el.removeEventListener('touchstart', onTouchStart as EventListener);
      el.removeEventListener('touchmove', onTouchMove as EventListener);
      el.removeEventListener('touchend', onTouchEnd as EventListener);
      el.removeEventListener('touchcancel', onTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, disabled]);

  return {
    containerRef,
    isPulling,
    pullDistance,
    isReady,
    isRefreshing,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    triggerRefresh,
  };
}
