/**
 * The HTML version of every email, in the manner of Apple's own transactional mail: the system font, one calm column on a
 * plain page, a large light heading, body text at a comfortable size, facts as simple rows between hairlines, a single
 * accent colour for the one action, and small grey print at the bottom. Nothing decorative. It follows the reader's
 * light or dark setting. Built with tables and inline styles because mail apps ignore most modern CSS, and with no
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

const INK = '#1d1d1f';
const SECONDARY = '#6e6e73';
const HAIRLINE = '#d2d2d7';
const PANEL = '#f5f5f7';
const ACCENT = '#0f766e';
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif";

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
    .map((p) => `<p class="ink" style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:1.47;letter-spacing:-0.2px;color:${INK};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const rows = input.facts?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="rule" style="margin:12px 0 28px;border-top:1px solid ${HAIRLINE};">${input.facts
        .map(
          ([label, value]) =>
            `<tr><td class="rule secondary" style="padding:12px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FONT};font-size:15px;line-height:1.4;color:${SECONDARY};">${escapeHtml(label)}</td>` +
            `<td align="right" class="rule ink" style="padding:12px 0 12px 16px;border-bottom:1px solid ${HAIRLINE};font-family:${FONT};font-size:15px;line-height:1.4;color:${INK};">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const code = input.code
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 28px;"><tr><td align="center" class="panel" style="background:${PANEL};border-radius:18px;padding:24px 16px;">` +
      `<div class="secondary" style="font-family:${FONT};font-size:13px;color:${SECONDARY};">${escapeHtml(input.code.label)}</div>` +
      `<div class="ink" style="font-family:${FONT};font-size:40px;font-weight:600;letter-spacing:8px;line-height:1.2;color:${INK};padding:6px 0 0 8px;">${escapeHtml(input.code.value)}</div></td></tr></table>`
    : '';

  const action = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" class="cta" style="margin:4px 0 8px;"><tr><td align="center" bgcolor="${ACCENT}" style="border-radius:980px;">` +
      `<a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:17px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:980px;">${escapeHtml(input.cta.label)}</a></td></tr></table>`
    : '';

  const tag = input.tag
    ? `<div class="secondary" style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${SECONDARY};">${escapeHtml(input.tag)}</div>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(input.subject)}</title>
<style>
  a { color: ${ACCENT}; }
  @media (prefers-color-scheme: dark) {
    body, .page { background: #000000 !important; }
    .ink { color: #f5f5f7 !important; }
    .secondary { color: #a1a1a6 !important; }
    .rule { border-color: #424245 !important; }
    .panel { background: #1c1c1e !important; }
    a { color: #5fc2b8 !important; }
    .cta td { background: #14857c !important; }
    .cta a { color: #ffffff !important; }
  }
  @media (max-width: 480px) { .heading { font-size: 28px !important; } }
</style></head>
<body class="page" style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader ?? input.body.split('\n')[0].slice(0, 120))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="page" style="background:#ffffff;"><tr><td align="center" style="padding:40px 20px 48px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;">
    <tr><td class="ink" style="padding:0 0 40px;font-family:${FONT};font-size:17px;font-weight:600;letter-spacing:-0.3px;color:${INK};">Sleek Connect Store</td></tr>
    <tr><td>
      ${tag}
      <h1 class="ink heading" style="margin:0 0 20px;font-family:${FONT};font-size:34px;line-height:1.12;font-weight:600;letter-spacing:-0.6px;color:${INK};">${escapeHtml(input.subject)}</h1>
      ${paragraphs}
      ${code}
      ${rows}
      ${action}
    </td></tr>
    <tr><td class="rule secondary" style="padding:40px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${SECONDARY};">
      ${input.reason ? `${escapeHtml(input.reason)}<br><br>` : ''}
      Sleek Connect Store, Accra, Ghana<br>
      <a href="${escapeHtml(input.helpUrl)}" style="text-decoration:none;">Help centre</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
