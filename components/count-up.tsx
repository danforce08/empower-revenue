'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated counter — eases the displayed integer from its previous render
 * value to the new `value` over `duration` ms. Honors prefers-reduced-motion.
 */
export function CountUp({
  value,
  duration = 600,
  formatter = (v) => Math.round(v).toLocaleString('en-US'),
  className = '',
}: {
  value: number;
  duration?: number;
  formatter?: (v: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (display === value) return;

    // Reduced-motion: snap directly
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <span className={`num ${className}`} aria-live="polite">
      {formatter(display)}
    </span>
  );
}
