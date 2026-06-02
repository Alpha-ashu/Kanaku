import { useEffect } from 'react';

/**
 * Hook to automatically scroll to top of page when a specific dependency changes.
 * Useful for scroll restoration when navigating between pages.
 *
 * @param dependencies - Array of values to watch for changes (e.g., currentPage)
 * @param options - Configuration options
 */
interface ScrollToTopOptions {
  behavior?: 'auto' | 'smooth';
  delay?: number;
}

export const useScrollToTop = (
  dependencies: any[] = [],
  options: ScrollToTopOptions = {}
) => {
  const { behavior = 'auto', delay = 0 } = options;

  useEffect(() => {
    const scrollToTop = () => {
      // Get main scrollable container (the one with overflow-x-hidden in App.tsx)
      const mainContent = document.querySelector('.mobile-main');
      
      if (mainContent) {
        // Set scroll position to top
        if (delay > 0) {
          setTimeout(() => {
            mainContent.scrollTop = 0;
          }, delay);
        } else {
          mainContent.scrollTop = 0;
        }
      }

      // Also try window scroll as fallback
      if (delay > 0) {
        setTimeout(() => {
          window.scrollTo({ top: 0, left: 0, behavior });
        }, delay);
      } else {
        window.scrollTo({ top: 0, left: 0, behavior });
      }
    };

    scrollToTop();
  }, dependencies);
};

/**
 * Hook that automatically scrolls to top when currentPage changes.
 * Use this in your main App component.
 *
 * @param currentPage - The current page/route being displayed
 */
export const useScrollToTopOnPageChange = (currentPage: string) => {
  useScrollToTop([currentPage], { behavior: 'auto', delay: 0 });
};
