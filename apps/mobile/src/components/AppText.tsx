import { Text, type TextProps } from 'react-native';
import { useColors } from '@/theme/theme';
import { fonts, type FontWeight } from '@/theme/fonts';

interface AppTextProps extends TextProps {
  weight?: FontWeight;
  size?: number;
  color?: string;
}

/** Text in Plus Jakarta Sans, with the design's default ink colour. */
export function AppText({ weight = 'regular', size = 14, color, style, ...rest }: AppTextProps) {
  const colors = useColors();
  return <Text {...rest} style={[{ fontFamily: fonts[weight], fontSize: size, color: color ?? colors.ink }, style]} />;
}
