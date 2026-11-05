import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { PurchaseOrderForm } from '../PurchaseOrderForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'purchasing.edit')) return <p className={styles.notice}>Only operations staff and admins can create purchase orders.</p>;
  const [{ data: supplierRows }, { data: levels }] = await Promise.all([staff.supabase.rpc('admin_supplier_options'), staff.supabase.rpc('admin_stock_overview')]);
  const skus = (levels ?? []).map((l) => ({ value: `${l.product_id}|${l.size_code}`, label: `${l.product_name}${l.size_label ? `, ${l.size_label}` : ''}` }));
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>New purchase order</h1>
          <p className={styles.muted}>
            Pick the supplier and the products. Add suppliers under <Link href="/admin/suppliers">Suppliers</Link> and products under Products.
          </p>
        </div>
      </div>
      <PurchaseOrderForm id={null} suppliers={(supplierRows ?? []) as unknown as { id: string; name: string }[]} skus={skus} />
    </>
  );
}
