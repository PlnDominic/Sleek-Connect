import 'server-only';

export interface SendResult {
  /** The provider's message ID, kept in the delivery log. */
  reference?: string;
}

export interface SendOptions {
  /** Extra values the receiving app uses when the message is tapped (push only). */
  data?: Record<string, string>;
}

/** Thrown when a push token no longer belongs to a phone, so it should be forgotten. */
export class UnregisteredDeviceError extends Error {
  constructor() {
    super('The device is no longer registered for push messages.');
    this.name = 'UnregisteredDeviceError';
  }
}

/** An SMS or email gateway. Real providers (e.g. an SMS aggregator in Ghana, an email API) implement this. */
export interface MessageProvider {
  readonly name: string;
  send(to: string, message: { subject: string; text: string }, options?: SendOptions): Promise<SendResult>;
}

/** Writes messages to the server log instead of sending them. Development only. */
const consoleProvider = (channel: 'sms' | 'email' | 'push'): MessageProvider => ({
  name: 'console',
  async send(to, message) {
    console.info(`[${channel} → ${to}] ${channel === 'email' ? `${message.subject}: ` : ''}${message.text}`);
    return { reference: `console-${Date.now()}` };
  },
});

function pick(channel: 'sms' | 'email' | 'push', name: string | undefined): MessageProvider | null {
  if (!name) return null;
  if (name === 'console') {
    // Logging a message isn't delivering it, so never pretend to on the live site.
    return process.env.VERCEL_ENV === 'production' ? null : consoleProvider(channel);
  }
  console.error(`Unknown ${channel} provider "${name}", so ${channel} messages are off.`);
  return null;
}

export const smsProvider = () => pick('sms', process.env.SMS_PROVIDER);
export const emailProvider = () => pick('email', process.env.EMAIL_PROVIDER);

/** Expo's push service delivers to the app on both iPhone and Android; it needs no account for sending. */
const expoPushProvider = (): MessageProvider => ({
  name: 'expo',
  async send(to, message, options) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN && { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }),
      },
      body: JSON.stringify({ to, title: message.subject, body: message.text, sound: 'default', channelId: 'default', data: options?.data ?? {} }),
    });
    if (!response.ok) throw new Error(`Expo push service answered ${response.status}`);
    const { data } = (await response.json()) as { data?: { status: string; id?: string; message?: string; details?: { error?: string } } };
    if (data?.status === 'ok') return { reference: data.id };
    if (data?.details?.error === 'DeviceNotRegistered') throw new UnregisteredDeviceError();
    throw new Error(data?.message ?? 'The push service refused the message.');
  },
});

/** Set PUSH_PROVIDER=expo to send to the app, or console to log instead (development). Unset means push is off. */
export function pushProvider(): MessageProvider | null {
  const name = process.env.PUSH_PROVIDER;
  if (!name) return null;
  if (name === 'expo') return expoPushProvider();
  return pick('push', name);
}

/** Ghana numbers to international format (024 123 4567 → +233241234567). Other formats are passed through. */
export function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+233${digits.slice(1)}`;
  return digits;
}
