import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, icons, type IconName } from '@sleek/shared';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = colors.ink, strokeWidth = 1.8 }: IconProps) {
  const def = icons[name];
  const filled = 'filled' in def && def.filled;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? 'none' : color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {def.shapes.map((shape, i) => {
        switch (shape.type) {
          case 'path':
            return <Path key={i} d={shape.d} strokeWidth={shape.strokeWidth} />;
          case 'circle':
            return <Circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ? color : undefined} />;
          case 'rect':
            return <Rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
        }
      })}
    </Svg>
  );
}
