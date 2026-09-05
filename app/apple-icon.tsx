import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/**
 * The touch icon. Same mark, more room, so the registration corners get to sit
 * at their intended weight instead of being thickened for legibility.
 */
export default function AppleIcon() {
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
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 7.5V3h4.5M16.5 3H21v4.5M21 16.5V21h-4.5M7.5 21H3v-4.5"
            stroke="#E8E4DE"
            strokeWidth="1.5"
          />
          <path d="M7 7h7.5L17 9.5V17H7V7Z" fill="#C4482E" />
          <path d="M14.5 7v2.5H17" stroke="#2A2622" strokeWidth="1.1" fill="none" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
