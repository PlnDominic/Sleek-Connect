import { colors as base } from '@sleek/shared';

type BaseKey = Exclude<keyof typeof base, 'avatar'>;
type Extra = 'warnSoft' | 'danger' | 'glass' | 'tabFill' | 'tabEdge' | 'tabLens' | 'tabIdle' | 'tabShadow';

/** Every colour the app reads, by role. `ink` is the main text and `canvas` the main surface in both schemes. */
export type Palette = Record<BaseKey | Extra, string> & { avatar: readonly string[] };

export const lightPalette: Palette = {
  ...base,
  warnSoft: '#FDF0D6',
  danger: '#B42318',
  glass: 'rgba(255,255,255,0.92)',
  tabFill: 'rgba(255,255,255,0.42)',
  tabEdge: 'rgba(255,255,255,0.85)',
  tabLens: 'rgba(255,255,255,0.78)',
  tabIdle: 'rgba(11,31,58,0.62)',
  tabShadow: '#0B1F3A',
};

// Dark: a true black canvas with raised charcoal surfaces, and a brighter teal so the accent keeps its contrast.
// Roles flip with the scheme (`ink` becomes the light text colour), so ink-on-canvas pairs stay legible.
export const darkPalette: Palette = {
  ...base,
  ink: '#F2F2F2',
  canvas: '#000000',
  accent: '#2BB3A6',
  accentDeep: '#7FD6CC',
  accentWarm: '#5FC2B8',
  accentBlob: '#14857C',
  accentBlobLight: '#2BB3A6',
  teal: '#2BB3A6',
  tealInk: '#BFE9E3',
  tealSoft: '#0F2321',
  tealPale: '#0B1B1A',
  tealMuted: '#2F6B65',
  gold: '#F2B53A',
  blush: '#1C1C1E',
  surface: '#111111',
  surfaceHero: '#1A1A1A',
  surfaceSunken: '#0A0A0A',
  surfaceMap: '#161616',
  line: '#262626',
  lineSoft: '#1C1C1C',
  lineStrong: '#333333',
  lineInactive: '#444444',
  lineTrack: '#2A2A2A',
  textBody: '#D4D4D4',
  textSubtle: '#BDBDBD',
  textMuted: '#A0A0A0',
  textFaint: '#8E8E8E',
  textDisabled: '#6B6B6B',
  textPlaceholder: '#707070',
  onDark: '#333333',
  onDarkMuted: '#4A4A4A',
  darkLine: '#D4D4D4',
  warnSoft: '#3A2E14',
  danger: '#FF8A80',
  glass: 'rgba(0,0,0,0.85)',
  tabFill: 'rgba(10,10,10,0.55)',
  tabEdge: 'rgba(255,255,255,0.14)',
  tabLens: 'rgba(255,255,255,0.14)',
  tabIdle: 'rgba(242,242,242,0.62)',
  tabShadow: '#000000',
};
