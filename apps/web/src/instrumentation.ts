/**
 * Server startup validation and structured request-error logging (P0 items 3 and 6).
 *
 * `register` runs once per server instance: it checks the required environment variables and logs the names of
 * any that are missing (never their values). `onRequestError` records every server-side failure — renders,
 * route handlers and server actions — as one structured line with the request id and enough context to find it.
 */
import * as Sentry from '@sentry/nextjs';
import type { Instrumentation } from 'next';

const BUILD_PHASE = 'phase-production-build';

function context() {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    vercelEnv: process.env.VERCEL_ENV ?? 'none',
  };
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  if (process.env.NEXT_PHASE === BUILD_PHASE) return;
  // Error reporting starts first so a failure while starting up is reported too (does nothing without a DSN).
  await import('./lib/telemetry/sentry-server');
  const { logger } = await import('./lib/observability');
  const { missingEnv } = await import('./lib/env');
  const missing = missingEnv();
  if (missing.length > 0) {
    logger.error(
      'environment_invalid',
      new Error(`Missing environment variables: ${missing.join(', ')}`),
      { ...context(), missing: missing.join(', ') },
    );
  } else {
    logger.info('environment_ok', context());
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, routeContext) => {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  if (process.env.NEXT_PHASE === BUILD_PHASE) return;
  const { logger } = await import('./lib/observability');
  const header = request.headers['x-request-id'];
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;
  // Sentry gets this failure from captureRequestError (with the route's details), so the log line is not reported twice.
  Sentry.captureRequestError(error, request, routeContext);
  logger.errorLogged('request_error', error, {
    requestId: Array.isArray(header) ? header[0] : header,
    method: request.method,
    path: request.path,
    routeType: routeContext.routeType,
    routerKind: routeContext.routerKind,
    digest,
    ...context(),
  });
};
