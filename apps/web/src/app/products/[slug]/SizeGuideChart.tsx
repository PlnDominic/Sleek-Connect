import type { SizeGuide } from '@/lib/catalog';
import styles from './product.module.css';

/** A product's size chart, folded away until opened. Plain HTML, so it works without scripts and reads well to a screen reader. */
export function SizeGuideChart({ guide }: { guide: SizeGuide }) {
  return (
    <details className={styles.sizeGuide}>
      <summary>Size guide: {guide.title}</summary>
      {guide.intro && <p className={styles.sizeGuideIntro}>{guide.intro}</p>}
      <div className={styles.sizeGuideTable}>
        <table>
          <caption className="visually-hidden">{guide.title}</caption>
          <thead>
            <tr>
              {guide.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guide.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  )
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
