import styles from './admin.module.css';

/** The confirmation banner for `flash()`. */
export function Flash({ message }: { message: string | string[] | undefined }) {
  if (typeof message !== 'string' || !message) return null;
  return (
    <p role="status" className={styles.success}>
      {message}
    </p>
  );
}
