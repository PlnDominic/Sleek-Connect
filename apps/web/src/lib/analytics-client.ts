'use client';

import posthog from 'posthog-js';

/**
 * Records a named event from the browser. Does nothing when PostHog isn't set up, is blocked, or the visitor sent Do Not
 * Track. Properties are labels and numbers only (never anything a shopper typed).
 */
export function track(event: string, properties?: Record<string, string | number | boolean | null>) {
  try {
    if (posthog.__loaded) posthog.capture(event, properties);
  } catch {
    // Analytics must never get in the way of the store.
  }
}
