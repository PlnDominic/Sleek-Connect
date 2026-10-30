import { ImageResponse } from 'next/og';
import { colors } from '@sleek/shared';

export const alt = 'Sleek Connect Store: beauty, home, fashion and kids essentials in Accra';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The picture shown when a page of the store is shared and has no photo of its own. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: `linear-gradient(135deg, ${colors.blush} 0%, #ffffff 70%)`,
          color: colors.ink,
        }}
      >
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -3 }}>
          <span>Sleek&nbsp;</span>
          <span style={{ color: colors.accent }}>Connect</span>
          <span>&nbsp;Store</span>
        </div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 40, color: '#555555' }}>
          Beauty, home, fashion and kids essentials, delivered across Accra
        </div>
        <div style={{ display: 'flex', marginTop: 48, width: 160, height: 8, borderRadius: 4, background: colors.accent }} />
      </div>
    ),
    size,
  );
}
