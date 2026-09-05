import React from 'react'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { StackProvider, StackTheme } from '@stackframe/stack'
import { Analytics } from '@vercel/analytics/next'
import { stackClientApp } from '../stack/client'
import { ConvexClientProvider } from '@/components/convex-client-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/kit'
import { Toaster } from '@/components/kit/toaster'
import { SiteFooter } from '@/components/shell/footer'
import { APP_DESCRIPTION, APP_NAME } from '@/lib/constants'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME}: describe an app, ship it to Cloudflare`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
}

/**
 * The theme colour follows the two grounds, so the browser chrome on mobile
 * stops fighting the page.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'oklch(0.981 0.003 78)' },
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.163 0.006 62)' },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans" suppressHydrationWarning>
        {/*
          Dark is the default because of who is using this and when: someone at
          a desk in the evening, reading generated files. System still wins if
          the user has expressed a preference at the OS level.
        */}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <React.Suspense fallback={<div className="min-h-dvh bg-[var(--background)]" />}>
            <StackProvider app={stackClientApp}>
              <StackTheme>
                <ConvexClientProvider>
                  <TooltipProvider delayDuration={350} skipDelayDuration={200}>
                    <a href="#main" className="skip-link">
                      Skip to content
                    </a>
                    {children}
                    <SiteFooter />
                    <Toaster />
                    <Analytics />
                  </TooltipProvider>
                </ConvexClientProvider>
              </StackTheme>
            </StackProvider>
          </React.Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
