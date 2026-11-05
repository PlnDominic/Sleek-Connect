# Purchasing, stock counts, supplier payments and profit

All of this sits behind `admin_*` functions (the tables have no direct grants). Purchase orders and stock counts: operations and admin. Profit and money owed to suppliers: finance and admin.

## Purchasing (Admin → Catalogue → Purchasing)

1. **New purchase order:** choose the supplier and the products, with a quantity and the cost per unit for each. It starts as a **draft** you can edit.
   *Order what's running low* makes a draft from the reorder suggestions for the products whose usual supplier is the one you pick (cost = the last price paid).
2. **Place order:** marks it as sent to the supplier (you contact them yourself).
3. **Receive stock:** when goods arrive, enter how many arrived per line with the batch number (and expiry for cosmetics). Each delivery goes into stock through
   `admin_receive_stock_from`, so it carries the supplier, cost and the order number as the reference, and shows in the supplier's history.
   Part deliveries leave the order **part received**; **Mark as complete** closes a short one. An order nothing was received on can be **cancelled**.

## Stock counts (Admin → Inventory → Stock count)

Type what you counted for each batch you checked; empty rows are left alone. Differences are recorded as *found* or *lost* with your note and name.

## What we owe suppliers (Admin → Suppliers → a supplier)

Owed = cost of everything received (units × cost each) minus payments recorded. **Record payment** (amount, date, Mobile Money, bank, cash or other, reference). Deliveries received without a cost are not counted;
the page says how many units those are.

## Profit (Admin → Sales → Profit)

For paid orders in the period (cancelled and returned left out): **sales** are the item prices before discounts and delivery fees, **cost** is what the batches the items were packed from cost,
**profit** and **margin** are worked out only on units whose cost is known (the page shows how much of the sales that covers). **Stock on the shelves** is the value of available and quarantined
batches at cost. Costs are recorded when stock is received with a cost (a purchase order, or the Receive stock form); older stock without costs shows as "no cost recorded". CSV export included.
