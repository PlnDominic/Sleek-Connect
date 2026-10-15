import type { ProductKind } from './catalog';

/**
 * Icon geometry from the design, on a 24x24 grid. Stroke icons use round caps and joins;
 * `filled` icons are painted with the current colour instead of stroked.
 */
export type IconShape =
  | { type: 'path'; d: string; strokeWidth?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { type: 'rect'; x: number; y: number; width: number; height: number; rx?: number };

export interface IconDef {
  filled?: boolean;
  shapes: IconShape[];
}

const path = (d: string, strokeWidth?: number): IconShape => ({ type: 'path', d, strokeWidth });
const circle = (cx: number, cy: number, r: number, fill?: boolean): IconShape => ({ type: 'circle', cx, cy, r, fill });
const rect = (x: number, y: number, width: number, height: number, rx?: number): IconShape => ({
  type: 'rect',
  x,
  y,
  width,
  height,
  rx,
});

export const icons = {
  truck: { shapes: [path('M3 7h11v9H3z'), path('M14 10h4l3 3v3h-7'), circle(7, 18, 2), circle(17, 18, 2)] },
  star: {
    filled: true,
    shapes: [path('M12 2l2.9 6.9L22 9.6l-5.4 4.7L18.2 22 12 18.2 5.8 22l1.6-7.7L2 9.6l7.1-.7z')],
  },
  shieldCheck: { shapes: [path('M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z'), path('M9 12l2 2 4-4')] },
  chevronDown: { shapes: [path('M6 9l6 6 6-6')] },
  chevronLeft: { shapes: [path('M15 6l-6 6 6 6')] },
  chevronRight: { shapes: [path('M9 6l6 6-6 6')] },
  search: { shapes: [circle(11, 11, 7), path('M20 20l-4-4')] },
  heart: { shapes: [path('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z')] },
  user: { shapes: [circle(12, 8, 4), path('M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6')] },
  bag: { shapes: [path('M5 8h14l-1 12H6z'), path('M9 8V6a3 3 0 0 1 6 0v2')] },
  arrowRight: { shapes: [path('M5 12h14M13 6l6 6-6 6')] },
  lock: { shapes: [rect(5, 11, 14, 10, 2), path('M8 11V8a4 4 0 0 1 8 0v3')] },
  lockKeyhole: { shapes: [rect(5, 11, 14, 10, 2), path('M8 11V8a4 4 0 0 1 8 0v3'), circle(12, 16, 1.2, true)] },
  refresh: {
    shapes: [path('M4 12a8 8 0 0 1 14-5l2 2'), path('M20 4v5h-5'), path('M20 12a8 8 0 0 1-14 5l-2-2'), path('M4 20v-5h5')],
  },
  headset: {
    shapes: [path('M4 14v-2a8 8 0 0 1 16 0v2'), rect(3, 14, 4, 6, 1.5), rect(17, 14, 4, 6, 1.5), path('M19 20c0 1-2 2-5 2')],
  },
  smile: {
    shapes: [circle(12, 12, 9), path('M8.5 14c1 1.5 2.2 2 3.5 2s2.5-.5 3.5-2'), path('M9 9.5h.01M15 9.5h.01', 2.4)],
  },
  phone: { shapes: [rect(6, 2, 12, 20, 2), path('M11 18h2')] },
  card: { shapes: [rect(2, 5, 20, 14, 2), path('M2 10h20')] },
  bell: { shapes: [path('M6 16V11a6 6 0 0 1 12 0v5l2 2H4z'), path('M10 21h4')] },
  gift: {
    shapes: [rect(3, 8, 18, 13, 2), path('M12 8v13M3 12h18'), path('M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1z')],
  },
  home: { shapes: [path('M4 10l8-6 8 6v10H4z')] },
  grid: { shapes: [rect(4, 4, 7, 7, 2), rect(13, 4, 7, 7, 2), rect(4, 13, 7, 7, 2), rect(13, 13, 7, 7, 2)] },
  box: { shapes: [path('M3 7l9-4 9 4v10l-9 4-9-4z'), path('M3 7l9 4 9-4M12 11v10')] },
  pin: { shapes: [path('M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'), circle(12, 10, 2.5)] },
  calendar: { shapes: [rect(4, 5, 16, 16, 2), path('M4 10h16M9 3v4M15 3v4')] },
  plus: { shapes: [path('M12 5v14M5 12h14')] },
  call: {
    shapes: [path('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2')],
  },

  // Placeholder artwork for products and categories that have no photo yet
  bottle: { shapes: [rect(10, 2, 4, 4, 1), path('M9 6h6l1 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9z'), path('M8 12h8')] },
  jar: { shapes: [rect(6, 5, 12, 4, 1), rect(5, 9, 14, 11, 2)] },
  tube: { shapes: [path('M8 21h8l1-13H7z'), path('M10 8V4h4v4')] },
  garment: {
    shapes: [path('M8 3L3 7l3 3 2-1v12h8V9l2 1 3-3-5-4c-1 1.5-2.5 2-4 2S9 4.5 8 3z')],
  },
  toy: { shapes: [rect(4, 13, 7, 7, 1), rect(13, 13, 7, 7, 1), rect(8.5, 5, 7, 7, 1)] },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof icons;

export const kindIcon: Record<ProductKind, IconName> = {
  bottle: 'bottle',
  jar: 'jar',
  tube: 'tube',
  garment: 'garment',
  toy: 'toy',
  gift: 'gift',
};
