import type { CSSProperties } from 'react';
import { colors, darkColors, radii } from '@sleek/shared';

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

/** The dark scheme as CSS: applies when <html data-theme="dark"> is set (see `themeScript`). `!important` because the light values are inline on <html>. */
export const darkThemeCss = `html[data-theme="dark"]{color-scheme:dark;--c-on-accent:#00110f !important;--c-warn-ink:#f2c46d !important;--c-warn-soft:#3a2e14 !important;--c-warn-text:#f2d9a0 !important;--c-solid:#161616 !important;--c-on-solid:#cbd5e4 !important;--c-danger:#ff8a80 !important;${Object.entries(darkColors)
  .map(([key, value]) => `--c-${kebab(key)}:${value} !important`)
  .join(';')}}`;

/**
 * Runs before the page paints so there is no flash: sets data-theme from the shopper's choice (Light, Dark or Auto, kept on this
 * device under "sc-theme"; Auto, which follows the device, until they choose otherwise). The admin console keeps its own look.
 */
export const themeScript = `try{var p=location.pathname;if(p.indexOf('/admin')!==0){var c=localStorage.getItem('sc-theme');var d=c==='dark'||((c===null||c==='auto')&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`;
