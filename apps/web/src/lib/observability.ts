import { randomUUID } from 'node:crypto';

export type LogContext = Record<string, string | number | boolean | null | undefined>;

export function requestId(request?: Request) {
  return request?.headers.get('x-request-id') || randomUUID();
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: process.env.NODE_ENV === 'production' ? undefined : error.stack };
  return { message: String(error) };
}

function write(level: 'info' | 'warn' | 'error', event: string, context: LogContext = {}, error?: unknown) {
  const payload = { timestamp: new Date().toISOString(), level, service: 'sleek-connect-web', event, ...context, ...(error ? { error: normalizeError(error) } : {}) };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, context?: LogContext) => write('info', event, context),
  warn: (event: string, context?: LogContext) => write('warn', event, context),
  error: (event: string, error: unknown, context?: LogContext) => write('error', event, context, error),
};

export function withRequestId(response: Response, id: string) {
  response.headers.set('x-request-id', id);
  return response;
}
