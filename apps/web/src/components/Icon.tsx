import { icons, type IconName } from '@sleek/shared';

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className }: IconProps) {
  const def = icons[name];
  const filled = 'filled' in def && def.filled;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flex: 'none' }}
    >
      {def.shapes.map((shape, i) => {
        switch (shape.type) {
          case 'path':
            return <path key={i} d={shape.d} strokeWidth={shape.strokeWidth} />;
          case 'circle':
            return <circle key={i} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill ? 'currentColor' : undefined} />;
          case 'rect':
            return <rect key={i} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />;
        }
      })}
    </svg>
  );
}
