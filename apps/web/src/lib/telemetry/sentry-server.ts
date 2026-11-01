/** Server-side Sentry, started once per server instance by `register` in `instrumentation.ts`. Off without a DSN. */
import * as Sentry from '@sentry/nextjs';
import { scrubMonitoringEvent } from './scrub';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrubMonitoringEvent(event),
    beforeSendTransaction: (event) => scrubMonitoringEvent(event),
  });
}
