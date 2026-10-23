/**
 * Design tokens from the "Sleek Connect Storefront" design handoff.
 * Web exposes these as CSS custom properties; mobile reads them directly.
 */
export const colors = {
  ink: '#0B1F3A',
  canvas: '#FFFFFF',

  // Brand accent: teal (primary actions, highlights, active states). Midnight navy is `ink`; white is `canvas`.
  accent: '#0F766E',
  accentDeep: '#0B5D57',
  accentWarm: '#2BB3A6',
  accentBlob: '#14857C',
  accentBlobLight: '#5FC2B8',

  // Kids & safety accent
  teal: '#0F766E',
  tealInk: '#134E48',
  tealSoft: '#E3F0EC',
  tealPale: '#EDF5F2',
  tealMuted: '#9CC9C1',

  gold: '#F2B53A',
  blush: '#E8EEF5',

  // Neutrals
  surface: '#F5F7FA',
  surfaceHero: '#F3F6F9',
  surfaceSunken: '#E7ECF2',
  surfaceMap: '#EDF1F5',
  line: '#E4E9F0',
  lineSoft: '#ECF0F5',
  lineStrong: '#D5DCE6',
  lineInactive: '#C3CCD9',
  lineTrack: '#DCE2EB',
  textBody: '#2F3E57',
  textSubtle: '#41506A',
  textMuted: '#55617A',
  textFaint: '#66728A',
  textDisabled: '#8791A3',
  textPlaceholder: '#98A1B1',

  // On dark surfaces
  onDark: '#CBD5E4',
  onDarkMuted: '#D5DDEA',
  darkLine: '#23395A',

  // Decorative skin-tone swatches used for the social-proof avatars
  avatar: ['#C9A38A', '#7E5A45', '#A9785B', '#5C3F30'],
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  xxl: 12,
  pill: 999,
} as const;

export const fontFamily = 'Plus Jakarta Sans';

export const shadows = {
  card: '0 10px 30px rgba(0,0,0,0.08)',
  float: '0 4px 14px rgba(0,0,0,0.06)',
  segment: '0 2px 8px rgba(0,0,0,0.08)',
} as const;
