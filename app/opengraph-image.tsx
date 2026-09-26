import { ImageResponse } from 'next/og'
import { APP_NAME } from '@/lib/constants'

export const alt = `${APP_NAME}: describe an app, ship it to Cloudflare`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * The share card. The same plate as the favicon, at a size where the headline
 * can carry the claim. Hex values mirror the dark tokens in globals.css,
 * because ImageResponse cannot read CSS variables.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#16130F',
          color: '#E8E4DE',
          backgroundImage:
            'linear-gradient(#2A2622 1px, transparent 1px), linear-gradient(90deg, #2A2622 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 7.5V3h4.5M16.5 3H21v4.5M21 16.5V21h-4.5M7.5 21H3v-4.5"
              stroke="#E8E4DE"
              strokeWidth="1.8"
            />
            <path d="M7 7h7.5L17 9.5V17H7V7Z" fill="#C4482E" />
          </svg>
          <span style={{ fontSize: 30, letterSpacing: '-0.02em' }}>factory</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, letterSpacing: '-0.035em', maxWidth: 900 }}>
            Describe it once. Ship it to the edge.
          </div>
          <div style={{ fontSize: 30, color: '#A69F95', maxWidth: 880 }}>
            Real files you can read, deployed into your own Cloudflare account.
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
