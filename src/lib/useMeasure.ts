import { useEffect, useRef, useState } from 'react';

/** Tracks an element's rendered width so SVG charts can lay out in real pixels. */
export function useMeasure<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

/** Axis ticks rounded to 1/2/5 x 10^n, covering [0, max]. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / target;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? 10 * mag;
  // Keep stepping until the top tick actually covers `max`, so no mark overflows the plot.
  const ticks: number[] = [];
  for (let v = 0; ; v += step) {
    ticks.push(v);
    if (v >= max - step * 1e-9) break;
  }
  return ticks;
}
