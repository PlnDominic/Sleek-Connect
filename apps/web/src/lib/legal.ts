/** When the terms and privacy notice were last changed. Update it whenever either page changes. */
export const legalUpdated = '29 October 2026';

const clean = (value: string | undefined) => value?.trim() || undefined;

/**
 * The company details the terms and privacy notice mention. Set them with environment variables; a sentence that needs
 * a detail is left out until it is set, so the pages never show a blank or a bracketed placeholder.
 */
export function businessDetails() {
  return {
    name: clean(process.env.BUSINESS_NAME),
    registrationNumber: clean(process.env.BUSINESS_REGISTRATION_NUMBER),
    address: clean(process.env.BUSINESS_ADDRESS),
    dataProtectionNumber: clean(process.env.DATA_PROTECTION_REGISTRATION_NUMBER),
    paymentProvider: clean(process.env.PAYMENT_PROVIDER_NAME),
  };
}
