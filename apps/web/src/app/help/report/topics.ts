/** What a support case can be about (public.support_topic). */
export const topics = {
  delivery: 'Delivery or tracking',
  damaged_or_wrong: 'Damaged, wrong or missing item',
  payment: 'Payment or refund',
  product_question: 'Question about a product',
  account: 'My account',
  other: 'Something else',
} as const;

export type Topic = keyof typeof topics;
