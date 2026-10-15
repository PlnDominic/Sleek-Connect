/**
 * Design tokens from the "Sleek Connect Storefront" design handoff.
 * Web exposes these as CSS custom properties; mobile reads them directly.
 */
export const colors = {
  ink: '#111111',
  canvas: '#FFFFFF',

  // Brand accent (beauty, primary actions, active states)
  accent: '#D43C0C',
  accentDeep: '#B33209',
  accentWarm: '#E2552C',
  accentBlob: '#D9472A',
  accentBlobLight: '#F07A5E',

  // Kids & safety accent
  teal: '#0F766E',
  tealInk: '#134E48',
  tealSoft: '#E3F0EC',
  tealPale: '#EDF5F2',
  tealMuted: '#9CC9C1',

  gold: '#F2B53A',
  blush: '#F4E3D7',

  // Neutrals
  surface: '#F5F5F5',
  surfaceHero: '#F4F4F4',
  surfaceSunken: '#EAEAEA',
  surfaceMap: '#EFEFEF',
  line: '#EBEBEB',
  lineSoft: '#EFEFEF',
  lineStrong: '#DDDDDD',
  lineInactive: '#CCCCCC',
  lineTrack: '#E0E0E0',
  textBody: '#444444',
  textSubtle: '#555555',
  textMuted: '#666666',
  textFaint: '#777777',
  textDisabled: '#888888',
  textPlaceholder: '#999999',

  // On dark surfaces
  onDark: '#CFCFCF',
  onDarkMuted: '#D6D6D6',
  darkLine: '#2A2A2A',

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
