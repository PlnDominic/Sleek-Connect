import 'server-only';

export interface SendResult {
  /** The provider's message ID, kept in the delivery log. */
  reference?: string;
}

/** An SMS or email gateway. Real providers (e.g. an SMS aggregator in Ghana, an email API) implement this. */
export interface MessageProvider {
  readonly name: string;
  send(to: string, message: { subject: string; text: string }): Promise<SendResult>;
}

/** Writes messages to the server log instead of sending them. Development only. */
const consoleProvider = (channel: 'sms' | 'email'): MessageProvider => ({
  name: 'console',
  async send(to, message) {
    console.info(`[${channel} → ${to}] ${channel === 'email' ? `${message.subject}: ` : ''}${message.text}`);
    return { reference: `console-${Date.now()}` };
  },
});

function pick(channel: 'sms' | 'email', name: string | undefined): MessageProvider | null {
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

/** Ghana numbers to international format (024 123 4567 → +233241234567). Other formats are passed through. */
export function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('233')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+233${digits.slice(1)}`;
  return digits;
}
