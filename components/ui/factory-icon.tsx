import React from 'react';

interface FactoryIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

export function FactoryIcon({ size = 24, ...props }: FactoryIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M224,200a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V104a8,8,0,0,1,12.8-6.4L80,124.26V104a8,8,0,0,1,12.8-6.4L128,124.26V104a8,8,0,0,1,12.8-6.4L176,124.26V80a8,8,0,0,1,8-8h32a8,8,0,0,1,8,8Z"
        fill="currentColor"
        opacity="0.2"
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
      <line
        x1="184"
        y1="112"
        x2="216"
        y2="112"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
      <line
        x1="184"
        y1="144"
        x2="216"
        y2="144"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
    </svg>
  );
}
