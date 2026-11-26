/** A Ghana phone number in international digits, e.g. "024 123 4567" → "233241234567". */
export function internationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return `233${digits.slice(1)}`;
  return digits;
}

export const telHref = (phone: string) => `tel:+${internationalDigits(phone)}`;

export const whatsappHref = (phone: string, text?: string) =>
  `https://wa.me/${internationalDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
