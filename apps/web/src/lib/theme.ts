import type { CSSProperties } from 'react';
import { colors, radii } from '@sleek/shared';

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const vars: Record<string, string> = {};
for (const [key, value] of Object.entries(colors)) {
  if (typeof value === 'string') vars[`--c-${kebab(key)}`] = value;
}
for (const [key, value] of Object.entries(radii)) {
  vars[`--r-${key}`] = `${value}px`;
}

/** Exposes the shared design tokens as CSS custom properties: `--c-accent-deep`, `--r-xl`, … */
export const themeVars = vars as CSSProperties;
