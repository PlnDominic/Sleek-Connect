-- An order the timer (or a failed answer) cancelled and a later payment put back to paid is written to the audit log, so staff can
-- see why a "cancelled" order became paid. The shopper's confirmation message is queued by the normal status-change trigger.
create function public.audit_reinstated_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.audit('order_reinstated_after_payment', 'order', new.id::text,
    jsonb_build_object('order_number', new.order_number, 'earlier_cancel_reason', old.cancel_reason));
  return null;
end;
$$;

revoke all on function public.audit_reinstated_order() from public, anon, authenticated;

create trigger orders_audit_reinstated
  after update of status on public.orders
  for each row when (old.status = 'cancelled' and new.status = 'paid')
  execute function public.audit_reinstated_order();
