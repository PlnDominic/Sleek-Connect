/**
 * Browser monitoring and analytics, started before the app becomes interactive.
 *
 * Both tools are off until their keys are set (NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_POSTHOG_KEY), and everything they send
 * passes through `lib/telemetry/scrub.ts` first: no order tokens, phone numbers, email addresses, cookies or request
 * bodies, and no analytics from the admin console. See docs/SENTRY_POSTHOG.md.
 */
import * as Sentry from '@sentry/nextjs';
import posthog from 'posthog-js';
import { scrubAnalyticsEvent, scrubMonitoringEvent } from '@/lib/telemetry/scrub';

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    // A tenth of page loads are traced for speed; every error is kept.
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubMonitoringEvent(event),
    beforeSendTransaction: (event) => scrubMonitoringEvent(event),
    // Noise that says nothing about the store.
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications.', 'Non-Error promise rejection captured'],
  });
}

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    // Sent through this site (see the /ingest rewrite in next.config.ts): no third-party address for the browser to
    // reach or an ad blocker to stop, and no change to the content security policy.
    api_host: '/ingest',
    ui_host: `https://${process.env.NEXT_PUBLIC_POSTHOG_REGION === 'eu' ? 'eu' : 'us'}.posthog.com`,
    capture_pageview: 'history_change',
    capture_pageleave: false,
    // Only the events we name: no clicks or typed text are recorded, and nothing is replayed.
    autocapture: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    capture_exceptions: false,
    // No cookie or stored identifier: a visitor is anonymous, and a new page load is a new visitor. Add a consent
    // banner before changing this.
    persistence: 'memory',
    person_profiles: 'identified_only',
    respect_dnt: true,
    before_send: (event) => scrubAnalyticsEvent(event),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
