import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import styles from './legal.module.css';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** A detail the business still has to fill in, shown the same way as other bracketed placeholders. */
export function Todo({ children }: { children: ReactNode }) {
  return <span className={styles.todo}>[{children}]</span>;
}

/** Shared layout for the terms of service and privacy notice: a heading, a contents list and numbered sections. */
export function LegalPage({ title, intro, updated, sections }: { title: string; intro: ReactNode; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <SiteHeader />
      <main>
        <div className={styles.hero}>
          <div className="container">
            <h1>{title}</h1>
            <p>{intro}</p>
            <p className={styles.updated}>Last updated {updated}</p>
          </div>
        </div>
        <div className={`container ${styles.layout}`}>
          <nav aria-label="Contents" className={styles.toc}>
            <strong>Contents</strong>
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`}>
                {i + 1}. {s.title}
              </a>
            ))}
          </nav>
          <div className={styles.body}>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>
                  {i + 1}. {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
