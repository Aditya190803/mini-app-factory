'use client'

import * as React from 'react'

const STACK_THEME_STYLE_ID = '--stack-theme-mode'

function applyStackThemeMode() {
  const html = document.documentElement
  const mode = html.classList.contains('dark') ? 'dark' : 'light'
  let marker = document.getElementById(STACK_THEME_STYLE_ID)
  if (!marker) {
    marker = document.createElement('style')
    marker.id = STACK_THEME_STYLE_ID
    document.head.appendChild(marker)
  }
  marker.setAttribute('data-stack-theme', mode)
}

/**
 * Stack Auth's <StackTheme> injects a <script> from a Client Component, which
 * React 19 warns about and does not execute on the client. Theme sync is done
 * here with a layout effect instead. CSS for .stack-scope lives in globals.css.
 */
export function StackTheme({ children }: { children: React.ReactNode }) {
  React.useLayoutEffect(() => {
    applyStackThemeMode()
    const html = document.documentElement
    const observer = new MutationObserver(applyStackThemeMode)
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return children
}
