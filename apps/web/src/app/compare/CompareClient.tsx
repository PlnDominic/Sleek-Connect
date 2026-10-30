'use client';
import Link from 'next/link';
import { formatPrice, type Product } from '@sleek/shared';
import { useCompare } from '@/components/CompareProvider';
import styles from '@/components/compare.module.css';
export function CompareClient() {
  const { products, clear, toggle } = useCompare();
  const rows: [string, (p: Product) => React.ReactNode][] = [
    ['Price', (p) => formatPrice(p.price)],
    ['Rating', (p) => p.reviewCount ? `${p.rating?.toFixed(1)} / 5 (${p.reviewCount} reviews)` : 'No reviews yet'],
    ['Availability', (p) => p.inStock === false ? 'Sold out' : 'In stock'],
    ['Sizes', (p) => p.sizes?.map((s) => `${s.label} · ${formatPrice(s.price)}`).join(', ') ?? 'One size'],
    ['Age range', (p) => p.details?.recommendedAge ?? p.ageBands?.join(', ') ?? 'Not specified'],
    ['Ingredients / materials', (p) => p.compliance?.ingredients ?? 'See product details'],
    ['Safety notes', (p) => p.warningLabel ?? p.details?.warnings ?? 'No special warning listed'],
  ];
  return <main className={`container ${styles.comparePage}`}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}><div><h1>Compare products</h1><p>Review the details side by side before choosing.</p></div>{products.length > 0 && <button type="button" onClick={clear}>Clear all</button>}</div>
    {products.length < 2 ? <div style={{ marginTop: 32 }}><p>Select at least two products using Compare on product cards.</p><Link href="/shop">Browse the shop</Link></div> : <div className={styles.tableWrap} style={{ marginTop: 28 }}><table className={styles.table}><thead><tr><th>Product</th>{products.map((p) => <th key={p.slug}><button type="button" className={styles.remove} onClick={() => toggle(p)}>Remove</button><Link href={`/products/${p.slug}`} className={styles.productName}>{p.name}</Link></th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label}><th>{label}</th>{products.map((p) => <td key={p.slug}>{value(p)}</td>)}</tr>)}</tbody></table></div>}
  </main>;
}
