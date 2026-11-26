/**
 * What may leave this site for Sentry and PostHog.
 *
 * This store's order page address (`/orders/<token>`) is the shopper's proof of ownership of the order, and its forms hold
 * names, phone numbers and email addresses. None of that may reach a third party. Every event passes through these
 * functions before it is sent: addresses lose their tokens and sensitive query values, free text loses anything shaped like
 * a token, email address or phone number, and the private areas (admin console) send no analytics at all.
 *
 * Pure functions with no imports, so they run in the browser, on the server and in tests.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ORDER_NUMBER = /\bSC-\d{3,}\b/g;
const EMAIL = /[^\s@<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+/g;
// A Ghana or international number: 9 to 15 digits, with spaces, dashes or a leading +.
const PHONE = /\+?\d[\d\s-]{7,16}\d/g;
const SENSITIVE_KEY = /token|code|phone|email|order|key|secret|password|auth|session|wallet|name|address|directions|gps|note/i;

/** Free text with tokens, order numbers, email addresses and phone numbers replaced. */
export function redactText(text: string): string {
  return text.replace(UUID, '[token]').replace(ORDER_NUMBER, '[order]').replace(EMAIL, '[email]').replace(PHONE, '[number]');
}

/**
 * An address with its secrets removed: tokens in the path become `:token`, order numbers `:order`, and the values of
 * query parameters that could identify a person or an order are dropped. Anything that isn't a valid address is redacted as text.
 */
export function scrubUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url, 'https://placeholder.invalid');
  } catch {
    return redactText(url);
  }
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
  const path = parsed.pathname.replace(UUID, ':token').replace(ORDER_NUMBER, ':order');
  const params = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) params.set(key, SENSITIVE_KEY.test(key) ? '[removed]' : redactText(value));
  const query = params.toString();
  const rest = `${path}${query ? `?${query}` : ''}`;
  return relative ? rest : `${parsed.origin}${rest}`;
}

/** The areas that are not the public store: no analytics is collected there. */
export function isPrivatePath(pathname: string): boolean {
  return /^\/(admin|auth|ingest|monitoring)(\/|$)/.test(pathname);
}

const pathOf = (url: unknown): string => {
  if (typeof url !== 'string') return '';
  try {
    return new URL(url, 'https://placeholder.invalid').pathname;
  } catch {
    return '';
  }
};

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A PostHog event ready to send, or null when it must not be sent (the private areas). The page and referrer addresses it
 * carries are scrubbed.
 */
export function scrubAnalyticsEvent<T extends { properties?: Bag }>(event: T | null): T | null {
  if (!event) return null;
  const properties = event.properties;
  if (!isBag(properties)) return event;
  if (isPrivatePath(pathOf(properties.$current_url)) || isPrivatePath(pathOf(properties.$pathname))) return null;
  const next: Bag = { ...properties };
  for (const key of ['$current_url', '$referrer', '$initial_referrer', '$initial_current_url', '$prev_pageview_url']) {
    if (typeof next[key] === 'string') next[key] = scrubUrl(next[key] as string);
  }
  if (typeof next.$pathname === 'string') next.$pathname = scrubUrl(next.$pathname);
  if (typeof next.$prev_pageview_pathname === 'string') next.$prev_pageview_pathname = scrubUrl(next.$prev_pageview_pathname);
  return { ...event, properties: next };
}

/** The parts of a Sentry event this module reads and rewrites; everything else passes through untouched. */
interface MonitoringEvent {
  message?: string;
  transaction?: string;
  user?: unknown;
  request?: { url?: string; headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Bag }[];
  extra?: unknown;
  contexts?: unknown;
}

/** A Sentry event with the person, the cookies and headers, request bodies, and secrets in addresses and messages removed. */
export function scrubMonitoringEvent<T extends MonitoringEvent>(event: T): T {
  const next: T = { ...event };
  delete next.user;
  if (next.request) {
    const request = { ...next.request };
    delete request.cookies;
    delete request.headers;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = scrubUrl(request.url);
    next.request = request;
  }
  if (next.transaction) next.transaction = scrubUrl(next.transaction);
  if (next.message) next.message = redactText(next.message);
  if (next.exception?.values) {
    next.exception = { ...next.exception, values: next.exception.values.map((v) => (v.value ? { ...v, value: redactText(v.value) } : v)) };
  }
  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map((crumb) => {
      const data = crumb.data ? { ...crumb.data } : undefined;
      if (data) {
        for (const key of ['url', 'from', 'to']) if (typeof data[key] === 'string') data[key] = scrubUrl(data[key] as string);
        // Request and response bodies, and form values, never leave the site.
        delete data.body;
        delete data.request_body_size;
      }
      return { ...crumb, ...(crumb.message ? { message: redactText(crumb.message) } : {}), ...(data ? { data } : {}) };
    });
  }
  // Extra context is whatever the code attached: keep the keys, drop the values that look like personal data.
  if (isBag(next.extra)) {
    next.extra = Object.fromEntries(Object.entries(next.extra).map(([key, value]) => [key, typeof value === 'string' ? redactText(value) : value]));
  }
  return next;
}
