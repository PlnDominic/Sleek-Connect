'use client';

import { useState, useTransition } from 'react';
import { parseCsv } from '@/lib/admin/csv';
import { readImport, type ImportRow } from '@/lib/admin/product-import';
import { importProducts, type ImportResult } from '../actions';
import styles from '../../admin.module.css';

export function ImportForm() {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [importing, startImport] = useTransition();

  const load = async (file: File | undefined) => {
    setResults(null);
    setRows(null);
    setError(null);
    if (!file) return;
    const read = readImport(parseCsv(await file.text()));
    if (read.error) setError(read.error);
    else setRows(read.rows);
  };

  const valid = rows?.filter((r) => r.errors.length === 0).length ?? 0;

  return (
    <section className={styles.panel} aria-labelledby="import-title">
      <h2 id="import-title">Upload</h2>
      <label className={styles.field}>
        <span>CSV file</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => load(e.target.files?.[0])} />
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {rows && !results && (
        <>
          <p>
            {rows.length} rows: {valid} ready to import
            {rows.length - valid > 0 && `, ${rows.length - valid} with problems (fix them in the file and upload again, or import the rest)`}.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Name</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Department</th>
                  <th scope="col">Publish</th>
                  <th scope="col">Problems</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} data-alert={r.errors.length > 0 || undefined}>
                    <td>{r.line}</td>
                    <td>{r.values.name}</td>
                    <td>{r.values.slug ?? '(from name)'}</td>
                    <td>{r.values.department}</td>
                    <td>{r.values.publish ?? 'no'}</td>
                    <td>{r.errors.join('; ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.primary}
              disabled={valid === 0 || importing}
              onClick={() => startImport(async () => setResults(await importProducts(rows)))}
            >
              {importing ? 'Importing…' : `Import ${valid} ${valid === 1 ? 'row' : 'rows'}`}
            </button>
          </div>
        </>
      )}

      {results && (
        <>
          <p role="status">
            Done: {results.filter((r) => r.outcome === 'published').length} published,{' '}
            {results.filter((r) => r.outcome === 'draft').length} saved as drafts,{' '}
            {results.filter((r) => r.outcome === 'error').length} not imported.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Name</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.line} data-alert={r.outcome === 'error' || undefined}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
