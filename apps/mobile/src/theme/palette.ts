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

// Dark: a deep navy canvas with raised surfaces, and a brighter teal so the accent keeps its contrast.
// Roles flip with the scheme (`ink` becomes the light text colour), so ink-on-canvas pairs stay legible.
export const darkPalette: Palette = {
  ...base,
  ink: '#EAF0F8',
  canvas: '#0B1220',
  accent: '#2BB3A6',
  accentDeep: '#7FD6CC',
  accentWarm: '#5FC2B8',
  accentBlob: '#14857C',
  accentBlobLight: '#2BB3A6',
  teal: '#2BB3A6',
  tealInk: '#BFE9E3',
  tealSoft: '#12322F',
  tealPale: '#0F2A28',
  tealMuted: '#2F6B65',
  gold: '#F2B53A',
  blush: '#1B2A44',
  surface: '#121B2D',
  surfaceHero: '#16233A',
  surfaceSunken: '#070C16',
  surfaceMap: '#142036',
  line: '#22304A',
  lineSoft: '#1A263C',
  lineStrong: '#2C3C5A',
  lineInactive: '#3B4C6B',
  lineTrack: '#26354F',
  textBody: '#C9D4E5',
  textSubtle: '#B4C1D6',
  textMuted: '#98A6BD',
  textFaint: '#8896AE',
  textDisabled: '#66748D',
  textPlaceholder: '#6B7A93',
  onDark: '#2F3E57',
  onDarkMuted: '#41506A',
  darkLine: '#D5DCE6',
  warnSoft: '#3A2E14',
  danger: '#FF8A80',
  glass: 'rgba(11,18,32,0.85)',
  tabFill: 'rgba(14,22,38,0.55)',
  tabEdge: 'rgba(255,255,255,0.14)',
  tabLens: 'rgba(255,255,255,0.14)',
  tabIdle: 'rgba(234,240,248,0.62)',
  tabShadow: '#000000',
};
