import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

/**
 * Sending email through a Gmail (or Google Workspace) account with Nodemailer. This file reads only its own settings
 * and has no `server-only` import, so the `npm run email:test` script and the tests can use it too.
 *
 * Gmail needs an App Password, not the account's normal password: turn on 2-Step Verification for the account, then
 * Google Account → Security → App passwords. A personal Gmail account may send about 500 messages a day (a Workspace
 * account about 2,000), and Gmail always sends "from" the signed-in address.
 */
export interface GmailConfig {
  user: string;
  appPassword: string;
  fromName: string;
}

export function gmailConfig(env: Record<string, string | undefined> = process.env): GmailConfig | null {
  const user = env.GMAIL_USER?.trim();
  // Google shows app passwords in four groups of four with spaces; the spaces are not part of the password.
  const appPassword = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!user || !appPassword) return null;
  return { user, appPassword, fromName: env.EMAIL_FROM_NAME?.trim() || 'Sleek Connect Store' };
}

export function createGmailTransport(config: GmailConfig): Transporter {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.appPassword },
    // Reuse one connection for a batch of messages instead of signing in for each.
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** The message Nodemailer sends: plain text, from the store's name at the Gmail address. */
export function gmailMessage(config: GmailConfig, to: string, message: { subject: string; text: string; html?: string }, replyTo?: string): SendMailOptions {
  return {
    from: { name: config.fromName, address: config.user },
    to,
    subject: message.subject,
    text: message.text,
    ...(message.html && { html: message.html }),
    ...(replyTo && { replyTo }),
  };
}
