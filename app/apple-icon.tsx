import { ImageResponse } from 'next/og'

// Route segment config
export const runtime = 'edge'

// Image metadata
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          fontSize: 120,
          background: '#F59E0B',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'black',
          borderRadius: '20%',
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 256 256"
          fill="none"
        >
          <path
            d="M224,200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V104a8,8,0,0,1,12.8-6.4L80,124.26V104a8,8,0,0,1,12.8-6.4L128,124.26V104a8,8,0,0,1,12.8-6.4L176,124.26V80a8,8,0,0,1,8-8h32a8,8,0,0,1,8,8Z"
            fill="currentColor"
            fillOpacity="0.2"
          />
          <path
            d="M32,208H224"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="16"
          />
          <path
            d="M224,200V80a8,8,0,0,0-8-8H184a8,8,0,0,0-8,8v44.26L140.8,97.6A8,8,0,0,0,128,104v20.26L92.8,97.6A8,8,0,0,0,80,104v20.26L44.8,97.6A8,8,0,0,0,32,104v96a8,8,0,0,0,8,8H216A8,8,0,0,0,224,200Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="16"
          />
        </svg>
      </div>
    ),
    // ImageResponse options
    {
      // For convenience, we can re-use the exported icons size metadata
      // config to also set the ImageResponse's width and height.
      ...size,
    }
  )
}
