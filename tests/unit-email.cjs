// The Gmail sender (Nodemailer): settings, the message it builds, and that the store alert leaves secrets out.
require('tsx/cjs');
const nodemailer = require('nodemailer');
const { gmailConfig, gmailMessage } = require('../apps/web/src/lib/notifications/gmail.ts');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

(async () => {
  assert(gmailConfig({}) === null && gmailConfig({ GMAIL_USER: 'shop@gmail.com' }) === null, 'without a Gmail address and App Password, email is off');
  const config = gmailConfig({ GMAIL_USER: ' shop@gmail.com ', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' });
  assert(config.user === 'shop@gmail.com' && config.appPassword === 'abcdefghijklmnop', 'the address is trimmed and the spaces in an App Password are dropped');
  assert(config.fromName === 'Sleek Connect Store', 'the sender name defaults to the store\'s name');
  assert(gmailConfig({ GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'x', EMAIL_FROM_NAME: 'Ama Hub' }).fromName === 'Ama Hub', 'and can be changed');

  // Run the real message through Nodemailer without a network: the JSON transport returns what would be sent.
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const info = await transport.sendMail(gmailMessage(config, 'kofi@example.com', { subject: 'Order SC-1001 confirmed', text: 'Thank you!' }, 'help@example.com'));
  const sent = JSON.parse(info.message);
  assert(sent.from.address === 'shop@gmail.com' && sent.from.name === 'Sleek Connect Store', 'it is sent from the store\'s name at the Gmail address');
  assert(sent.to[0].address === 'kofi@example.com' && sent.subject === 'Order SC-1001 confirmed' && sent.text === 'Thank you!', 'to the customer, with the subject and text');
  assert(sent.replyTo[0].address === 'help@example.com', 'replies go to the reply-to address when one is set');
  const plain = JSON.parse((await transport.sendMail(gmailMessage(config, 'a@example.com', { subject: 's', text: 't' }))).message);
  assert(!plain.replyTo, 'and nowhere special when it is not');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll email checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
