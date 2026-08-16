import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export interface UseInfiniteScrollOptions<T> {
  /** The full array of items (client-side pagination or accumulation) */
  items?: T[];
  /** Number of items to display per page (default: 25) */
  pageSize?: number;
  /** Initial number of items on first render (default: same as pageSize) */
  initialPageSize?: number;
  /** Array of dependencies (search query, filters, date range, sort) that automatically reset pagination to page 1 */
  resetDeps?: any[];
  /** Optional remote fetcher function called when more items are needed */
  onFetchNextPage?: (page: number) => Promise<boolean | void>;
  /** Explicit hasMore flag for remote endpoints */
  hasMoreRemote?: boolean;
  /** Unique key extractor to prevent duplicate item rendering (defaults to item.id || item.cloudId || index) */
  getItemKey?: (item: T, index: number) => string | number;
}

export interface UseInfiniteScrollReturn<T> {
  /** Paginated subset of items currently visible on screen */
  visibleItems: T[];
  /** Current page index (1-indexed) */
  currentPage: number;
  /** Whether more items are available to be loaded */
  hasMore: boolean;
  /** Whether the next page is currently being fetched/rendered */
  isLoadingMore: boolean;
  /** Function to manually or automatically trigger the next page load */
  loadMore: () => Promise<void>;
  /** Function to reset pagination back to page 1 */
  reset: () => void;
  /** Error message if loading more failed */
  error: string | null;
  /** Retry function when loading more failed */
  retry: () => void;
  /** Total count of items available */
  totalCount: number;
  /** Ref callback to attach to a sentinel element at the bottom of the list */
  sentinelRef: (node: HTMLElement | null) => void;
}

export function useInfiniteScroll<T>({
  items = [],
  pageSize = 25,
  initialPageSize,
  resetDeps = [],
  onFetchNextPage,
  hasMoreRemote,
  getItemKey,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const initialSize = initialPageSize ?? pageSize;
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelNodeRef = useRef<HTMLElement | null>(null);

  // Total count
  const totalCount = items.length;

  // Determine if there are more items
  const hasMore = useMemo(() => {
    if (typeof hasMoreRemote === 'boolean') {
      return hasMoreRemote;
    }
    const currentLimit = initialSize + (currentPage - 1) * pageSize;
    return currentLimit < totalCount;
  }, [hasMoreRemote, initialSize, currentPage, pageSize, totalCount]);

  // Compute visible items with deduplication
  const visibleItems = useMemo(() => {
    const limit = initialSize + (currentPage - 1) * pageSize;
    const sliced = items.slice(0, limit);

    if (!getItemKey) {
      return sliced;
    }

    const seen = new Set<string | number>();
    const deduplicated: T[] = [];

    for (let i = 0; i < sliced.length; i++) {
      const item = sliced[i];
      const key = getItemKey(item, i);
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }, [items, initialSize, currentPage, pageSize, getItemKey]);

  // Reset pagination to page 1
  const reset = useCallback(() => {
    setCurrentPage(1);
    setIsLoadingMore(false);
    setError(null);
    isFetchingRef.current = false;
  }, []);

  // Automatically reset when resetDeps change
  const resetDepsRef = useRef(resetDeps);
  useEffect(() => {
    const hasChanged = resetDeps.some(
      (dep, idx) => dep !== resetDepsRef.current[idx]
    );
    if (hasChanged) {
      resetDepsRef.current = resetDeps;
      reset();
    }
  }, [resetDeps, reset]);

  // Load next page with strict concurrency lock
  const loadMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    const nextPage = currentPage + 1;

    try {
      if (onFetchNextPage) {
        await onFetchNextPage(nextPage);
      }
      // Small simulated tick for smooth micro-loading feedback
      await new Promise((resolve) => setTimeout(resolve, 80));
      setCurrentPage(nextPage);
    } catch (err: any) {
      console.error('[useInfiniteScroll] Failed to load next page:', err);
      setError(err?.message || 'Unable to load more items');
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [currentPage, hasMore, onFetchNextPage]);

  // Retry action
  const retry = useCallback(() => {
    setError(null);
    void loadMore();
  }, [loadMore]);

  // Setup IntersectionObserver for the sentinel element
  const setupObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (typeof window === 'undefined' || !window.IntersectionObserver) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting && hasMore && !isFetchingRef.current) {
          void loadMore();
        }
      },
      {
        root: null,
        rootMargin: '250px 0px', // Trigger load 250px before reaching viewport bottom
        threshold: 0.05,
      }
    );

    if (sentinelNodeRef.current) {
      observerRef.current.observe(sentinelNodeRef.current);
    }
  }, [hasMore, loadMore]);

  useEffect(() => {
    setupObserver();
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [setupObserver]);

  // Sentinel ref callback
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      sentinelNodeRef.current = node;
      if (node && observerRef.current) {
        observerRef.current.observe(node);
      }
    },
    []
  );

  return {
    visibleItems,
    currentPage,
    hasMore,
    isLoadingMore,
    loadMore,
    reset,
    error,
    retry,
    totalCount,
    sentinelRef,
  };
}
