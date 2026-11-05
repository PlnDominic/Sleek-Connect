import Svg, { Path } from 'react-native-svg';

export type TabIconName = 'home' | 'shop' | 'saved' | 'bag' | 'account';

// Tab bar icons on a 24 grid: soft, rounded outlines. The current tab gets a duotone treatment,
// a translucent fill of the same colour behind a slightly heavier line.
const glyphs: Record<TabIconName, { fill: string; lines: string[] }> = {
  home: {
    fill: 'M4 11.2 12 4.2l8 7V19a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19z',
    lines: ['M3.2 11.6 11 4.8a1.5 1.5 0 0 1 2 0l7.8 6.8', 'M5 10.2V19a1.8 1.8 0 0 0 1.8 1.8h10.4A1.8 1.8 0 0 0 19 19v-8.8', 'M9.8 20.8v-4.6a2.2 2.2 0 0 1 4.4 0v4.6'],
  },
  shop: {
    fill: 'M5.5 4h3.4a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 8.9V5.5A1.5 1.5 0 0 1 5.5 4zm9.6 9.6h3.4a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5h-3.4a1.5 1.5 0 0 1-1.5-1.5v-3.4a1.5 1.5 0 0 1 1.5-1.5z',
    lines: [
      'M5.5 4h3.4a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 8.9V5.5A1.5 1.5 0 0 1 5.5 4z',
      'M15.1 4h3.4A1.5 1.5 0 0 1 20 5.5v3.4a1.5 1.5 0 0 1-1.5 1.5h-3.4a1.5 1.5 0 0 1-1.5-1.5V5.5A1.5 1.5 0 0 1 15.1 4z',
      'M5.5 13.6h3.4a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5v-3.4a1.5 1.5 0 0 1 1.5-1.5z',
      'M15.1 13.6h3.4a1.5 1.5 0 0 1 1.5 1.5v3.4a1.5 1.5 0 0 1-1.5 1.5h-3.4a1.5 1.5 0 0 1-1.5-1.5v-3.4a1.5 1.5 0 0 1 1.5-1.5z',
    ],
  },
  saved: {
    fill: 'M12 20.2C6.8 16.6 4 13.5 4 10A4.3 4.3 0 0 1 8.3 5.6c1.5 0 2.8.7 3.7 2 .9-1.3 2.2-2 3.7-2A4.3 4.3 0 0 1 20 10c0 3.5-2.8 6.6-8 10.2z',
    lines: ['M12 20.2C6.8 16.6 4 13.5 4 10A4.3 4.3 0 0 1 8.3 5.6c1.5 0 2.8.7 3.7 2 .9-1.3 2.2-2 3.7-2A4.3 4.3 0 0 1 20 10c0 3.5-2.8 6.6-8 10.2z'],
  },
  bag: {
    fill: 'M6.3 8h11.4a1 1 0 0 1 1 .9l.9 9.5a2 2 0 0 1-2 2.2H6.4a2 2 0 0 1-2-2.2l.9-9.5a1 1 0 0 1 1-.9z',
    lines: ['M6.3 8h11.4a1 1 0 0 1 1 .9l.9 9.5a2 2 0 0 1-2 2.2H6.4a2 2 0 0 1-2-2.2l.9-9.5a1 1 0 0 1 1-.9z', 'M8.8 10.4V7.6a3.2 3.2 0 0 1 6.4 0v2.8'],
  },
  account: {
    fill: 'M4.6 20.2c.7-3.6 3.6-5.8 7.4-5.8s6.7 2.2 7.4 5.8z M12 4.6a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z',
    lines: ['M12 4.6a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z', 'M4.6 20.2c.7-3.6 3.6-5.8 7.4-5.8s6.7 2.2 7.4 5.8'],
  },
};

interface TabIconProps {
  name: TabIconName;
  color: string;
  active?: boolean;
  size?: number;
}

export function TabIcon({ name, color, active = false, size = 26 }: TabIconProps) {
  const g = glyphs[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      {active && <Path d={g.fill} fill={color} fillOpacity={0.2} />}
      {g.lines.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={active ? 1.9 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
