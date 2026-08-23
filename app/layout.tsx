import React from 'react'
import { StackProvider, StackTheme } from '@stackframe/stack'
import { stackClientApp } from '../stack/client'
import { ConvexClientProvider } from '@/components/convex-client-provider'
import { ThemeProvider } from '@/components/theme-provider'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { SiteFooter } from '@/components/site-footer'
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
    default: APP_NAME,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <React.Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <StackProvider app={stackClientApp}>
              <StackTheme>
                <ConvexClientProvider>
                  <a href="#main" className="skip-link">
                    Skip to content
                  </a>
                  {children}
                  <SiteFooter />
                  <Toaster />
                  <Analytics />
                </ConvexClientProvider>
              </StackTheme>
            </StackProvider>
          </React.Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
