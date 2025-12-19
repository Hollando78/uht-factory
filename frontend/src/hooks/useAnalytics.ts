/**
 * Simple analytics tracking hook.
 *
 * Tracks page views automatically on route changes.
 * Privacy-friendly: no cookies, no personal data, IP is hashed server-side.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const ANALYTICS_ENDPOINT = '/api/v1/analytics/pageview';

interface PageViewEvent {
  path: string;
  referrer: string | null;
  screen_width: number;
  screen_height: number;
}

async function sendPageView(event: PageViewEvent): Promise<void> {
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      // Don't wait for response, fire and forget
      keepalive: true,
    });
  } catch {
    // Silently fail - analytics should never break the app
  }
}

/**
 * Hook to track page views.
 *
 * Add this to your App component to automatically track all page navigations.
 *
 * @example
 * function App() {
 *   useAnalytics();
 *   return <Routes>...</Routes>;
 * }
 */
export function useAnalytics(): void {
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // Don't track the same page twice (e.g., on re-renders)
    if (lastPath.current === location.pathname) {
      return;
    }
    lastPath.current = location.pathname;

    // Build the page view event
    const event: PageViewEvent = {
      path: location.pathname,
      referrer: document.referrer || null,
      screen_width: window.innerWidth,
      screen_height: window.innerHeight,
    };

    // Send after a short delay to not block initial render
    const timeoutId = setTimeout(() => {
      sendPageView(event);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [location.pathname]);
}

/**
 * Manually track a custom event (for future use).
 */
export async function trackEvent(eventName: string, data?: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/v1/analytics/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event: eventName, data }),
      keepalive: true,
    });
  } catch {
    // Silently fail
  }
}

export default useAnalytics;
