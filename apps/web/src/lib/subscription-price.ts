/**
 * The yearly store fee shown as a daily price ("GH₵0.82 a day"). It is only a way of showing the same fee: the seller is
 * charged the whole yearly amount in one payment, and the page always says so next to the daily price.
 */
export function dailyFee(annualGhs: number): string {
  return (annualGhs / 365).toFixed(2);
}
