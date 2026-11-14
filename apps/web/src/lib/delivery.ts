// The delivery quote and estimate rules live in the shared package so the app and the website agree.
export { estimate, formatCutoff, quote } from '@sleek/shared';
export type { DeliveryConfig, DeliveryOption, DeliveryQuote } from '@sleek/shared';
