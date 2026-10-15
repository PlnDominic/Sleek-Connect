'use client';

import { useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from '@/app/home.module.css';

/** Horizontally scrolling product row with previous/next controls. */
export function NewArrivalsRail({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);

  const scroll = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    el.scrollBy({ left: direction * ((card?.offsetWidth ?? 180) + 16), behavior: 'smooth' });
  };

  return (
    <div className={styles.rail}>
      <button type="button" aria-label="Previous products" className={`${styles.railArrow} ${styles.railPrev}`} onClick={() => scroll(-1)}>
        <Icon name="chevronLeft" size={16} strokeWidth={2} />
      </button>
      <button type="button" aria-label="Next products" className={`${styles.railArrow} ${styles.railNext}`} onClick={() => scroll(1)}>
        <Icon name="chevronRight" size={16} strokeWidth={2} />
      </button>
      <div ref={track} className={styles.railTrack}>
        {children}
      </div>
    </div>
  );
}
