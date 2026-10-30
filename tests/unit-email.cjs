// The Gmail sender (Nodemailer): settings, the message it builds, and that the store alert leaves secrets out.
require('tsx/cjs');
const nodemailer = require('nodemailer');
const { gmailConfig, gmailMessage } = require('../apps/web/src/lib/notifications/gmail.ts');
const { maskRecipient } = require('../apps/web/src/lib/notifications/mask.ts');
const { buildEmailHtml, splitTrailingUrl, escapeHtml } = require('../apps/web/src/lib/notifications/email-html.ts');
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

  assert(maskRecipient('kofi.mensah@example.com') === 'k***@example.com', 'logged email addresses keep the first letter and the domain');
  assert(maskRecipient('+233241234567') === '***567' && maskRecipient('024 123 4567') === '***567', 'logged phone numbers keep the last three digits');
  const masked = maskRecipient('ExponentPushToken[abcdefghijklmnop]');
  assert(masked.startsWith('ExponentPushToken[') && !masked.includes('abcdefghijklmnop'), 'and push tokens are cut short');

  // The designed email.
  const split = splitTrailingUrl('Hi Ama, thanks for your order SC-1001. Track it: https://shop.example/orders/abc');
  assert(split.url === 'https://shop.example/orders/abc' && split.body === 'Hi Ama, thanks for your order SC-1001.', 'a closing link is split off the message and becomes the button');
  assert(splitTrailingUrl('No link here.').url === null, 'a message without a link has no button');
  const html = buildEmailHtml({
    subject: 'Order <SC-1001> is on the way', body: 'Hi Ama,\n\nGive the rider your code.', facts: [['Order', 'SC-1001']],
    code: { label: 'Your delivery code', value: '482915' }, cta: { label: 'View your order', url: 'https://shop.example/orders/abc' },
    helpUrl: 'https://shop.example/help', reason: 'Because of your order.',
  });
  assert(html.includes('Order &lt;SC-1001&gt; is on the way') && !html.includes('<SC-1001>'), 'what is put in an email is escaped');
  assert(html.includes('482915') && html.includes('View your order') && html.includes('href="https://shop.example/orders/abc"'), 'it shows the code, the button and its link');
  assert(html.includes('Sleek <span') && html.includes('Help centre'), 'and carries the store name and a help link');
  assert(!/<img/i.test(html) && !/<script/i.test(html), 'with no images or scripts to be blocked');
  assert(escapeHtml(`"a" & 'b'`) === '&quot;a&quot; &amp; &#39;b&#39;', 'quotes and ampersands are escaped');
  const bare = buildEmailHtml({ subject: 'Hello', body: 'Just words.', helpUrl: 'https://shop.example/help' });
  assert(!bare.includes('Button not working') && !bare.includes('border:2px dashed'), 'no button or code box when there is nothing to show');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll email checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
