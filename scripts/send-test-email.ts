/**
 * Checks the Gmail settings by signing in to Gmail and sending one message.
 *
 *   npm run email:test -- you@example.com
 *
 * Reads GMAIL_USER, GMAIL_APP_PASSWORD (and optionally EMAIL_FROM_NAME) from apps/web/.env.local. With no address it only
 * checks that Gmail accepts the sign-in.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGmailTransport, gmailConfig, gmailMessage } from '../apps/web/src/lib/notifications/gmail';

// npm runs scripts from the repository root.
const envFile = resolve('apps/web/.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const config = gmailConfig();
  if (!config) {
    console.error('Set GMAIL_USER and GMAIL_APP_PASSWORD in apps/web/.env.local first (see apps/web/.env.example).');
    process.exit(1);
  }
  const transport = createGmailTransport(config);
  try {
    await transport.verify();
    console.log(`Gmail accepted the sign-in for ${config.user}.`);
    const to = process.argv[2];
    if (to) {
      const info = await transport.sendMail(
        gmailMessage(config, to, {
          subject: 'Sleek Connect Store: test email',
          text: 'This is a test message from Sleek Connect Store. If you can read it, order and vendor emails will reach people.',
        }),
      );
      console.log(`Sent a test email to ${to} (${info.messageId}).`);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`Gmail refused: ${message}`);
    if (/535|Invalid login|Username and Password/i.test(message)) {
      console.error('Use an App Password (Google Account → Security → 2-Step Verification → App passwords), not the account password.');
    }
    process.exit(1);
  } finally {
    transport.close();
  }
}

main();
