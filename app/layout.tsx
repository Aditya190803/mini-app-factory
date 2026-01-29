import React from "react"
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackClientApp } from "../stack/client";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './fonts.css'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Mini App Factory',
  description: 'Generate production-ready static websites from natural language descriptions',
  icons: {
    icon: []
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <StackProvider app={stackClientApp}>
          <StackTheme>
            <ConvexClientProvider>
              {children}
              <Analytics />
            </ConvexClientProvider>
          </StackTheme>
        </StackProvider>
      </body>
    </html>
  )
}
