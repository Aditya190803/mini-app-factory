'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Enter-on-view for brand surfaces only. Honours reduced motion by showing
 * the content immediately. Product UI does not use this.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduce.matches) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.18 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(!shown && 'opacity-0', shown && 'anim-rise', className)}
    >
      {children}
    </div>
  )
}
