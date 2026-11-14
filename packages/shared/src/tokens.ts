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
  tealPale: '#F4F5F6',
  tealMuted: '#9CC9C1',

  gold: '#F2B53A',
  blush: '#EEEFF1',

  // Neutrals
  surface: '#F6F6F7',
  surfaceHero: '#F4F4F5',
  surfaceSunken: '#E9E9EB',
  surfaceMap: '#EFEFF1',
  line: '#E6E6E9',
  lineSoft: '#EEEEF0',
  lineStrong: '#D9D9DE',
  lineInactive: '#C3CCD9',
  lineTrack: '#DFDFE4',
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

/**
 * The dark scheme for the website, the same look as the mobile app's dark theme: a true black canvas with charcoal surfaces and a
 * brighter teal. Roles flip with the scheme (`ink` becomes the light text colour), so ink-on-canvas pairs stay legible.
 */
export const darkColors: Partial<Record<keyof typeof colors, string>> = {
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
};

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
