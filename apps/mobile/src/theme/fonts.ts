import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

/**
 * One font family per weight: SDK 57 can't group faces under a single family name,
 * so pick the family instead of setting `fontWeight` (which would synthesise on Android).
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type FontWeight = keyof typeof fonts;

export const fontFiles = {
  [fonts.regular]: PlusJakartaSans_400Regular,
  [fonts.medium]: PlusJakartaSans_500Medium,
  [fonts.semibold]: PlusJakartaSans_600SemiBold,
  [fonts.bold]: PlusJakartaSans_700Bold,
  [fonts.extrabold]: PlusJakartaSans_800ExtraBold,
};
