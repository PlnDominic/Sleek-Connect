/**
 * The HTML version of every email: a clean card with the store's name, a heading, the message, the key facts, one big
 * button, and a footer. Built with tables and inline styles because email apps ignore most modern CSS, and with no
 * images, so nothing is blocked or missing. Everything that comes from outside is escaped. The plain-text version is
 * always sent as well.
 */
export interface EmailHtmlInput {
  subject: string;
  /** The message without its closing link. Blank lines make new paragraphs; single line breaks stay. */
  body: string;
  /** Shown in the inbox list next to the subject. */
  preheader?: string;
  facts?: [label: string, value: string][];
  /** A code to show large, such as the delivery code the rider asks for. */
  code?: { label: string; value: string };
  cta?: { label: string; url: string };
  /** A small label above the heading, for example "Store alert". */
  tag?: string;
  /** Why they are getting it, under the card. */
  reason?: string;
  helpUrl: string;
}

const NAVY = '#0B1F3A';
const TEAL = '#0F766E';
const TEXT = '#2F3E57';
const MUTED = '#66728A';
const LINE = '#E4E9F0';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Splits a closing link off a message: "…Track it: https://x/y" becomes the text and the address. */
export function splitTrailingUrl(text: string): { body: string; url: string | null } {
  const match = /^([\s\S]*?)(?:\s*(?:Track it and get your receipt|Track it|See it|Read it in your dashboard)?:?\s*)(https?:\/\/\S+)\s*$/.exec(text.trim());
  if (!match) return { body: text.trim(), url: null };
  return { body: match[1].replace(/[\s:]+$/, '').trim(), url: match[2] };
}

export function buildEmailHtml(input: EmailHtmlInput): string {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${TEXT};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

  const facts = input.facts?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;background:#F3F6F9;border-radius:10px;">${input.facts
        .map(
          ([label, value], i) =>
            `<tr><td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font-family:${FONT};font-size:14px;color:${MUTED};">${escapeHtml(label)}</td>` +
            `<td align="right" style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${LINE};` : ''}font-family:${FONT};font-size:14px;font-weight:700;color:${NAVY};">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const code = input.code
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;border:2px dashed ${TEAL};border-radius:10px;"><tr><td align="center" style="padding:16px;">` +
      `<div style="font-family:${FONT};font-size:13px;color:${MUTED};">${escapeHtml(input.code.label)}</div>` +
      `<div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${NAVY};padding-top:4px;">${escapeHtml(input.code.value)}</div></td></tr></table>`
    : '';

  const button = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 8px;"><tr><td align="center" bgcolor="${TEAL}" style="border-radius:8px;">` +
      `<a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(input.cta.label)}</a></td></tr></table>` +
      `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED};">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(input.cta.url)}" style="color:${TEAL};word-break:break-all;">${escapeHtml(input.cta.url)}</a></p>`
    : '';

  const tag = input.tag
    ? `<div style="display:inline-block;margin:0 0 12px;padding:4px 10px;background:#FDF0D6;border-radius:999px;font-family:${FONT};font-size:12px;font-weight:700;color:#8A5A00;">${escapeHtml(input.tag)}</div>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F5F7FA;">${escapeHtml(input.preheader ?? input.body.split('\n')[0].slice(0, 120))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7FA;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
    <tr><td style="padding:0 4px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td width="40" height="40" align="center" bgcolor="${TEAL}" style="border-radius:10px;font-family:${FONT};font-size:16px;font-weight:800;color:#FFFFFF;">SC</td>
        <td style="padding-left:10px;font-family:${FONT};font-size:20px;font-weight:800;color:${NAVY};letter-spacing:-0.3px;">Sleek <span style="color:${TEAL};">Connect</span> Store</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#FFFFFF;border-radius:14px;border-top:4px solid ${TEAL};padding:32px 28px;">
      ${tag}
      <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:800;color:${NAVY};">${escapeHtml(input.subject)}</h1>
      ${paragraphs}
      ${code}
      ${facts}
      ${button}
    </td></tr>
    <tr><td align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
      ${input.reason ? `${escapeHtml(input.reason)}<br>` : ''}
      Sleek Connect Store · Accra, Ghana · <a href="${escapeHtml(input.helpUrl)}" style="color:${TEAL};">Help centre</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
