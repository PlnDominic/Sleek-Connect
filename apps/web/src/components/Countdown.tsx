'use client';

import { useEffect, useState } from 'react';

const parts = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { value: Math.floor(s / 86400), unit: 'Days' },
    { value: Math.floor((s % 86400) / 3600), unit: 'Hours' },
    { value: Math.floor((s % 3600) / 60), unit: 'Mins' },
    { value: s % 60, unit: 'Secs' },
  ];
};

/** A live countdown to `to`. Renders nothing until mounted (the server can't know the visitor's clock) or once over. */
export function Countdown({ to, className, partClassName }: { to: string; className?: string; partClassName?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const end = new Date(to).getTime();
  if (now === null || end <= now) return null;
  const p = parts(end - now);
  return (
    <div className={className} role="timer" aria-label={`Ends in ${p[0].value} days, ${p[1].value} hours, ${p[2].value} minutes`}>
      {p.map((part, i) => (
        <span key={part.unit} className={partClassName}>
          {i > 0 && <strong aria-hidden="true">:</strong>}
          <span>
            <strong>{String(part.value).padStart(2, '0')}</strong>
            <span>{part.unit}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
