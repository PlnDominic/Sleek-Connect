# Pay on delivery

Shoppers can choose **Pay on delivery** at checkout (website and app): they pay the rider in cash when the order arrives.
There is no bank transfer option. Online Mobile Money is unchanged.

## How an order moves

| Step | Who | What happens |
| --- | --- | --- |
| Place | Shopper | `place_order` with `{"method": "cod"}`. Stock is reserved for **24 hours** (Settings → Pay on delivery), not minutes. The shopper gets an "order received" email saying we will call. The store gets a new-order alert. |
| Confirm | Staff (operations or admin) | Admin → Orders → **To confirm**. Call the customer, then press **Confirm order**. The reservation becomes a sale and the order joins **To pack**. The customer is told by text and email. An order nobody confirms is cancelled when the hold runs out and its stock goes back on sale. |
| Pack, dispatch | Staff | As for any order. |
| Deliver | Staff / rider | The order page shows **Collect GH₵ X in cash**. **Mark as delivered** needs the "I collected GH₵ X" tick (and the delivery code, if required). That records a cash payment, sets `paid_at` and `cash_collected_ghs`, and writes the audit log. |

Nothing is "paid" until the cash is collected, so sales figures and receipts count a pay-on-delivery order only when the
rider hands the order over, and cancelling or failing a delivery never flags a refund.

## Limits (Admin → Settings → Pay on delivery)

- A switch to offer it or not.
- **Hold for confirmation (hours)**, 1 to 168.
- **Largest order (GH₵)**, or empty for no limit. Bigger orders must be paid online.
- At most three unconfirmed pay-on-delivery orders per phone number at a time (so it can't be used to lock up stock).
- Not offered for items sold by independent stores (they are paid for online), or while the delivery fee is unknown.

## For developers

- Migration: `supabase/migrations/20261030100000_pay_on_delivery.sql`. Functions: `place_order`, `admin_confirm_cod_order`,
  `admin_mark_delivered` (new `p_cash_collected` argument), `cancel_my_order`, `start_payment` (refuses cod),
  `get_order` (`cod_confirmed_at`), `queue_order_notifications` (`pay_on_delivery` in the payload).
- The app tells the website about a pay-on-delivery order with `POST /api/payments/cod` (sends the pending emails and the
  store alert); it never touches the payment provider.
- Tests: `tests/db-pay-on-delivery.cjs`, the pay-on-delivery checks in `tests/e2e-shop.cjs` and `tests/unit-email.cjs`.
