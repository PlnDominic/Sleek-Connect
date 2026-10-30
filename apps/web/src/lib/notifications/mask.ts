/**
 * A recipient made safe to print in logs: enough to tell messages apart and spot a typo, not enough to contact
 * anyone. Emails keep their first letter and domain, phone numbers their last three digits, push tokens their start.
 */
export function maskRecipient(value: string): string {
  const v = value.trim();
  if (v.includes('@')) {
    const [local, domain] = [v.slice(0, v.lastIndexOf('@')), v.slice(v.lastIndexOf('@') + 1)];
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (/PushToken\[/.test(v)) return `${v.slice(0, v.indexOf('[') + 5)}…]`;
  const digits = v.replace(/\D/g, '');
  return digits.length > 3 ? `***${digits.slice(-3)}` : '***';
}
