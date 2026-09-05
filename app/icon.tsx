import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

/**
 * The favicon.
 *
 * The registration mark on the ground colour rather than on the accent: at
 * 16px a saturated square is a coloured blob, while the mark's corners still
 * read as a shape. The accent is carried by the plate inside it.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#2A2622',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '22%',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7.5V3h4.5M16.5 3H21v4.5M21 16.5V21h-4.5M7.5 21H3v-4.5"
            stroke="#E8E4DE"
            strokeWidth="1.8"
          />
          <path d="M7 7h7.5L17 9.5V17H7V7Z" fill="#C4482E" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
