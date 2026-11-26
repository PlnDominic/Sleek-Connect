import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { skuChoices, skuProductColumns } from '@/lib/admin/sku-options';
import { PurchaseOrderForm } from '../PurchaseOrderForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'New purchase order' };

export default async function NewPurchaseOrderPage() {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'purchasing.edit')) return <p className={styles.notice}>Only operations staff and admins can create purchase orders.</p>;
  const [{ data: supplierRows }, { data: products }] = await Promise.all([
    staff.supabase.rpc('admin_supplier_options'),
    staff.supabase.from('products').select(skuProductColumns).order('name'),
  ]);
  const skus = skuChoices(products ?? []);
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
